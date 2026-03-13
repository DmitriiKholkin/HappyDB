import * as vscode from "vscode";
import type { IDbAdapter } from "./adapters/IDbAdapter";
import { MssqlAdapter } from "./adapters/MssqlAdapter";
import { MysqlAdapter } from "./adapters/MysqlAdapter";
import { PostgresAdapter } from "./adapters/PostgresAdapter";
import { SqliteAdapter } from "./adapters/SqliteAdapter";
import { type ConnectionConfig, DbType } from "./ConnectionConfig";

export interface ConnectionChangeEvent {
  type: "add" | "update" | "delete";
  oldName?: string;
  newName?: string;
}

/**
 * Manages database connections: CRUD, SecretStorage for passwords, adapter pool.
 */
export class ConnectionManager {
  private adapters = new Map<string, IDbAdapter>();
  private _onDidChange = new vscode.EventEmitter<ConnectionChangeEvent>();
  readonly onDidChange = this._onDidChange.event;

  constructor() {}

  // ---- Connection config CRUD ----

  getConnections(): ConnectionConfig[] {
    const config = vscode.workspace.getConfiguration("happydb");
    return config.get<ConnectionConfig[]>("connections", []);
  }

  async addConnection(
    conn: ConnectionConfig,
    password?: string,
  ): Promise<void> {
    const connections = this.getConnections();
    if (connections.find((c) => c.name === conn.name)) {
      throw new Error(`Connection with name "${conn.name}" already exists`);
    }

    if (password !== undefined) {
      conn.password = password;
    }

    connections.push(conn);
    await this.saveConnections(connections);

    this._onDidChange.fire({ type: "add", newName: conn.name });
  }

  async updateConnection(
    oldName: string,
    conn: ConnectionConfig,
    password?: string,
  ): Promise<void> {
    const connections = this.getConnections();
    const index = connections.findIndex((c) => c.name === oldName);
    if (index === -1) {
      throw new Error(`Connection "${oldName}" not found`);
    }

    if (conn.name !== oldName && connections.find((c) => c.name === conn.name)) {
      throw new Error(`Connection with name "${conn.name}" already exists`);
    }

    if (password !== undefined) {
      conn.password = password;
    } else {
      // Keep old password if not provided
      conn.password = connections[index].password;
    }

    connections[index] = conn;
    await this.saveConnections(connections);

    // If connected, disconnect the old adapter
    if (this.adapters.has(oldName)) {
      await this.disconnect(oldName);
      // If we are renaming, we might want to reconnect automatically or let the user do it.
      // For now, just disconnect as the name (ID) changed.
    }

    this._onDidChange.fire({ type: "update", oldName, newName: conn.name });
  }

  async deleteConnection(name: string): Promise<void> {
    // Disconnect if connected
    if (this.adapters.has(name)) {
      await this.disconnect(name);
    }

    const connections = this.getConnections().filter((c) => c.name !== name);
    await this.saveConnections(connections);

    this._onDidChange.fire({ type: "delete", oldName: name });
  }

  private async saveConnections(
    connections: ConnectionConfig[],
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration("happydb");
    await config.update(
      "connections",
      connections,
      vscode.ConfigurationTarget.Global,
    );
  }

  // ---- Password management ----

  async getPassword(connectionName: string): Promise<string> {
    const connections = this.getConnections();
    const conn = connections.find((c) => c.name === connectionName);
    return conn?.password || "";
  }

  async setPassword(connectionName: string, password: string): Promise<void> {
    const connections = this.getConnections();
    const index = connections.findIndex((c) => c.name === connectionName);
    if (index !== -1) {
      connections[index].password = password;
      await this.saveConnections(connections);
    }
  }

  // ---- Adapter management ----

  getAdapter(connectionName: string): IDbAdapter | undefined {
    return this.adapters.get(connectionName);
  }

  isConnected(connectionName: string): boolean {
    const adapter = this.adapters.get(connectionName);
    return adapter?.isConnected() ?? false;
  }

  async connect(connectionName: string): Promise<IDbAdapter> {
    // If already connected, return existing
    const existing = this.adapters.get(connectionName);
    if (existing?.isConnected()) {
      return existing;
    }

    const config = this.getConnections().find((c) => c.name === connectionName);
    if (!config) {
      throw new Error(`Connection "${connectionName}" not found`);
    }

    const password = await this.getPassword(connectionName);
    const adapter = this.createAdapter(config, password);

    await adapter.connect();
    this.adapters.set(connectionName, adapter);
    this._onDidChange.fire({ type: "update", newName: connectionName });

    return adapter;
  }

  async disconnect(connectionName: string): Promise<void> {
    const adapter = this.adapters.get(connectionName);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(connectionName);
      this._onDidChange.fire({ type: "update", newName: connectionName });
    }
  }

  async testConnection(
    config: ConnectionConfig,
    password?: string,
  ): Promise<boolean> {
    const pw =
      password ??
      (config.type !== "sqlite" ? await this.getPassword(config.name) : "");
    const adapter = this.createAdapter(config, pw);
    return adapter.testConnection();
  }

  private createAdapter(
    config: ConnectionConfig,
    password: string,
  ): IDbAdapter {
    switch (config.type) {
      case "postgresql":
        return new PostgresAdapter(config, password);
      case "mssql":
        return new MssqlAdapter(config, password);
      case "sqlite":
        return new SqliteAdapter(config);
      case "mysql":
        return new MysqlAdapter(config, password);
      default:
        throw new Error(
          `Unsupported database type: ${(config as ConnectionConfig).type}`,
        );
    }
  }

  // ---- Import/Export ----

  exportConnections(): string {
    const connections = this.getConnections();
    // Now we DO export passwords as per user request (stored in settings)
    return JSON.stringify(connections, null, 2);
  }
  
  async importConnections(json: string): Promise<number> {
    const imported = JSON.parse(json) as ConnectionConfig[];
    const existing = this.getConnections();
    let count = 0;

    for (const conn of imported) {
      // If name conflict, append number
      let newName = conn.name;
      let i = 1;
      while (existing.find((c) => c.name === newName)) {
        newName = `${conn.name} (${i++})`;
      }
      conn.name = newName;
      existing.push(conn);
      count++;
    }

    await this.saveConnections(existing);
    this._onDidChange.fire({ type: "add" }); // Batch update
    return count;
  }

  async disconnectAll(): Promise<void> {
    for (const [id] of this.adapters) {
      await this.disconnect(id);
    }
  }

  dispose(): void {
    this.disconnectAll();
    this._onDidChange.dispose();
  }
}
