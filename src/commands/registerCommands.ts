import * as vscode from "vscode";
import type { ConnectionManager } from "../connection/ConnectionManager";
import type { ConnectionTreeProvider } from "../providers/ConnectionTreeProvider";
import type { DbEditorProvider } from "../providers/DbEditorProvider";
import type { DbTreeItem } from "../providers/DbTreeItem";

export function registerCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  treeProvider: ConnectionTreeProvider,
  editorProvider: DbEditorProvider,
): void {
  // Add Connection
  context.subscriptions.push(
    vscode.commands.registerCommand("happydb.addConnection", () => {
      editorProvider.openConnectionForm();
    }),
  );

  // Edit Connection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "happydb.editConnection",
      (item: DbTreeItem) => {
        editorProvider.openConnectionForm(item.data.connectionId);
      },
    ),
  );

  // Delete Connection
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "happydb.deleteConnection",
      async (item: DbTreeItem) => {
        const conn = connectionManager
          .getConnections()
          .find((c) => c.id === item.data.connectionId);
        const answer = await vscode.window.showWarningMessage(
          `Delete connection "${conn?.name || item.data.connectionId}"?`,
          { modal: true },
          "Delete",
        );
        if (answer === "Delete") {
          await connectionManager.deleteConnection(item.data.connectionId);
          vscode.window.showInformationMessage("Connection deleted.");
        }
      },
    ),
  );

  // Connect
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "happydb.connect",
      async (item: DbTreeItem) => {
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Connecting to ${item.label}...`,
            },
            async () => {
              await connectionManager.connect(item.data.connectionId);
            },
          );
          vscode.window.showInformationMessage(`Connected to ${item.label}`);
        } catch (err) {
          vscode.window.showErrorMessage(
            `Connection failed: ${(err as Error).message}`,
          );
        }
      },
    ),
  );

  // Disconnect
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "happydb.disconnect",
      async (item: DbTreeItem) => {
        await connectionManager.disconnect(item.data.connectionId);
        vscode.window.showInformationMessage(`Disconnected from ${item.label}`);
      },
    ),
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand("happydb.refreshConnection", () => {
      treeProvider.refresh();
    }),
  );

  // Open Table
  context.subscriptions.push(
    vscode.commands.registerCommand("happydb.openTable", (item: DbTreeItem) => {
      editorProvider.openTableView(
        item.data.connectionId,
        item.data.schema || "public",
        item.data.name || (item.label as string),
      );
    }),
  );

  // Open Table Structure
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "happydb.openStructure",
      (item: DbTreeItem) => {
        editorProvider.openTableStructure(
          item.data.connectionId,
          item.data.schema || "public",
          item.data.name || (item.label as string),
        );
      },
    ),
  );

  // New SQL Query
  context.subscriptions.push(
    vscode.commands.registerCommand("happydb.newQuery", (item: DbTreeItem) => {
      editorProvider.openQueryEditor(item.data.connectionId);
    }),
  );

  // Open Database Object (Table, View, Function)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "happydb.openObject",
      async (item: DbTreeItem) => {
        if (item.itemType === "table" || item.itemType === "view") {
          vscode.commands.executeCommand("happydb.openTable", item);
        } else if (item.itemType === "function") {
          const adapter = connectionManager.getAdapter(item.data.connectionId);
          if (!adapter) {
            vscode.window.showErrorMessage("Not connected to database");
            return;
          }

          try {
            await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `Loading definition for ${item.label}...`,
              },
              async () => {
                const ddl = await adapter.getRoutineDdl(
                  item.data.schema || "public",
                  item.data.name || (item.label as string),
                  item.data.type || "function",
                );
                editorProvider.openQueryEditor(item.data.connectionId, ddl);
              },
            );
          } catch (err) {
            vscode.window.showErrorMessage(
              `Failed to load definition: ${(err as Error).message}`,
            );
          }
        }
      },
    ),
  );
 
  // Show View Code
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "happydb.showViewCode",
      async (item: DbTreeItem) => {
        const adapter = connectionManager.getAdapter(item.data.connectionId);
        if (!adapter) {
          vscode.window.showErrorMessage("Not connected to database");
          return;
        }

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Loading code for ${item.label}...`,
            },
            async () => {
              const ddl = await adapter.getTableDdl(
                item.data.schema || "public",
                item.data.name || (item.label as string),
              );
              editorProvider.openQueryEditor(item.data.connectionId, ddl);
            },
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to load code: ${(err as Error).message}`,
          );
        }
      },
    ),
  );
}
