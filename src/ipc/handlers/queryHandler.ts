import { ConnectionManager } from "../../connection/ConnectionManager";
import {
  ExtensionMessage,
  WebviewMessage,
  QueryMessage,
  GetSchemaMessage,
  GetTableDdlMessage,
} from "../messages";

export function registerQueryHandlers(
  connectionManager: ConnectionManager,
): Map<string, (msg: ExtensionMessage) => Promise<WebviewMessage | void>> {
  const handlers = new Map<
    string,
    (msg: ExtensionMessage) => Promise<WebviewMessage | void>
  >();

  handlers.set("query", async (msg) => {
    const { connectionId, sql } = msg as QueryMessage;
    const adapter = connectionManager.getAdapter(connectionId);
    if (!adapter) {
      return { type: "queryError", message: "Not connected to database" };
    }

    try {
      const result = await adapter.query(sql);
      return {
        type: "queryResult",
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        duration: result.duration,
      };
    } catch (err) {
      return {
        type: "queryError",
        message: (err as Error).message,
        detail: (err as Error).stack,
      };
    }
  });

  handlers.set("getSchema", async (msg) => {
    const { connectionId } = msg as GetSchemaMessage;
    const adapter = connectionManager.getAdapter(connectionId);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      const schema = await adapter.getSchema();
      return { type: "schemaLoaded", schema };
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("getTableDdl", async (msg) => {
    const { connectionId, schema, table } = msg as GetTableDdlMessage;
    const adapter = connectionManager.getAdapter(connectionId);
    if (!adapter) {
      return { type: "error", message: "Not connected to database" };
    }

    try {
      const ddl = await adapter.getTableDdl(schema, table);
      return { type: "tableDdl", ddl };
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  return handlers;
}
