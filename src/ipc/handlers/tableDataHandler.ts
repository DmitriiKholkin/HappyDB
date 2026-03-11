import { ConnectionManager } from "../../connection/ConnectionManager";
import {
  ExtensionMessage,
  WebviewMessage,
  FetchTableMessage,
  UpdateRowMessage,
  InsertRowMessage,
  DeleteRowMessage,
} from "../messages";

export function registerTableDataHandlers(
  connectionManager: ConnectionManager,
): Map<string, (msg: ExtensionMessage) => Promise<WebviewMessage | void>> {
  const handlers = new Map<
    string,
    (msg: ExtensionMessage) => Promise<WebviewMessage | void>
  >();

  handlers.set("fetchTable", async (msg) => {
    const { connectionId, schema, table, page, pageSize, sort, filters } =
      msg as FetchTableMessage;
    const adapter = connectionManager.getAdapter(connectionId);
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
    const { connectionId, schema, table, pk, changes } =
      msg as UpdateRowMessage;
    const adapter = connectionManager.getAdapter(connectionId);
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
    const { connectionId, schema, table, row } = msg as InsertRowMessage;
    const adapter = connectionManager.getAdapter(connectionId);
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
    const { connectionId, schema, table, pk } = msg as DeleteRowMessage;
    const adapter = connectionManager.getAdapter(connectionId);
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
    const { connectionId, schema, table } = msg as any; // Cast as any or GetTableDdlMessage
    const adapter = connectionManager.getAdapter(connectionId);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      const ddl = await adapter.getTableDdl(schema, table);
      return { type: "tableDdl", ddl: ddl } as any; // Cast back to bypass missing import for TableDdlMessage if strict
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  return handlers;
}
