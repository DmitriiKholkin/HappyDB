import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVscodeApi } from "../../hooks/useVscodeApi";
import { type ConnectionConfig, useDbStore } from "../../store/useDbStore";
import { Icon } from "../common/Icon";

type DbType = "postgresql" | "mssql" | "sqlite" | "mysql";

export const ConnectionForm: React.FC = () => {
  const { postMessage, onMessage } = useVscodeApi();
  const editingName = useDbStore((s) => s.editingConnectionName);
  const connections = useDbStore((s) => s.connections);
  const setStatusMessage = useDbStore((s) => s.setStatusMessage);
  const setEditingConnectionName = useDbStore((s) => s.setEditingConnectionName);

  const editingConn = editingName
    ? connections.find((c) => c.name === editingName)
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
  const [trustServerCertificate, setTrustServerCertificate] = useState(
    (editingConn as any)?.trustServerCertificate || false,
  );
  const [filePath, setFilePath] = useState(editingConn?.filePath || "");

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const isSaving = useRef(false);

  // Listen for test results
  useEffect(() => {
    return onMessage((msg: unknown) => {
      const message = msg as {
        type: string;
        success?: boolean;
        error?: string;
        message?: string;
      };
      if (message.type === "testConnectionResult") {
        setTesting(false);
        setStatusMessage(
          message.success
            ? "Connection successful!"
            : message.error || "Connection failed",
          !message.success,
        );
      }
      if (message.type === "connectionsList") {
        if (isSaving.current) {
          setStatusMessage("Connections updated", false);
          setEditingConnectionName(name);
        }
        setSaving(false);
        isSaving.current = false;
      }
      if (message.type === "error") {
        setSaving(false);
        isSaving.current = false;
        setStatusMessage(
          message.message || message.error || "Unknown error",
          true,
        );
      }
    });
  }, [onMessage, setStatusMessage, name, setEditingConnectionName]);

  // Sync state with editingConn when it loads
  useEffect(() => {
    if (editingConn) {
      setDbType(editingConn.type);
      setName(editingConn.name || "");
      setHost(editingConn.host || "localhost");
      setPort(
        editingConn.port ||
          (editingConn.type === "mssql"
            ? 1433
            : editingConn.type === "mysql"
              ? 3306
              : 5432),
      );
      setDatabase(editingConn.database || "");
      setUsername(editingConn.username || "");
      setPassword(editingConn.password || "");
      setSsl(editingConn.ssl || false);
      setTrustServerCertificate(
        (editingConn as any).trustServerCertificate || false,
      );
      setFilePath(editingConn.filePath || "");
    }
  }, [editingConn]);

  // Update default port when DB type changes
  useEffect(() => {
    if (!editingConn) {
      setPort(dbType === "mssql" ? 1433 : dbType === "mysql" ? 3306 : 5432);
    }
  }, [dbType, editingConn]);

  const buildConfig = useCallback((): ConnectionConfig => {
    const base = {
      name: name || `${dbType} connection`,
      type: dbType,
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
      trustServerCertificate:
        dbType === "mssql" ? trustServerCertificate : undefined,
    } as ConnectionConfig;
  }, [
    name,
    dbType,
    host,
    port,
    database,
    username,
    password,
    ssl,
    trustServerCertificate,
    filePath,
  ]);

  const handleTest = () => {
    setTesting(true);
    setStatusMessage(null);
    postMessage({
      type: "testConnection",
      config: buildConfig(),
      password: dbType !== "sqlite" ? password : undefined,
    });
  };

  const handleSave = () => {
    setSaving(true);
    isSaving.current = true;
    setStatusMessage(null); // Clear previous errors
    postMessage({
      type: "saveConnection",
      config: buildConfig(),
      password: dbType !== "sqlite" ? password : undefined,
      originalName: editingName || undefined,
    });
  };

  return (
    <div className="connection-form">
      <h3>{editingName ? "Edit Connection" : "New Connection"}</h3>

      <div className="db-type-selector">
        <button
          className={`db-type-btn ${dbType === "postgresql" ? "selected" : ""}`}
          onClick={() => setDbType("postgresql")}
          type="button"
        >
          <Icon name="database" /> PostgreSQL
        </button>
        <button
          className={`db-type-btn ${dbType === "mssql" ? "selected" : ""}`}
          onClick={() => setDbType("mssql")}
          type="button"
        >
          <Icon name="database" /> MSSQL
        </button>
        <button
          className={`db-type-btn ${dbType === "mysql" ? "selected" : ""}`}
          onClick={() => setDbType("mysql")}
          type="button"
        >
          <Icon name="database" /> MySQL
        </button>
        <button
          className={`db-type-btn ${dbType === "sqlite" ? "selected" : ""}`}
          onClick={() => setDbType("sqlite")}
          type="button"
        >
          <Icon name="database" /> SQLite
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
            <label htmlFor="ssl">
              {dbType === "mssql" ? "Encrypt (SSL)" : "Use SSL"}
            </label>
          </div>

          {dbType === "mssql" && (
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="trustServerCertificate"
                checked={trustServerCertificate}
                onChange={(e) => setTrustServerCertificate(e.target.checked)}
              />
              <label htmlFor="trustServerCertificate">
                Trust Server Certificate
              </label>
            </div>
          )}
        </>
      )}

      <div className="btn-group">
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={testing}
          type="button"
        >
          {testing ? (
            <>
              <span className="spinner" /> Testing...
            </>
          ) : (
            <>
              <Icon name="plug" /> Test Connection
            </>
          )}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          type="button"
        >
          {saving ? (
            "Saving..."
          ) : (
            <>
              <Icon name="save" /> Save
            </>
          )}
        </button>
      </div>
    </div>
  );
};
