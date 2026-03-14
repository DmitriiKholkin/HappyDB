import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVscodeApi } from "../../hooks/useVscodeApi";
import { type ColumnInfo, useDbStore } from "../../store/useDbStore";

interface QueryHistoryItem {
  sql: string;
  timestamp: number;
  duration: number;
  rowCount: number;
  success: boolean;
  error?: string;
}

import { Icon } from "../common/Icon";

// ────────────────────────────────────────────────────────────────────────────

export const QueryEditor: React.FC = () => {
  const { postMessage, onMessage } = useVscodeApi();
  const connectionName = useDbStore((s) => s.currentConnectionName);
  const queryState = useDbStore((s) => s.queryState);
  const setQueryState = useDbStore((s) => s.setQueryState);
  const setStatusMessage = useDbStore((s) => s.setStatusMessage);

  const [sql, setSql] = useState(queryState.sql || "");
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.35);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Listen for results
  useEffect(() => {
    return onMessage((msg: unknown) => {
      const message = msg as {
        type: string;
        columns?: ColumnInfo[];
        rows?: Record<string, unknown>[];
        rowCount?: number;
        duration?: number;
        message?: string;
        detail?: string;
      };

      console.log(msg as string);

      if (message.type === "queryResult") {
        setQueryState({
          columns: message.columns || [],
          rows: message.rows || [],
          rowCount: message.rowCount || 0,
          duration: message.duration || 0,
          error: null,
          loading: false,
        });

        if (!message.columns || message.columns.length === 0) {
          setStatusMessage(message.message || "Query executed successfully.", false);
        } else {
          setStatusMessage(null);
        }

        setHistory((prev) => [
          {
            sql: sql.trim(),
            timestamp: Date.now(),
            duration: message.duration || 0,
            rowCount: message.rowCount || 0,
            success: true,
          },
          ...prev.slice(0, 49),
        ]);
      }
      if (message.type === "queryError") {
        setQueryState({
          columns: [],
          rows: [],
          error: message.message || "Query failed",
          loading: false,
        });
        setStatusMessage(message.message || "Query failed", true);
        setHistory((prev) => [
          {
            sql: sql.trim(),
            timestamp: Date.now(),
            duration: 0,
            rowCount: 0,
            success: false,
            error: message.message,
          },
          ...prev.slice(0, 49),
        ]);
      }
    });
  }, [onMessage, setQueryState, sql, setStatusMessage]);

  const handleExecute = useCallback(
    (sqlToRun?: string) => {
      const execSql = sqlToRun || sql;
      if (!connectionName || !execSql.trim()) return;
      setQueryState({ loading: true, error: null, sql: execSql });
      setStatusMessage(null);
      postMessage({ type: "query", connectionName, sql: execSql.trim() });
    },
    [connectionName, sql, postMessage, setQueryState, setStatusMessage],
  );

  const handleExecuteSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      handleExecute(sql.substring(start, end));
    } else {
      handleExecute();
    }
  }, [sql, handleExecute]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "F5") {
      e.preventDefault();
      handleExecute();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleExecuteSelection();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newSql = sql.substring(0, start) + "  " + sql.substring(end);
      setSql(newSql);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleHistoryClick = (item: QueryHistoryItem) => {
    setSql(item.sql);
    setShowHistory(false);
    textareaRef.current?.focus();
  };

  const handleFormatSql = () => {
    let formatted = sql.trim();
    const majorClauses = [
      "SELECT",
      "FROM",
      "WHERE",
      "AND",
      "OR",
      "ORDER BY",
      "GROUP BY",
      "HAVING",
      "JOIN",
      "LEFT JOIN",
      "RIGHT JOIN",
      "INNER JOIN",
      "INSERT INTO",
      "VALUES",
      "UPDATE",
      "SET",
      "DELETE FROM",
      "LIMIT",
      "OFFSET",
      "UNION",
    ];
    for (const clause of majorClauses) {
      const regex = new RegExp(`\\b${clause}\\b`, "gi");
      formatted = formatted.replace(regex, `\n${clause}`);
    }
    formatted = formatted.replace(/^\n/, "").trim();
    formatted = formatted.replace(/\n{3,}/g, "\n\n");
    setSql(formatted);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(sql).catch(() => {});
  };

  const handleExportCSV = () => {
    if (queryState.columns.length === 0) return;
    const headers = queryState.columns.map((c) => c.name);
    const csvRows = [headers.join(",")];
    for (const row of queryState.rows) {
      const values = headers.map((h) => {
        const v = row[h];
        if (v === null || v === undefined) return "";
        const str = String(v);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      });
      csvRows.push(values.join(","));
    }
    navigator.clipboard.writeText(csvRows.join("\n")).catch(() => {});
  };

  const handleExportJSON = () => {
    if (queryState.rows.length === 0) return;
    navigator.clipboard
      .writeText(JSON.stringify(queryState.rows, null, 2))
      .catch(() => {});
  };

  const handleExportInsert = () => {
    if (queryState.rows.length === 0 || queryState.columns.length === 0) return;
    const cols = queryState.columns.map((c) => `"${c.name}"`).join(", ");
    const inserts = queryState.rows
      .map((row) => {
        const values = queryState.columns
          .map((c) => {
            const v = row[c.name];
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "number" || typeof v === "boolean")
              return String(v);
            return `'${String(v).replace(/'/g, "''")}'`;
          })
          .join(", ");
        return `INSERT INTO table_name (${cols}) VALUES (${values});`;
      })
      .join("\n");
    navigator.clipboard.writeText(inserts).catch(() => {});
  };

  if (!connectionName) {
    return (
      <div className="welcome">
        <p>No connection selected.</p>
      </div>
    );
  }

  return (
    <div className="sql-editor-container">
      {/* SQL Input Area */}
      <div
        style={{
          flex:
            queryState.columns.length === 0
              ? "1 1 auto"
              : `0 0 ${splitRatio * 100 - 10}%`,
          display: "flex",
          flexDirection: "column",
          minHeight: 100,
        }}
      >
        <textarea
          ref={textareaRef}
          className="sql-input"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter SQL query..."
          spellCheck={false}
          style={{ flex: 1 }}
        />
      </div>

      {/* Toolbar */}
      <div className="sql-editor-toolbar">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => handleExecute()}
          disabled={queryState.loading}
        >
          {queryState.loading ? (
            <>
              <Icon name="loading~spin" /> Running...
            </>
          ) : (
            <>
              <Icon name="run" /> Execute (F5)
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleExecuteSelection}
          disabled={queryState.loading}
        >
          <Icon name="run-above" /> Run Selection (Ctrl+Enter)
        </button>
        <div className="toolbar-separator" />
        <button
          type="button"
          className="btn btn-icon"
          onClick={handleFormatSql}
          title="Format SQL"
        >
          <Icon name="symbol-keyword" /> Format
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={handleCopySql}
          title="Copy SQL"
        >
          <Icon name="copy" />
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className={`btn btn-icon ${showHistory ? "active" : ""}`}
          onClick={() => setShowHistory(!showHistory)}
          title="Query History"
        >
          <Icon name="history" /> History ({history.length})
        </button>
      </div>

      {/* Query History Panel */}
      {showHistory && history.length > 0 && (
        <div className="query-history">
          <div className="query-history-title">Query History</div>
          {history.map((item, i) => (
            <button
              key={i}
              type="button"
              className="query-history-item"
              onClick={() => handleHistoryClick(item)}
              title={item.sql}
            >
              <span
                style={{
                  color: item.success
                    ? "var(--success-color)"
                    : "var(--danger-color)",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {item.success ? <Icon name="pass" /> : <Icon name="error" />}
              </span>{" "}
              {item.sql.substring(0, 100)}
              {item.sql.length > 100 ? "…" : ""}
              <span className="duration">
                {item.duration}ms · {item.rowCount} rows ·{" "}
                {new Date(item.timestamp).toLocaleTimeString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Results */}

      {queryState.columns.length > 0 && !queryState.error && (
        <div
          style={{
            flex: `0 0 ${(1 - splitRatio) * 100}%`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            className="query-result-info"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span>
              {queryState.rowCount} row{queryState.rowCount !== 1 ? "s" : ""}{" "}
              returned in {queryState.duration}ms
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn-icon"
              onClick={handleExportCSV}
              title="Copy as CSV"
              style={{ fontSize: 11 }}
            >
              <Icon name="file-symlink-file" /> CSV
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={handleExportJSON}
              title="Copy as JSON"
              style={{ fontSize: 11 }}
            >
              <Icon name="file-symlink-file" /> JSON
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={handleExportInsert}
              title="Copy as INSERT"
              style={{ fontSize: 11 }}
            >
              <Icon name="file-symlink-file" /> INSERT
            </button>
          </div>
          <div
            className="data-grid-container"
            style={{ flex: 1, overflow: "auto" }}
          >
            <table className="data-grid">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center" }}>#</th>
                  {queryState.columns.map((col) => (
                    <th key={col.name}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryState.rows.map((row, i) => (
                  <tr key={i}>
                    <td className="row-number">{i + 1}</td>
                    {queryState.columns.map((col) => {
                      const value = row[col.name];
                      const isNull = value === null || value === undefined;
                      return (
                        <td
                          key={col.name}
                          className={isNull ? "null-value" : ""}
                        >
                          {isNull
                            ? "NULL"
                            : typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
