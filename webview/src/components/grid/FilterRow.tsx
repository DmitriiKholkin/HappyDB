import React from "react";
import { ColumnInfo } from "../../store/useDbStore";

interface FilterState {
  column: string;
  operator: string;
  value: string;
}

interface FilterRowProps {
  columns: ColumnInfo[];
  filters: FilterState[];
  onAddFilter: (column: string) => void;
  onUpdateFilter: (index: number, update: Partial<FilterState>) => void;
  onRemoveFilter: (index: number) => void;
}

const OPERATORS = [
  { value: "like", label: "Contains" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "ilike", label: "Contains (case-insensitive)" },
  { value: "is_null", label: "IS NULL" },
  { value: "is_not_null", label: "IS NOT NULL" },
];

export const FilterRow: React.FC<FilterRowProps> = ({
  columns,
  filters,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
}) => {
  const needsValue = (op: string) => !["is_null", "is_not_null"].includes(op);

  return (
    <div className="filter-bar">
      {filters.map((filter, index) => (
        <div key={index} className="filter-chip">
          <select
            className="filter-select"
            value={filter.column}
            onChange={(e) => onUpdateFilter(index, { column: e.target.value })}
          >
            {columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name}
              </option>
            ))}
          </select>
          <select
            className="filter-select filter-op"
            value={filter.operator}
            onChange={(e) =>
              onUpdateFilter(index, { operator: e.target.value })
            }
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          {needsValue(filter.operator) && (
            <input
              className="filter-input"
              type="text"
              value={filter.value}
              onChange={(e) => onUpdateFilter(index, { value: e.target.value })}
              placeholder="value..."
            />
          )}
          <button
            className="filter-remove"
            onClick={() => onRemoveFilter(index)}
            title="Remove filter"
          >
            ✕
          </button>
        </div>
      ))}
      <select
        className="filter-add-select"
        value=""
        onChange={(e) => {
          if (e.target.value) {
            onAddFilter(e.target.value);
          }
        }}
      >
        <option value="">+ Add filter...</option>
        {columns.map((col) => (
          <option key={col.name} value={col.name}>
            {col.name}
          </option>
        ))}
      </select>
    </div>
  );
};
