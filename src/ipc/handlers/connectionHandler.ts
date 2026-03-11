import { ConnectionManager } from "../../connection/ConnectionManager";
import { ExtensionMessage, WebviewMessage } from "../messages";
import {
  SaveConnectionMessage,
  DeleteConnectionMessage,
  TestConnectionMessage,
  ConnectMessage,
  DisconnectMessage,
} from "../messages";

export function registerConnectionHandlers(
  connectionManager: ConnectionManager,
): Map<string, (msg: ExtensionMessage) => Promise<WebviewMessage | void>> {
  const handlers = new Map<
    string,
    (msg: ExtensionMessage) => Promise<WebviewMessage | void>
  >();

  handlers.set("getConnections", async () => {
    const connections = connectionManager.getConnections();
    return { type: "connectionsList", connections };
  });

  handlers.set("saveConnection", async (msg) => {
    const { config, password } = msg as SaveConnectionMessage;
    const existing = connectionManager
      .getConnections()
      .find((c) => c.id === config.id);
    if (existing) {
      await connectionManager.updateConnection(config, password);
    } else {
      await connectionManager.addConnection(config, password);
    }
    const connections = connectionManager.getConnections();
    return { type: "connectionsList", connections };
  });

  handlers.set("deleteConnection", async (msg) => {
    const { connectionId } = msg as DeleteConnectionMessage;
    await connectionManager.deleteConnection(connectionId);
    const connections = connectionManager.getConnections();
    return { type: "connectionsList", connections };
  });

  handlers.set("testConnection", async (msg) => {
    const { config, password } = msg as TestConnectionMessage;
    try {
      await connectionManager.testConnection(config, password);
      return { type: "testConnectionResult", success: true };
    } catch (err) {
      return {
        type: "testConnectionResult",
        success: false,
        error: (err as Error).message,
      };
    }
  });

  handlers.set("connect", async (msg) => {
    const { connectionId } = msg as ConnectMessage;
    try {
      await connectionManager.connect(connectionId);
      return { type: "connectionStatus", id: connectionId, status: "ok" };
    } catch (err) {
      return {
        type: "connectionStatus",
        id: connectionId,
        status: "error",
        error: (err as Error).message,
      };
    }
  });

  handlers.set("disconnect", async (msg) => {
    const { connectionId } = msg as DisconnectMessage;
    await connectionManager.disconnect(connectionId);
    return { type: "connectionStatus", id: connectionId, status: "ok" };
  });

  return handlers;
}
