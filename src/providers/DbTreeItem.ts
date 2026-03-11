import * as vscode from "vscode";

export type DbTreeItemType =
  | "connection-connected"
  | "connection-disconnected"
  | "schema"
  | "category"
  | "table"
  | "view"
  | "function";

export interface DbTreeItemData {
  connectionId: string;
  schema?: string;
  name?: string;
  type?: "function" | "procedure";
}

export class DbTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly itemType: DbTreeItemType,
    public readonly data: DbTreeItemData,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.None,
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;
    this.iconPath = this.getIcon();
    this.tooltip = this.getTooltip();

    // Add default left-click / double-click command for data objects
    if (
      this.itemType === "table" ||
      this.itemType === "view" ||
      this.itemType === "function"
    ) {
      this.command = {
        command: "happydb.openObject",
        title: "Open Object",
        arguments: [this],
      };
    }
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.itemType) {
      case "connection-connected":
        return new vscode.ThemeIcon(
          "database",
          new vscode.ThemeColor("charts.green"),
        );
      case "connection-disconnected":
        return new vscode.ThemeIcon(
          "database",
          new vscode.ThemeColor("disabledForeground"),
        );
      case "schema":
        return new vscode.ThemeIcon("symbol-namespace");
      case "category":
        return new vscode.ThemeIcon("folder");
      case "table":
        return new vscode.ThemeIcon("table");
      case "view":
        return new vscode.ThemeIcon("eye");
      case "function":
        return new vscode.ThemeIcon("symbol-method");
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }

  private getTooltip(): string {
    switch (this.itemType) {
      case "connection-connected":
        return `${this.label} (connected)`;
      case "connection-disconnected":
        return `${this.label} (disconnected)`;
      default:
        return this.label as string;
    }
  }
}
