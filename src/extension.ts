import * as vscode from "vscode";
import { registerCommands } from "./commands/registerCommands";
import { ConnectionManager } from "./connection/ConnectionManager";
import { ConnectionTreeProvider } from "./providers/ConnectionTreeProvider";
import { DbEditorProvider } from "./providers/DbEditorProvider";

export function activate(context: vscode.ExtensionContext): void {
  console.log("[HappyDB] Activating extension...");

  // Initialize ConnectionManager with SecretStorage
  const connectionManager = new ConnectionManager(context.secrets);

  // Initialize TreeView provider
  const treeProvider = new ConnectionTreeProvider(connectionManager);
  const treeView = vscode.window.createTreeView("happydb.connectionsView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  // Initialize Webview editor provider
  const editorProvider = new DbEditorProvider(context, connectionManager);

  // Register all commands
  registerCommands(context, connectionManager, treeProvider, editorProvider);

  // Register disposables
  context.subscriptions.push(
    treeView,
    { dispose: () => treeProvider.dispose() },
    { dispose: () => editorProvider.dispose() },
    { dispose: () => connectionManager.dispose() },
  );

  console.log("[HappyDB] Extension activated successfully.");
}

export function deactivate(): void {
  console.log("[HappyDB] Extension deactivated.");
}
