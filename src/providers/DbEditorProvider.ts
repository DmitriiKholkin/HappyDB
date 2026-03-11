import * as path from "node:path";
import * as vscode from "vscode";
import type { ConnectionManager } from "../connection/ConnectionManager";
import { registerConnectionHandlers } from "../ipc/handlers/connectionHandler";
import { registerQueryHandlers } from "../ipc/handlers/queryHandler";
import { registerTableDataHandlers } from "../ipc/handlers/tableDataHandler";
import { MessageBus } from "../ipc/MessageBus";

/**
 * Manages WebviewPanels for table views, query editors, and connection forms.
 */
export class DbEditorProvider {
  private panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private context: vscode.ExtensionContext,
    private connectionManager: ConnectionManager,
  ) {}

  openConnectionForm(connectionId?: string): void {
    const panelKey = connectionId
      ? `conn-form-${connectionId}`
      : "conn-form-new";
    this.openWebviewPanel(
      panelKey,
      connectionId ? "Edit Connection" : "New Connection",
      {
        type: "init",
        view: "connectionForm",
        connectionId,
      },
    );
  }

  openTableView(connectionId: string, schema: string, table: string): void {
    const panelKey = `table-${connectionId}-${schema}-${table}`;
    this.openWebviewPanel(panelKey, `${table}`, {
      type: "init",
      view: "tableView",
      connectionId,
      schema,
      table,
    });
  }

  openQueryEditor(connectionId: string, initialSql?: string): void {
    const panelKey = `query-${connectionId}-${Date.now()}`;
    const conn = this.connectionManager
      .getConnections()
      .find((c) => c.id === connectionId);
    this.openWebviewPanel(panelKey, `SQL — ${conn?.name || "Query"}`, {
      type: "init",
      view: "queryEditor",
      connectionId,
      initialSql,
    });
  }

  openTableStructure(
    connectionId: string,
    schema: string,
    table: string,
  ): void {
    const panelKey = `structure-${connectionId}-${schema}-${table}`;
    this.openWebviewPanel(panelKey, `${table} — Structure`, {
      type: "init",
      view: "tableStructure",
      connectionId,
      schema,
      table,
    });
  }

  private openWebviewPanel(
    key: string,
    title: string,
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

    // Set HTML content
    panel.webview.html = this.getWebviewContent(panel.webview);

    // Set up message bus
    const messageBus = new MessageBus();
    this.registerHandlers(messageBus);

    const subscription = messageBus.subscribe(panel);

    // Register simple ready handler
    messageBus.on("ready", async () => {
      this.sendToWebview(panel, initMessage);
    });

    // Clean up
    panel.onDidDispose(() => {
      this.panels.delete(key);
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

  private sendToWebview(panel: vscode.WebviewPanel, message: any): void {
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
