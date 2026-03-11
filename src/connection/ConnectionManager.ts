import { v4 as uuidv4 } from "uuid";
import * as vscode from "vscode";
import type { IDbAdapter } from "./adapters/IDbAdapter";
import { MssqlAdapter } from "./adapters/MssqlAdapter";
import { MysqlAdapter } from "./adapters/MysqlAdapter";
import { PostgresAdapter } from "./adapters/PostgresAdapter";
import { SqliteAdapter } from "./adapters/SqliteAdapter";
import { type ConnectionConfig, DbType } from "./ConnectionConfig";

/**
 * Manages database connections: CRUD, SecretStorage for passwords, adapter pool.
 */
export class ConnectionManager {
  private adapters = new Map<string, IDbAdapter>();
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private secretStorage: vscode.SecretStorage) {}

  // ---- Connection config CRUD ----

  getConnections(): ConnectionConfig[] {
    const config = vscode.workspace.getConfiguration("happydb");
    return config.get<ConnectionConfig[]>("connections", []);
  }

  async addConnection(
    conn: ConnectionConfig,
    password?: string,
  ): Promise<void> {
    if (!conn.id) {
      conn.id = uuidv4();
    }
    const connections = this.getConnections();
    connections.push(conn);
    await this.saveConnections(connections);

    if (password) {
      await this.setPassword(conn.id, password);
    }

    this._onDidChange.fire();
  }

  async updateConnection(
    conn: ConnectionConfig,
    password?: string,
  ): Promise<void> {
    const connections = this.getConnections();
    const index = connections.findIndex((c) => c.id === conn.id);
    if (index === -1) {
      throw new Error(`Connection ${conn.id} not found`);
    }
    connections[index] = conn;
    await this.saveConnections(connections);

    if (password !== undefined) {
      await this.setPassword(conn.id, password);
    }

    // If connected, disconnect the old adapter
    if (this.adapters.has(conn.id)) {
      await this.disconnect(conn.id);
    }

    this._onDidChange.fire();
  }

  async deleteConnection(id: string): Promise<void> {
    // Disconnect if connected
    if (this.adapters.has(id)) {
      await this.disconnect(id);
    }

    const connections = this.getConnections().filter((c) => c.id !== id);
    await this.saveConnections(connections);

    // Remove password
    await this.secretStorage.delete(`happydb.password.${id}`);

    this._onDidChange.fire();
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

  async getPassword(connectionId: string): Promise<string> {
    return (
      (await this.secretStorage.get(`happydb.password.${connectionId}`)) || ""
    );
  }

  async setPassword(connectionId: string, password: string): Promise<void> {
    await this.secretStorage.store(
      `happydb.password.${connectionId}`,
      password,
    );
  }

  // ---- Adapter management ----

  getAdapter(connectionId: string): IDbAdapter | undefined {
    return this.adapters.get(connectionId);
  }

  isConnected(connectionId: string): boolean {
    const adapter = this.adapters.get(connectionId);
    return adapter?.isConnected() ?? false;
  }

  async connect(connectionId: string): Promise<IDbAdapter> {
    // If already connected, return existing
    const existing = this.adapters.get(connectionId);
    if (existing?.isConnected()) {
      return existing;
    }

    const config = this.getConnections().find((c) => c.id === connectionId);
    if (!config) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const password = await this.getPassword(connectionId);
    const adapter = this.createAdapter(config, password);

    await adapter.connect();
    this.adapters.set(connectionId, adapter);
    this._onDidChange.fire();

    return adapter;
  }

  async disconnect(connectionId: string): Promise<void> {
    const adapter = this.adapters.get(connectionId);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(connectionId);
      this._onDidChange.fire();
    }
  }

  async testConnection(
    config: ConnectionConfig,
    password?: string,
  ): Promise<boolean> {
    const pw =
      password ??
      (config.type !== "sqlite" ? await this.getPassword(config.id) : "");
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
    // Don't export passwords
    return JSON.stringify(connections, null, 2);
  }

  async importConnections(json: string): Promise<number> {
    const imported = JSON.parse(json) as ConnectionConfig[];
    const existing = this.getConnections();
    let count = 0;

    for (const conn of imported) {
      // Assign new ID to avoid conflicts
      conn.id = uuidv4();
      existing.push(conn);
      count++;
    }

    await this.saveConnections(existing);
    this._onDidChange.fire();
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
