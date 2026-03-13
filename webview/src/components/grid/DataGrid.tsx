import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVscodeApi } from "../../hooks/useVscodeApi";
import { type ColumnInfo, useDbStore } from "../../store/useDbStore";
import { CellEditor } from "./CellEditor";
import { FilterRow } from "./FilterRow";

interface PendingChange {
  rowIndex: number;
  column: string;
  oldValue: unknown;
  newValue: unknown;
}

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface FilterState {
  column: string;
  operator: string;
  value: string;
}

export const DataGrid: React.FC = () => {
  const { postMessage, onMessage } = useVscodeApi();
  const connectionName = useDbStore((s) => s.currentConnectionName);
  const schema = useDbStore((s) => s.currentSchema);
  const table = useDbStore((s) => s.currentTable);
  const tableState = useDbStore((s) => s.tableState);
  const setTableState = useDbStore((s) => s.setTableState);
  const setStatusMessage = useDbStore((s) => s.setStatusMessage);

  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: string;
  } | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<FilterState[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [newRows, setNewRows] = useState<Record<string, unknown>[]>([]);

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(
    (page = 0) => {
      if (!connectionName || !schema || !table) {
        return;
      }
      setTableState({ loading: true });

      const activeFilters = filters
        .filter(
          (f) =>
            f.value || f.operator === "is_null" || f.operator === "is_not_null",
        )
        .map((f) => ({
          column: f.column,
          operator: f.operator,
          value: f.value,
        }));

      postMessage({
        type: "fetchTable",
        connectionName,
        schema,
        table,
        page,
        pageSize: tableState.pageSize,
        sort: sort
          ? { column: sort.column, direction: sort.direction }
          : undefined,
        filters: activeFilters.length > 0 ? activeFilters : undefined,
      });
    },
    [
      connectionName,
      schema,
      table,
      tableState.pageSize,
      sort,
      filters,
      postMessage,
      setTableState,
    ],
  );

  // Listen for data
  useEffect(() => {
    return onMessage((msg: unknown) => {
      const message = msg as {
        type: string;
        columns?: ColumnInfo[];
        rows?: Record<string, unknown>[];
        total?: number;
        message?: string;
      };
      if (message.type === "tableData") {
        setTableState({
          columns: message.columns || [],
          rows: message.rows || [],
          total: message.total || 0,
          loading: false,
        });
        // Clear pending changes on fresh load
        setPendingChanges([]);
        setNewRows([]);
        setSelectedRows(new Set());
      }
      if (message.type === "error") {
        setTableState({ loading: false });
        setStatusMessage(message.message || "Error loading data", true);
      }
    });
  }, [onMessage, setTableState, setStatusMessage]);

  // Fetch on mount and when sort/filters change
  useEffect(() => {
    fetchData(0);
    setTableState({ page: 0 });
  }, [sort, filters, tableState.pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fetch
  useEffect(() => {
    fetchData(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.ceil(tableState.total / tableState.pageSize);

  // --- Sorting ---
  const handleSort = (colName: string) => {
    setSort((prev) => {
      if (prev?.column === colName) {
        if (prev.direction === "asc") {
          return { column: colName, direction: "desc" };
        }
        return null; // Third click removes sort
      }
      return { column: colName, direction: "asc" };
    });
  };

  const getSortIndicator = (colName: string): string => {
    if (!sort || sort.column !== colName) {
      return "";
    }
    return sort.direction === "asc" ? " ▲" : " ▼";
  };

  // --- Pagination ---
  const handlePrevPage = () => {
    if (tableState.page > 0) {
      const newPage = tableState.page - 1;
      setTableState({ page: newPage });
      fetchData(newPage);
    }
  };

  const handleNextPage = () => {
    if (tableState.page < totalPages - 1) {
      const newPage = tableState.page + 1;
      setTableState({ page: newPage });
      fetchData(newPage);
    }
  };

  // --- Inline editing ---
  const handleCellDoubleClick = (rowIndex: number, colName: string) => {
    setEditingCell({ row: rowIndex, col: colName });
  };

  const handleCellChange = (
    rowIndex: number,
    colName: string,
    newValue: unknown,
  ) => {
    const oldValue = tableState.rows[rowIndex]?.[colName];
    if (oldValue === newValue) {
      setEditingCell(null);
      return;
    }

    setPendingChanges((prev) => {
      // Remove existing change for this cell if any
      const filtered = prev.filter(
        (c) => !(c.rowIndex === rowIndex && c.column === colName),
      );
      return [...filtered, { rowIndex, column: colName, oldValue, newValue }];
    });
    setEditingCell(null);
  };

  const handleCellCancel = () => {
    setEditingCell(null);
  };

  const getCellValue = (rowIndex: number, colName: string): unknown => {
    const change = pendingChanges.find(
      (c) => c.rowIndex === rowIndex && c.column === colName,
    );
    return change ? change.newValue : tableState.rows[rowIndex]?.[colName];
  };

  const isCellModified = (rowIndex: number, colName: string): boolean => {
    return pendingChanges.some(
      (c) => c.rowIndex === rowIndex && c.column === colName,
    );
  };

  // --- Apply / Revert ---
  const getPrimaryKeyColumns = (): string[] => {
    return tableState.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  };

  const handleApply = () => {
    const pkCols = getPrimaryKeyColumns();
    if (pkCols.length === 0 && pendingChanges.length > 0) {
      setStatusMessage(
        "Cannot apply changes: no primary key detected for this table.",
      );
      return;
    }

    // Group changes by row
    const changesByRow = new Map<number, PendingChange[]>();
    for (const change of pendingChanges) {
      const existing = changesByRow.get(change.rowIndex) || [];
      existing.push(change);
      changesByRow.set(change.rowIndex, existing);
    }

    // Send update messages
    for (const [rowIndex, changes] of changesByRow) {
      const row = tableState.rows[rowIndex];
      if (!row) {
        continue;
      }

      const pk: Record<string, unknown> = {};
      for (const col of pkCols) {
        pk[col] = row[col];
      }

      const changesMap: Record<string, unknown> = {};
      for (const c of changes) {
        changesMap[c.column] = c.newValue;
      }

      postMessage({
        type: "updateRow",
        connectionName,
        schema,
        table,
        pk,
        changes: changesMap,
      });
    }

    // Send inserts for new rows
    for (const newRow of newRows) {
      postMessage({
        type: "insertRow",
        connectionName,
        schema,
        table,
        row: newRow,
      });
    }

    // Send deletes for selected rows (if marked for deletion)
    // (Will be implemented with explicit delete action)

    setStatusMessage(
      `Applied ${pendingChanges.length} change(s) and ${newRows.length} new row(s).`,
    );
    setTimeout(() => {
      fetchData(tableState.page);
      // Only clear if it's NOT an error (this handles cases where fetchData might have set an error)
      const currentStore = useDbStore.getState();
      if (!currentStore.isStatusError) {
        setStatusMessage(null);
      }
    }, 2000); // Increased timeout for success message to be readable
  };

  const handleRevert = () => {
    setPendingChanges([]);
    setNewRows([]);
    setStatusMessage("Changes reverted.");
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // --- Add/Delete rows ---
  const handleAddRow = () => {
    const emptyRow: Record<string, unknown> = {};
    for (const col of tableState.columns) {
      emptyRow[col.name] = col.defaultValue ?? null;
    }
    setNewRows((prev) => [...prev, emptyRow]);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.size === 0) {
      return;
    }
    const pkCols = getPrimaryKeyColumns();
    if (pkCols.length === 0) {
      setStatusMessage("Cannot delete: no primary key detected.");
      return;
    }

    for (const rowIndex of selectedRows) {
      const row = tableState.rows[rowIndex];
      if (!row) {
        continue;
      }

      const pk: Record<string, unknown> = {};
      for (const col of pkCols) {
        pk[col] = row[col];
      }

      postMessage({ type: "deleteRow", connectionName, schema, table, pk });
    }

    setStatusMessage(`Deleting ${selectedRows.size} row(s)...`);
    setTimeout(() => {
      fetchData(tableState.page);
      setSelectedRows(new Set());
      setStatusMessage(null);
    }, 500);
  };

  const toggleRowSelection = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  // --- Export ---
  const handleExportCSV = () => {
    const headers = tableState.columns.map((c) => c.name);
    const csvRows = [headers.join(",")];
    for (const row of tableState.rows) {
      const values = headers.map((h) => {
        const v = row[h];
        if (v === null || v === undefined) {
          return "";
        }
        const str = String(v);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvRows.push(values.join(","));
    }
    copyToClipboard(csvRows.join("\n"));
    setStatusMessage("CSV copied to clipboard");
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const handleExportJSON = () => {
    copyToClipboard(JSON.stringify(tableState.rows, null, 2));
    setStatusMessage("JSON copied to clipboard");
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    });
  };

  // --- Filter management ---
  const handleAddFilter = (column: string) => {
    setFilters((prev) => [...prev, { column, operator: "like", value: "" }]);
    setShowFilters(true);
  };

  const handleUpdateFilter = (index: number, update: Partial<FilterState>) => {
    setFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...update } : f)),
    );
  };

  const handleRemoveFilter = (index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Page size ---
  const handlePageSizeChange = (newSize: number) => {
    setTableState({ pageSize: newSize, page: 0 });
  };

  if (!connectionName || !table) {
    return (
      <div className="welcome">
        <p>No table selected.</p>
      </div>
    );
  }

  const hasChanges = pendingChanges.length > 0 || newRows.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div className="toolbar">
        <strong style={{ fontFamily: "var(--font-mono)" }}>
          {schema}.{table}
        </strong>
        <span className="badge">{tableState.total.toLocaleString()} rows</span>
        <div style={{ flex: 1 }} />

        {hasChanges && (
          <>
            <button className="btn btn-primary btn-sm" onClick={handleApply}>
              ✓ Apply ({pendingChanges.length + newRows.length})
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleRevert}>
              ↶ Revert
            </button>
            <div className="toolbar-separator" />
          </>
        )}

        <button className="btn btn-icon" onClick={handleAddRow} title="Add row">
          ➕
        </button>
        <button
          className="btn btn-icon"
          onClick={handleDeleteSelected}
          disabled={selectedRows.size === 0}
          title={`Delete ${selectedRows.size} row(s)`}
        >
          🗑️
        </button>
        <div className="toolbar-separator" />
        <button
          className={`btn btn-icon ${showFilters ? "active" : ""}`}
          onClick={() => setShowFilters(!showFilters)}
          title="Toggle filters"
        >
          🔍
        </button>
        <button
          className="btn btn-icon"
          onClick={handleExportCSV}
          title="Copy as CSV"
        >
          📋 CSV
        </button>
        <button
          className="btn btn-icon"
          onClick={handleExportJSON}
          title="Copy as JSON"
        >
          📋 JSON
        </button>
        <div className="toolbar-separator" />
        <button
          className="btn btn-icon"
          onClick={() => {
            setStatusMessage(null);
            fetchData(tableState.page);
          }}
          title="Refresh"
        >
          🔄
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <FilterRow
          columns={tableState.columns}
          filters={filters}
          onAddFilter={handleAddFilter}
          onUpdateFilter={handleUpdateFilter}
          onRemoveFilter={handleRemoveFilter}
        />
      )}

      {/* Grid */}
      {tableState.loading ? (
        <div className="loading">
          <span className="spinner" /> Loading data...
        </div>
      ) : (
        <>
          <div
            className="data-grid-container"
            ref={gridContainerRef}
            style={{ flex: 1 }}
          >
            <table className="data-grid">
              <thead>
                <tr>
                  <th style={{ width: 32, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRows(
                            new Set(tableState.rows.map((_, i) => i)),
                          );
                        } else {
                          setSelectedRows(new Set());
                        }
                      }}
                      checked={
                        selectedRows.size > 0 &&
                        selectedRows.size === tableState.rows.length
                      }
                    />
                  </th>
                  <th style={{ width: 48, textAlign: "center" }}>#</th>
                  {tableState.columns.map((col) => (
                    <th key={col.name} onClick={() => handleSort(col.name)}>
                      <span className="col-header">
                        {col.isPrimaryKey && (
                          <span className="pk-badge" title="Primary Key">
                            🔑
                          </span>
                        )}
                        {col.isForeignKey && (
                          <span className="fk-badge" title="Foreign Key">
                            🔗
                          </span>
                        )}
                        {col.name}
                      </span>
                      <span className="col-type">
                        {col.dataType}
                        {col.maxLength ? `(${col.maxLength})` : ""}
                      </span>
                      <span className="sort-indicator">
                        {getSortIndicator(col.name)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableState.rows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={selectedRows.has(rowIndex) ? "selected-row" : ""}
                  >
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedRows.has(rowIndex)}
                        onChange={() => toggleRowSelection(rowIndex)}
                      />
                    </td>
                    <td className="row-number">
                      {tableState.page * tableState.pageSize + rowIndex + 1}
                    </td>
                    {tableState.columns.map((col) => {
                      const value = getCellValue(rowIndex, col.name);
                      const isNull = value === null || value === undefined;
                      const isModified = isCellModified(rowIndex, col.name);
                      const isEditing =
                        editingCell?.row === rowIndex &&
                        editingCell?.col === col.name;

                      if (isEditing) {
                        return (
                          <td key={col.name} className="editing-cell">
                            <CellEditor
                              value={value}
                              column={col}
                              onSave={(newVal) =>
                                handleCellChange(rowIndex, col.name, newVal)
                              }
                              onCancel={handleCellCancel}
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.name}
                          className={`${isNull ? "null-value" : ""} ${isModified ? "modified" : ""} editable`}
                          onDoubleClick={() =>
                            handleCellDoubleClick(rowIndex, col.name)
                          }
                          title={isNull ? "NULL" : String(value)}
                        >
                          {isNull ? "NULL" : formatValue(value, col)}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* New rows */}
                {newRows.map((newRow, nri) => (
                  <tr key={`new-${nri}`} className="new-row">
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="btn-inline-delete"
                        onClick={() =>
                          setNewRows((prev) => prev.filter((_, i) => i !== nri))
                        }
                        title="Remove new row"
                      >
                        ✕
                      </button>
                    </td>
                    <td
                      className="row-number"
                      style={{ color: "var(--success-color)" }}
                    >
                      +
                    </td>
                    {tableState.columns.map((col) => (
                      <td
                        key={col.name}
                        className="new-row-cell editable"
                        onDoubleClick={() => {
                          const val = prompt(
                            `${col.name}:`,
                            String(newRow[col.name] ?? ""),
                          );
                          if (val !== null) {
                            setNewRows((prev) =>
                              prev.map((r, i) =>
                                i === nri
                                  ? { ...r, [col.name]: val || null }
                                  : r,
                              ),
                            );
                          }
                        }}
                      >
                        {newRow[col.name] === null ? (
                          <span className="null-value">NULL</span>
                        ) : (
                          String(newRow[col.name] ?? "")
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {tableState.rows.length === 0 && newRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={tableState.columns.length + 2}
                      style={{
                        textAlign: "center",
                        padding: 24,
                        color: "var(--fg-secondary)",
                      }}
                    >
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <span className="page-info">
              Page {tableState.page + 1} of {Math.max(totalPages, 1)}
              &nbsp;·&nbsp;{tableState.total.toLocaleString()} rows
            </span>

            <select
              value={tableState.pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              style={{ width: 70, padding: "2px 4px", fontSize: 12 }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
            <span style={{ fontSize: 11, color: "var(--fg-secondary)" }}>
              rows/page
            </span>

            <button
              className="btn btn-icon"
              onClick={handlePrevPage}
              disabled={tableState.page === 0}
            >
              ◀
            </button>
            <button
              className="btn btn-icon"
              onClick={handleNextPage}
              disabled={tableState.page >= totalPages - 1}
            >
              ▶
            </button>
          </div>
        </>
      )}
    </div>
  );
};

function formatValue(
  value: unknown,
  col: ColumnInfo,
): string | React.ReactNode {
  if (typeof value === "boolean") {
    return value ? "✓ true" : "✗ false";
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  const str = String(value);
  if (str.length > 200) {
    return str.substring(0, 200) + "…";
  }
  return str;
}
