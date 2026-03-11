import React, { useState, useRef, useEffect } from "react";
import { ColumnInfo } from "../../store/useDbStore";

interface CellEditorProps {
  value: unknown;
  column: ColumnInfo;
  onSave: (newValue: unknown) => void;
  onCancel: () => void;
}

export const CellEditor: React.FC<CellEditorProps> = ({
  value,
  column,
  onSave,
  onCancel,
}) => {
  const dataType = column.dataType.toLowerCase();

  // Boolean editor
  if (isBooleanType(dataType)) {
    return (
      <BooleanEditor
        value={value}
        nullable={column.nullable}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }

  // JSON editor
  if (isJsonType(dataType) || (typeof value === "object" && value !== null)) {
    return <JsonEditor value={value} onSave={onSave} onCancel={onCancel} />;
  }

  // Numeric editor
  if (isNumericType(dataType)) {
    return (
      <TextInputEditor
        value={value}
        type="number"
        nullable={column.nullable}
        onSave={(v) => {
          if (v === null) {
            onSave(null);
            return;
          }
          const num = Number(v);
          onSave(isNaN(num) ? v : num);
        }}
        onCancel={onCancel}
      />
    );
  }

  // Date editor
  if (isDateType(dataType)) {
    return (
      <TextInputEditor
        value={value}
        type="text"
        nullable={column.nullable}
        onSave={onSave}
        onCancel={onCancel}
        placeholder="YYYY-MM-DD HH:MM:SS"
      />
    );
  }

  // Default: text editor
  return (
    <TextInputEditor
      value={value}
      type="text"
      nullable={column.nullable}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
};

// --- Sub-editors ---

interface TextInputEditorProps {
  value: unknown;
  type: string;
  nullable: boolean;
  onSave: (val: unknown) => void;
  onCancel: () => void;
  placeholder?: string;
}

const TextInputEditor: React.FC<TextInputEditorProps> = ({
  value,
  type,
  nullable,
  onSave,
  onCancel,
  placeholder,
}) => {
  const [text, setText] = useState(
    value === null || value === undefined ? "" : String(value),
  );
  const [isNull, setIsNull] = useState(value === null || value === undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave(isNull ? null : text);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      onSave(isNull ? null : text);
    }
  };

  return (
    <div className="cell-editor" onKeyDown={handleKeyDown}>
      <input
        ref={inputRef}
        type={type}
        value={isNull ? "" : text}
        onChange={(e) => {
          setText(e.target.value);
          setIsNull(false);
        }}
        onBlur={() => onSave(isNull ? null : text)}
        placeholder={placeholder || (isNull ? "NULL" : "")}
        disabled={isNull}
        className="cell-edit-input"
      />
      {nullable && (
        <label className="null-toggle" title="Set to NULL">
          <input
            type="checkbox"
            checked={isNull}
            onChange={(e) => {
              setIsNull(e.target.checked);
              if (!e.target.checked) {
                setTimeout(() => inputRef.current?.focus(), 0);
              }
            }}
          />
          <span className="null-label">NULL</span>
        </label>
      )}
    </div>
  );
};

interface BooleanEditorProps {
  value: unknown;
  nullable: boolean;
  onSave: (val: unknown) => void;
  onCancel: () => void;
}

const BooleanEditor: React.FC<BooleanEditorProps> = ({
  value,
  nullable,
  onSave,
  onCancel,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="cell-editor bool-editor" onKeyDown={handleKeyDown}>
      <button
        className={`bool-btn ${value === true ? "active" : ""}`}
        onClick={() => onSave(true)}
      >
        ✓ true
      </button>
      <button
        className={`bool-btn ${value === false ? "active" : ""}`}
        onClick={() => onSave(false)}
      >
        ✗ false
      </button>
      {nullable && (
        <button
          className={`bool-btn ${value === null ? "active" : ""}`}
          onClick={() => onSave(null)}
        >
          ∅ null
        </button>
      )}
    </div>
  );
};

interface JsonEditorProps {
  value: unknown;
  onSave: (val: unknown) => void;
  onCancel: () => void;
}

const JsonEditor: React.FC<JsonEditorProps> = ({ value, onSave, onCancel }) => {
  const [text, setText] = useState(
    value === null
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      try {
        onSave(JSON.parse(text));
      } catch {
        onSave(text);
      }
    }
  };

  return (
    <div className="cell-editor json-editor" onKeyDown={handleKeyDown}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="json-edit-input"
        rows={5}
      />
      <div className="json-editor-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            try {
              onSave(JSON.parse(text));
            } catch {
              onSave(text);
            }
          }}
        >
          Save (Ctrl+Enter)
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
};

// --- Type detection helpers ---

function isBooleanType(type: string): boolean {
  return ["boolean", "bool", "bit"].includes(type);
}

function isNumericType(type: string): boolean {
  return [
    "integer",
    "int",
    "int2",
    "int4",
    "int8",
    "bigint",
    "smallint",
    "tinyint",
    "numeric",
    "decimal",
    "real",
    "float",
    "double",
    "double precision",
    "money",
    "serial",
    "bigserial",
    "smallserial",
  ].includes(type);
}

function isJsonType(type: string): boolean {
  return ["json", "jsonb", "nvarchar(max)"].includes(type);
}

function isDateType(type: string): boolean {
  return [
    "date",
    "time",
    "timestamp",
    "timestamptz",
    "timestamp with time zone",
    "timestamp without time zone",
    "datetime",
    "datetime2",
    "datetimeoffset",
    "smalldatetime",
  ].includes(type);
}
