import { useCallback, useEffect, useRef } from "react";

// VSCode Webview API type
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let vscodeApi: VsCodeApi | null = null;

function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    try {
      vscodeApi = acquireVsCodeApi();
    } catch {
      // Running outside VSCode (dev mode) — provide a mock
      console.warn("[useVscodeApi] Not in VSCode, using mock API");
      vscodeApi = {
        postMessage: (msg) => console.log("[mock postMessage]", msg),
        getState: () => null,
        setState: () => {},
      };
    }
  }
  return vscodeApi;
}

type MessageListener = (message: unknown) => void;

/**
 * Hook for typed communication with the VSCode extension host.
 */
export function useVscodeApi() {
  const api = getVsCodeApi();
  const listenersRef = useRef<MessageListener[]>([]);

  const postMessage = useCallback(
    (message: unknown) => {
      api.postMessage(message);
    },
    [api],
  );

  const onMessage = useCallback((listener: MessageListener) => {
    listenersRef.current.push(listener);
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== listener);
    };
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      for (const listener of listenersRef.current) {
        listener(message);
      }
    };

    window.addEventListener("message", handler);

    // Notify extension that webview is ready
    api.postMessage({ type: "ready" });

    return () => {
      window.removeEventListener("message", handler);
    };
  }, [api]);

  return {
    postMessage,
    onMessage,
    getState: api.getState,
    setState: api.setState,
  };
}
