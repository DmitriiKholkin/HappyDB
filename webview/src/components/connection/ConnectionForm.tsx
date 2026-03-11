import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useVscodeApi } from "../../hooks/useVscodeApi";
import { type ConnectionConfig, useDbStore } from "../../store/useDbStore";

type DbType = "postgresql" | "mssql" | "sqlite" | "mysql";

interface TestResult {
  success: boolean;
  error?: string;
}

export const ConnectionForm: React.FC = () => {
  const { postMessage, onMessage } = useVscodeApi();
  const editingId = useDbStore((s) => s.editingConnectionId);
  const connections = useDbStore((s) => s.connections);

  const editingConn = editingId
    ? connections.find((c) => c.id === editingId)
    : null;

  const [dbType, setDbType] = useState<DbType>(
    editingConn?.type || "postgresql",
  );
  const [name, setName] = useState(editingConn?.name || "");
  const [host, setHost] = useState(editingConn?.host || "localhost");
  const [port, setPort] = useState(
    editingConn?.port ||
      (dbType === "mssql" ? 1433 : dbType === "mysql" ? 3306 : 5432),
  );
  const [database, setDatabase] = useState(editingConn?.database || "");
  const [username, setUsername] = useState(editingConn?.username || "");
  const [password, setPassword] = useState(editingConn?.password || "");
  const [ssl, setSsl] = useState(editingConn?.ssl || false);
  const [filePath, setFilePath] = useState(editingConn?.filePath || "");
  const [color, setColor] = useState(editingConn?.color || "#336791");

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Listen for test results
  useEffect(() => {
    return onMessage((msg: unknown) => {
      const message = msg as {
        type: string;
        success?: boolean;
        error?: string;
      };
      if (message.type === "testConnectionResult") {
        setTesting(false);
        setTestResult({ success: message.success!, error: message.error });
      }
      if (message.type === "connectionsList") {
        setSaving(false);
      }
    });
  }, [onMessage]);

  // Update default port when DB type changes
  useEffect(() => {
    if (!editingConn) {
      setPort(dbType === "mssql" ? 1433 : dbType === "mysql" ? 3306 : 5432);
    }
  }, [dbType, editingConn]);

  const buildConfig = useCallback((): ConnectionConfig => {
    const base = {
      id: editingId || "",
      name: name || `${dbType} connection`,
      type: dbType,
      color,
    };

    if (dbType === "sqlite") {
      return { ...base, type: "sqlite", filePath };
    }

    return {
      ...base,
      type: dbType,
      host,
      port,
      database,
      username,
      password: password || undefined,
      ssl,
    };
  }, [
    editingId,
    name,
    dbType,
    color,
    host,
    port,
    database,
    username,
    password,
    ssl,
    filePath,
  ]);

  const handleTest = () => {
    setTesting(true);
    setTestResult(null);
    postMessage({
      type: "testConnection",
      config: buildConfig(),
      password: dbType !== "sqlite" ? password : undefined,
    });
  };

  const handleSave = () => {
    setSaving(true);
    postMessage({
      type: "saveConnection",
      config: buildConfig(),
      password: dbType !== "sqlite" ? password : undefined,
    });
  };

  return (
    <div className="connection-form">
      <h3>{editingId ? "Edit Connection" : "New Connection"}</h3>

      <div className="db-type-selector">
        <button
          className={`db-type-btn ${dbType === "postgresql" ? "selected" : ""}`}
          onClick={() => setDbType("postgresql")}
        >
          🐘 PostgreSQL
        </button>
        <button
          className={`db-type-btn ${dbType === "mssql" ? "selected" : ""}`}
          onClick={() => setDbType("mssql")}
        >
          🔷 MSSQL
        </button>
        <button
          className={`db-type-btn ${dbType === "mysql" ? "selected" : ""}`}
          onClick={() => setDbType("mysql")}
        >
          🐬 MySQL
        </button>
        <button
          className={`db-type-btn ${dbType === "sqlite" ? "selected" : ""}`}
          onClick={() => setDbType("sqlite")}
        >
          📁 SQLite
        </button>
      </div>

      <div className="form-group">
        <label>Connection Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Database"
        />
      </div>

      {dbType === "sqlite" ? (
        <div className="form-group">
          <label>File Path</label>
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="/path/to/database.db"
          />
        </div>
      ) : (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="localhost"
              />
            </div>
            <div className="form-group" style={{ maxWidth: 120 }}>
              <label>Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Database</label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="mydb"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="user"
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="checkbox-group">
            <input
              type="checkbox"
              id="ssl"
              checked={ssl}
              onChange={(e) => setSsl(e.target.checked)}
            />
            <label htmlFor="ssl">Use SSL</label>
          </div>
        </>
      )}

      <div className="form-group" style={{ marginTop: 12 }}>
        <label>Color tag</label>
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#336791"
          style={{ maxWidth: 120 }}
        />
      </div>

      {testResult && (
        <div
          className={`test-result ${testResult.success ? "success" : "error"}`}
        >
          {testResult.success
            ? "✅ Connection successful!"
            : `❌ ${testResult.error || "Connection failed"}`}
        </div>
      )}

      <div className="btn-group">
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? (
            <>
              <span className="spinner" /> Testing...
            </>
          ) : (
            "🔌 Test Connection"
          )}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "💾 Save"}
        </button>
      </div>
    </div>
  );
};
