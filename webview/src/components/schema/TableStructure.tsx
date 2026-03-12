import React, { useState, useEffect } from "react";
import { useVscodeApi } from "../../hooks/useVscodeApi";
import { useDbStore, ColumnInfo } from "../../store/useDbStore";

interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

interface ForeignKeyInfo {
  name: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  referencedSchema: string;
}

type StructureTab = "columns" | "indexes" | "foreignKeys" | "ddl";

export const TableStructure: React.FC = () => {
  const { postMessage, onMessage } = useVscodeApi();
  const connectionId = useDbStore((s) => s.currentConnectionId);
  const schema = useDbStore((s) => s.currentSchema);
  const table = useDbStore((s) => s.currentTable);

  const [activeTab, setActiveTab] = useState<StructureTab>("columns");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [ddl, setDdl] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Fetch structure data
  useEffect(() => {
    if (!connectionId || !schema || !table) {
      return;
    }
    setLoading(true);

    // Request table columns via fetchTable (page 0, size 0 — just columns)
    postMessage({
      type: "fetchTable",
      connectionId,
      schema,
      table,
      page: 0,
      pageSize: 1,
    });
    postMessage({ type: "getTableDdl", connectionId, schema, table });
    postMessage({ type: "getTableIndexes", connectionId, schema, table });
    postMessage({ type: "getTableForeignKeys", connectionId, schema, table });
  }, [connectionId, schema, table, postMessage]);

  // Listen for data
  useEffect(() => {
    return onMessage((msg: unknown) => {
      const message = msg as Record<string, unknown>;
      if (message.type === "tableData" && message.columns) {
        setColumns(message.columns as ColumnInfo[]);
        setLoading(false);
      }
      if (message.type === "tableDdl" && message.ddl) {
        setDdl(message.ddl as string);
      }
      if (message.type === "tableIndexes" && message.indexes) {
        setIndexes(message.indexes as IndexInfo[]);
      }
      if (message.type === "tableForeignKeys" && message.foreignKeys) {
        setForeignKeys(message.foreignKeys as ForeignKeyInfo[]);
      }
    });
  }, [onMessage]);

  if (!connectionId || !table) {
    return (
      <div className="welcome">
        <p>No table selected.</p>
      </div>
    );
  }

  const tabs: { key: StructureTab; label: string }[] = [
    { key: "columns", label: `Columns (${columns.length})` },
    { key: "indexes", label: `Indexes (${indexes.length})` },
    { key: "foreignKeys", label: `Foreign Keys (${foreignKeys.length})` },
    { key: "ddl", label: "DDL" },
  ];

  return (
    <div>
      <div className="toolbar">
        <strong style={{ fontFamily: "var(--font-mono)" }}>
          {schema}.{table}
        </strong>
        <span className="badge">Structure</span>
      </div>

      <div className="structure-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`structure-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">
          <span className="spinner" /> Loading structure...
        </div>
      ) : (
        <>
          {activeTab === "columns" && (
            <div className="data-grid-container">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Nullable</th>
                    <th>Default</th>
                    <th>PK</th>
                    <th>FK</th>
                    <th>Max Length</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <tr key={col.name}>
                      <td className="row-number">{i + 1}</td>
                      <td style={{ fontWeight: col.isPrimaryKey ? 600 : 400 }}>
                        {col.isPrimaryKey && "🔑 "}
                        {col.name}
                      </td>
                      <td
                        style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                      >
                        {col.dataType}
                      </td>
                      <td>{col.nullable ? "✓" : "✗"}</td>
                      <td className={col.defaultValue ? "" : "null-value"}>
                        {col.defaultValue || "—"}
                      </td>
                      <td>{col.isPrimaryKey ? "✓" : ""}</td>
                      <td>{col.isForeignKey ? "🔗" : ""}</td>
                      <td>{col.maxLength || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "indexes" && (
            <div className="data-grid-container">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Columns</th>
                    <th>Unique</th>
                    <th>Primary</th>
                  </tr>
                </thead>
                <tbody>
                  {indexes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          textAlign: "center",
                          padding: 16,
                          color: "var(--fg-secondary)",
                        }}
                      >
                        No indexes found (request via extension required)
                      </td>
                    </tr>
                  ) : (
                    indexes.map((idx) => (
                      <tr key={idx.name}>
                        <td>{idx.name}</td>
                        <td
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                          }}
                        >
                          {idx.columns.join(", ")}
                        </td>
                        <td>{idx.isUnique ? "✓" : ""}</td>
                        <td>{idx.isPrimary ? "✓" : ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "foreignKeys" && (
            <div className="data-grid-container">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Constraint</th>
                    <th>Column</th>
                    <th>→ Schema</th>
                    <th>→ Table</th>
                    <th>→ Column</th>
                  </tr>
                </thead>
                <tbody>
                  {foreignKeys.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          textAlign: "center",
                          padding: 16,
                          color: "var(--fg-secondary)",
                        }}
                      >
                        {columns.some((c) => c.isForeignKey)
                          ? "Foreign key details via extension required"
                          : "No foreign keys"}
                      </td>
                    </tr>
                  ) : (
                    foreignKeys.map((fk) => (
                      <tr key={fk.name + fk.columnName}>
                        <td>{fk.name}</td>
                        <td>{fk.columnName}</td>
                        <td>{fk.referencedSchema}</td>
                        <td>{fk.referencedTable}</td>
                        <td>{fk.referencedColumn}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "ddl" && (
            <div>
              <div style={{ marginBottom: 8 }}>
                <button
                  className="btn btn-icon"
                  onClick={() =>
                    navigator.clipboard.writeText(ddl).catch(() => {})
                  }
                  title="Copy DDL"
                >
                  📋 Copy DDL
                </button>
              </div>
              <pre className="ddl-view">{ddl || "DDL not available"}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};
