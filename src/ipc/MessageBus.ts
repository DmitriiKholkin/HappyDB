import * as vscode from "vscode";
import { ExtensionMessage, WebviewMessage } from "./messages";

export type MessageHandler = (
  message: ExtensionMessage,
) => Promise<WebviewMessage | void>;

/**
 * Typed message bus for Extension ↔ Webview communication.
 */
export class MessageBus {
  private handlers = new Map<string, MessageHandler>();

  /**
   * Register a handler for a specific message type.
   */
  on(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Subscribe to webview messages and route them to registered handlers.
   * Responses are sent back to the webview.
   */
  subscribe(panel: vscode.WebviewPanel): vscode.Disposable {
    return panel.webview.onDidReceiveMessage(
      async (message: ExtensionMessage) => {
        const handler = this.handlers.get(message.type);

        if (!handler) {
          console.warn(
            `[MessageBus] No handler for message type: ${message.type}`,
          );
          this.send(panel, {
            type: "error",
            message: `Unknown message type: ${message.type}`,
          });
          return;
        }

        try {
          const response = await handler(message);
          if (response) {
            this.send(panel, response);
          }
        } catch (err) {
          console.error(`[MessageBus] Error handling ${message.type}:`, err);
          this.send(panel, {
            type: "error",
            message: (err as Error).message,
          });
        }
      },
    );
  }

  /**
   * Send a message to the webview.
   */
  send(panel: vscode.WebviewPanel, message: WebviewMessage): void {
    panel.webview.postMessage(message);
  }
}
