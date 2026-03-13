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
    const { config, password, originalName } = msg as SaveConnectionMessage;
    
    try {
      if (originalName) {
        await connectionManager.updateConnection(originalName, config, password);
      } else {
        await connectionManager.addConnection(config, password);
      }
      const updatedConnections = connectionManager.getConnections();
      return { type: "connectionsList", connections: updatedConnections };
    } catch (err) {
      return { type: "error", message: (err as Error).message };
    }
  });

  handlers.set("deleteConnection", async (msg) => {
    const { connectionName } = msg as DeleteConnectionMessage;
    await connectionManager.deleteConnection(connectionName);
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
    const { connectionName } = msg as ConnectMessage;
    try {
      await connectionManager.connect(connectionName);
      return { type: "connectionStatus", id: connectionName, status: "ok" };
    } catch (err) {
      return {
        type: "connectionStatus",
        id: connectionName,
        status: "error",
        error: (err as Error).message,
      };
    }
  });

  handlers.set("disconnect", async (msg) => {
    const { connectionName } = msg as DisconnectMessage;
    await connectionManager.disconnect(connectionName);
    return { type: "connectionStatus", id: connectionName, status: "ok" };
  });

  return handlers;
}
