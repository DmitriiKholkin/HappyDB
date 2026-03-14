import * as path from "node:path";
import * as vscode from "vscode";
import type { ConnectionManager } from "../connection/ConnectionManager";
import { registerConnectionHandlers } from "../ipc/handlers/connectionHandler";
import { registerQueryHandlers } from "../ipc/handlers/queryHandler";
import { registerTableDataHandlers } from "../ipc/handlers/tableDataHandler";
import { MessageBus } from "../ipc/MessageBus";

interface PanelMetadata {
  connectionName?: string;
  type: "connectionForm" | "tableView" | "queryEditor" | "tableStructure";
  schema?: string;
  name?: string;
  suffix?: string;
}

/**
 * Manages WebviewPanels for table views, query editors, and connection forms.
 */
export class DbEditorProvider {
  private panels = new Map<string, vscode.WebviewPanel>();
  private panelMetadata = new Map<vscode.WebviewPanel, PanelMetadata>();

  constructor(
    private context: vscode.ExtensionContext,
    private connectionManager: ConnectionManager,
  ) {
    // Update titles when connections change (e.g., renamed)
    this.connectionManager.onDidChange((e) => {
      if (e?.type === "delete" && e.oldName) {
        // Close all panels associated with the deleted connection
        for (const [panel, metadata] of this.panelMetadata.entries()) {
          if (metadata.connectionName === e.oldName) {
            panel.dispose();
          }
        }
      } else if (
        e?.type === "update" &&
        e.oldName &&
        e.newName &&
        e.oldName !== e.newName
      ) {
        // Close all panels associated with the renamed connection, except the settings form
        for (const [panel, metadata] of this.panelMetadata.entries()) {
          if (metadata.connectionName === e.oldName) {
            if (metadata.type === "connectionForm") {
              // Update metadata with new name so it stays synced
              metadata.connectionName = e.newName;
              metadata.name = e.newName;
            } else {
              panel.dispose();
            }
          }
        }
      }
      this.updateAllTitles();
    });
  }

  private updateAllTitles(): void {
    const connections = this.connectionManager.getConnections();
    for (const [panel, metadata] of this.panelMetadata.entries()) {
      if (metadata.connectionName) {
        // If connection still exists, update its name in title
        const conn = connections.find((c) => c.name === metadata.connectionName);
        if (conn) {
          const newTitle = this.formatTitle(conn.name, metadata);
          if (panel.title !== newTitle) {
            panel.title = newTitle;
          }
        }
      }
    }
  }

  private formatTitle(connectionName: string, metadata: PanelMetadata): string {
    switch (metadata.type) {
      case "connectionForm":
        return `${connectionName} — Settings`;
      case "tableView":
        return `${connectionName}: ${metadata.schema}.${metadata.name}`;
      case "tableStructure":
        return `${connectionName}: ${metadata.schema}.${metadata.name} (Structure)`;
      case "queryEditor":
        return `${connectionName}: ${metadata.name || "SQL"}`;
      default:
        return metadata.name || "HappyDB";
    }
  }

  openConnectionForm(connectionName?: string): void {
    const panelKey = connectionName
      ? `conn-form-${connectionName}`
      : "conn-form-new";

    let title = "New Connection";
    let metadata: PanelMetadata = { type: "connectionForm" };

    if (connectionName) {
      const conn = this.connectionManager
        .getConnections()
        .find((c) => c.name === connectionName);
      if (conn) {
        title = `${conn.name} — Settings`;
        metadata = {
          connectionName,
          type: "connectionForm",
          name: conn.name,
        };
      }
    }

    this.openWebviewPanel(panelKey, title, metadata, {
      type: "init",
      view: "connectionForm",
      connectionName,
    });
  }

