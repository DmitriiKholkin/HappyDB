import type { ConnectionManager } from "../../connection/ConnectionManager";
import type {
  ExtensionMessage,
  WebviewMessage,
  FetchTableMessage,
  UpdateRowMessage,
  InsertRowMessage,
  DeleteRowMessage,
  GetTableDdlMessage,
  GetTableIndexesMessage,
  GetTableForeignKeysMessage,
  TableDdlMessage,
  TableIndexesMessage,
  TableForeignKeysMessage,
} from "../messages";

export function registerTableDataHandlers(
  connectionManager: ConnectionManager,
): Map<string, (msg: ExtensionMessage) => Promise<WebviewMessage | undefined>> {
  const handlers = new Map<
    string,
    (msg: ExtensionMessage) => Promise<WebviewMessage | undefined>
  >();

  handlers.set("fetchTable", async (msg) => {
    const { connectionName, schema, table, page, pageSize, sort, filters } =
      msg as FetchTableMessage;
    const adapter = connectionManager.getAdapter(connectionName);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      const result = await adapter.getTableData(
        schema,
        table,
        page,
        pageSize,
        sort,
        filters,
      );
      return {
        type: "tableData",
        columns: result.columns,
        rows: result.rows,
        total: result.total,
      };
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("updateRow", async (msg) => {
    const { connectionName, schema, table, pk, changes } =
      msg as UpdateRowMessage;
    const adapter = connectionManager.getAdapter(connectionName);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      await adapter.updateRow(schema, table, pk, changes);
      // Return success — the webview can re-fetch if needed
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("insertRow", async (msg) => {
    const { connectionName, schema, table, row } = msg as InsertRowMessage;
    const adapter = connectionManager.getAdapter(connectionName);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      await adapter.insertRow(schema, table, row);
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("deleteRow", async (msg) => {
    const { connectionName, schema, table, pk } = msg as DeleteRowMessage;
    const adapter = connectionManager.getAdapter(connectionName);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      await adapter.deleteRow(schema, table, pk);
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("getTableDdl", async (msg) => {
    const { connectionName, schema, table } = msg as GetTableDdlMessage;
    const adapter = connectionManager.getAdapter(connectionName);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      const ddl = await adapter.getTableDdl(schema, table);
      return { type: "tableDdl", ddl: ddl } as TableDdlMessage;
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("getTableIndexes", async (msg) => {
    const { connectionName, schema, table } = msg as GetTableIndexesMessage;
    const adapter = connectionManager.getAdapter(connectionName);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      const indexes = await adapter.getIndexes(schema, table);
      return { type: "tableIndexes", indexes } as TableIndexesMessage;
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("getTableForeignKeys", async (msg) => {
    const { connectionName, schema, table } = msg as GetTableForeignKeysMessage;
    const adapter = connectionManager.getAdapter(connectionName);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      const foreignKeys = await adapter.getForeignKeys(schema, table);
      return { type: "tableForeignKeys", foreignKeys } as TableForeignKeysMessage;
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  return handlers;
}
