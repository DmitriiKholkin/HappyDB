import * as vscode from "vscode";
import type { ConnectionConfig } from "../connection/ConnectionConfig";
import type { ConnectionManager } from "../connection/ConnectionManager";
import { DbTreeItem, type DbTreeItemType } from "./DbTreeItem";

export class ConnectionTreeProvider
  implements vscode.TreeDataProvider<DbTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    DbTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private connectionManager: ConnectionManager) {
    // Auto-refresh when connections change
    connectionManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DbTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DbTreeItem): Promise<DbTreeItem[]> {
    if (!element) {
      // Root level: show all connections
      return this.getConnectionNodes();
    }

    switch (element.itemType) {
      case "connection-connected":
        return this.getSchemaNodes(element.data.connectionId);
      case "connection-disconnected":
        return [];
      case "schema":
        return this.getCategoryNodes(
          element.data.connectionId,
          element.data.schema!,
        );
      case "category":
        return this.getObjectNodes(element);
      default:
        return [];
    }
  }

  private getConnectionNodes(): DbTreeItem[] {
    const connections = this.connectionManager.getConnections();
    return connections.map((conn) => {
      const isConnected = this.connectionManager.isConnected(conn.id);
      const itemType: DbTreeItemType = isConnected
        ? "connection-connected"
        : "connection-disconnected";
      const state = isConnected
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None;

      const item = new DbTreeItem(
        this.getConnectionLabel(conn),
        itemType,
        { connectionId: conn.id },
        state,
      );
      item.description = conn.type;
      return item;
    });
  }

  private getConnectionLabel(conn: ConnectionConfig): string {
    if (conn.type === "sqlite") {
      return conn.name || conn.filePath.split("/").pop() || "SQLite";
    }
    return conn.name || `${conn.host}:${conn.port}/${conn.database}`;
  }

  private async getSchemaNodes(connectionId: string): Promise<DbTreeItem[]> {
    try {
      const adapter = this.connectionManager.getAdapter(connectionId);
      if (!adapter) {
        return [];
      }

      const schemas = await adapter.getSchemas();

      return schemas.map(
        (schema) =>
          new DbTreeItem(
            schema,
            "schema",
            { connectionId, schema },
            vscode.TreeItemCollapsibleState.Collapsed,
          ),
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to load schemas: ${(err as Error).message}`,
      );
      return [];
    }
  }

  private getCategoryNodes(connectionId: string, schema: string): DbTreeItem[] {
    return [
      new DbTreeItem(
        "Tables",
        "category",
        { connectionId, schema, name: "tables" },
        vscode.TreeItemCollapsibleState.Collapsed,
      ),
      new DbTreeItem(
        "Views",
        "category",
        { connectionId, schema, name: "views" },
        vscode.TreeItemCollapsibleState.Collapsed,
      ),
      new DbTreeItem(
        "Functions",
        "category",
        { connectionId, schema, name: "functions" },
        vscode.TreeItemCollapsibleState.Collapsed,
      ),
    ];
  }

  private async getObjectNodes(element: DbTreeItem): Promise<DbTreeItem[]> {
    const { connectionId, schema, name: category } = element.data;
    const adapter = this.connectionManager.getAdapter(connectionId);
    if (!adapter || !schema || !category) {
      return [];
    }

    try {
      const names: string[] = [];
      const itemType: DbTreeItemType = "table";

      switch (category) {
        case "tables": {
          const tables = await adapter.getTables(schema);
          return tables.map(
            (n) =>
              new DbTreeItem(
                n,
                "table",
                { connectionId, schema, name: n },
                vscode.TreeItemCollapsibleState.None,
              ),
          );
        }
        case "views": {
          const views = await adapter.getViews(schema);
          return views.map(
            (n) =>
              new DbTreeItem(
                n,
                "view",
                { connectionId, schema, name: n },
                vscode.TreeItemCollapsibleState.None,
              ),
          );
        }
        case "functions": {
          const funcs = await adapter.getFunctions(schema);
          return funcs.map(
            (r) =>
              new DbTreeItem(
                r.name,
                "function",
                { connectionId, schema, name: r.name, type: r.type },
                vscode.TreeItemCollapsibleState.None,
              ),
          );
        }
      }

      return [];
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to load ${category}: ${(err as Error).message}`,
      );
      return [];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