  openTableView(connectionName: string, schema: string, table: string): void {
    const panelKey = `table-${connectionName}-${schema}-${table}`;
    const conn = this.connectionManager
      .getConnections()
      .find((c) => c.name === connectionName);
    const connName = conn?.name || connectionName;

    const metadata: PanelMetadata = {
      connectionName,
      type: "tableView",
      schema,
      name: table,
    };

    this.openWebviewPanel(
      panelKey,
      `${connName}: ${schema}.${table}`,
      metadata,
      {
        type: "init",
        view: "tableView",
        connectionName,
        schema,
        table,
      },
    );
  }

  openQueryEditor(
    connectionName: string,
    initialSql?: string,
    customTitle?: string,
  ): void {
    const panelKey = `query-${connectionName}-${Date.now()}`;
    const conn = this.connectionManager
      .getConnections()
      .find((c) => c.name === connectionName);
    const connName = conn?.name || connectionName;

    const metadata: PanelMetadata = {
      connectionName,
      type: "queryEditor",
      name: customTitle,
    };

    this.openWebviewPanel(
      panelKey,
      `${connName}: ${customTitle || "SQL"}`,
      metadata,
      {
        type: "init",
        view: "queryEditor",
        connectionName,
        initialSql,
      },
    );
  }

  openTableStructure(
    connectionName: string,
    schema: string,
    table: string,
  ): void {
    const panelKey = `structure-${connectionName}-${schema}-${table}`;
    const conn = this.connectionManager
      .getConnections()
      .find((c) => c.name === connectionName);
    const connName = conn?.name || connectionName;

    const metadata: PanelMetadata = {
      connectionName,
      type: "tableStructure",
      schema,
      name: table,
    };

    this.openWebviewPanel(
      panelKey,
      `${connName}: ${schema}.${table} (Structure)`,
      metadata,
      {
        type: "init",
        view: "tableStructure",
        connectionName,
        schema,
        table,
      },
    );
  }

  private openWebviewPanel(
    key: string,
    title: string,
    metadata: PanelMetadata,
    initMessage: unknown,
  ): void {
    // Reuse panel if already open
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "happydb.editor",
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(
            path.join(this.context.extensionPath, "dist", "webview"),
          ),
        ],
      },
    );

    // Set icon based on view type
    panel.iconPath = new vscode.ThemeIcon("database");

    this.panelMetadata.set(panel, metadata);

    // Set HTML content
    panel.webview.html = this.getWebviewContent(panel.webview);

    // Set up message bus
    const messageBus = new MessageBus();
    this.registerHandlers(messageBus);

    const subscription = messageBus.subscribe(panel);

    // Register simple ready handler
    messageBus.on("ready", async () => {
      this.sendToWebview(panel, initMessage);
      
      // Also send the initial list of connections
      const connections = this.connectionManager.getConnections();
      this.sendToWebview(panel, { type: "connectionsList", connections });
    });

    // Clean up
    panel.onDidDispose(() => {
      this.panels.delete(key);
      this.panelMetadata.delete(panel);
      subscription.dispose();
    });

    this.panels.set(key, panel);
  }

  private registerHandlers(messageBus: MessageBus): void {
    const connectionHandlers = registerConnectionHandlers(
      this.connectionManager,
    );
    const queryHandlers = registerQueryHandlers(this.connectionManager);
    const tableHandlers = registerTableDataHandlers(this.connectionManager);

    for (const [type, handler] of connectionHandlers) {
      messageBus.on(type, handler);
    }
    for (const [type, handler] of queryHandlers) {
      messageBus.on(type, handler);
    }
    for (const [type, handler] of tableHandlers) {
      messageBus.on(type, handler);
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const distPath = path.join(this.context.extensionPath, "dist", "webview");

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(distPath, "index.js")),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(distPath, "index.css")),
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} data: blob:;
    connect-src ${webview.cspSource};
  ">
  <link rel="stylesheet" href="${styleUri}">
  <title>HappyDB</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private sendToWebview(panel: vscode.WebviewPanel, message: unknown): void {
    panel.webview.postMessage(message);
  }

  dispose(): void {
    for (const [, panel] of this.panels) {
      panel.dispose();
    }
    this.panels.clear();
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
