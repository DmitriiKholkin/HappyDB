import type React from "react";
import { useEffect } from "react";
import { ConnectionForm } from "./components/connection/ConnectionForm";
import { DataGrid } from "./components/grid/DataGrid";
import { TableStructure } from "./components/schema/TableStructure";
import { QueryEditor } from "./components/sql-editor/QueryEditor";
import { useVscodeApi } from "./hooks/useVscodeApi";
import { useDbStore, type ViewType } from "./store/useDbStore";

interface InitMessage {
  type: "init";
  view: ViewType;
  connectionName?: string;
  schema?: string;
  table?: string;
  initialSql?: string;
}

const App: React.FC = () => {
  const { onMessage } = useVscodeApi();
  const activeView = useDbStore((s) => s.activeView);
  const setActiveView = useDbStore((s) => s.setActiveView);
  const setCurrentContext = useDbStore((s) => s.setCurrentContext);
  const setEditingConnectionName = useDbStore(
    (s) => s.setEditingConnectionName,
  );
  const setConnections = useDbStore((s) => s.setConnections);
  const statusMessage = useDbStore((s) => s.statusMessage);
  const isStatusError = useDbStore((s) => s.isStatusError);

  useEffect(() => {
    const unsubscribe = onMessage((msg: unknown) => {
      const message = msg as { type: string } & Record<string, unknown>;

      switch (message.type) {
        case "init": {
          const init = message as unknown as InitMessage;
          setActiveView(init.view);
          if (init.connectionName) {
            setCurrentContext(init.connectionName, init.schema, init.table);
          }
          if (init.view === "connectionForm") {
            setEditingConnectionName(init.connectionName ?? null);
          }
          if (init.view === "queryEditor" && init.initialSql) {
            const setQueryState = useDbStore.getState().setQueryState;
            setQueryState({ sql: init.initialSql });
          }
          break;
        }
        case "connectionsList":
          setConnections(message.connections as never);
          break;
      }
    });

    return unsubscribe;
  }, [
    onMessage,
    setActiveView,
    setCurrentContext,
    setEditingConnectionName,
    setConnections,
  ]);

  return (
    <div className="app-container">
      <div className="content-area">
        {activeView === "welcome" && <WelcomeView />}
        {activeView === "connectionForm" && <ConnectionForm />}
        {activeView === "tableView" && <DataGrid />}
        {activeView === "queryEditor" && <QueryEditor />}
        {activeView === "tableStructure" && <TableStructure />}
      </div>
      {statusMessage && (
        <div className={`status-bar ${isStatusError ? "error" : "success"}`}>
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
};

const WelcomeView: React.FC = () => (
  <div className="welcome">
    <div className="icon-large">🗄️</div>
    <h2>HappyDB</h2>
    <p>
      Manage your databases directly in VSCode.
      <br />
      Add a connection using the <strong>+</strong> button in the sidebar, then
      explore your database objects.
    </p>
    <div style={{ fontSize: 12, color: "var(--fg-secondary)", marginTop: 8 }}>
      <strong>Shortcuts:</strong>
      <br />
      F5 — Execute query
      <br />
      Ctrl+Enter — Execute selection
      <br />
      Double-click cell — Edit inline
    </div>
  </div>
);

export default App;
