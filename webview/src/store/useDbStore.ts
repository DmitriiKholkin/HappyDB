import { create } from "zustand";

// --- Types (mirrored from extension) ---

export interface ConnectionConfig {
  name: string;
  type: "postgresql" | "mssql" | "sqlite" | "mysql";
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  filePath?: string;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  maxLength: number | null;
}

export interface SchemaObject {
  name: string;
  schema: string;
}

export interface DbSchema {
  schemas: string[];
  tables: SchemaObject[];
  views: SchemaObject[];
  functions: SchemaObject[];
}

export type ViewType =
  | "connectionForm"
  | "tableView"
  | "queryEditor"
  | "tableStructure"
  | "welcome";

export interface Tab {
  id: string;
  title: string;
  viewType: ViewType;
  connectionName?: string;
  schema?: string;
  table?: string;
}

export interface TableState {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
}

export interface QueryState {
  sql: string;
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  error: string | null;
  loading: boolean;
}

// --- Store ---

interface DbStore {
  // UI
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  // Connection form
  editingConnectionName: string | null;
  setEditingConnectionName: (name: string | null) => void;

  // Connections
  connections: ConnectionConfig[];
  setConnections: (connections: ConnectionConfig[]) => void;

  // Current view context
  currentConnectionName: string | null;
  currentSchema: string | null;
  currentTable: string | null;
  setCurrentContext: (
    connectionName: string,
    schema?: string,
    table?: string,
  ) => void;

  // Table data
  tableState: TableState;
  setTableState: (state: Partial<TableState>) => void;

  // Query editor
  queryState: QueryState;
  setQueryState: (state: Partial<QueryState>) => void;

  // Schema
  schema: DbSchema | null;
  setSchema: (schema: DbSchema | null) => void;

  // Settings
  queryHistoryLimit: number;
  setQueryHistoryLimit: (limit: number) => void;

  // Status messages
  statusMessage: string | null;
  isStatusError: boolean;
  setStatusMessage: (msg: string | null, isError?: boolean) => void;
}

export const useDbStore = create<DbStore>((set) => ({
  // UI
  activeView: "welcome",
  setActiveView: (view) => set({ activeView: view }),

  // Connection form
  editingConnectionName: null,
  setEditingConnectionName: (name) => set({ editingConnectionName: name }),

  // Connections
  connections: [],
  setConnections: (connections) => set({ connections }),

  // Context
  currentConnectionName: null,
  currentSchema: null,
  currentTable: null,
  setCurrentContext: (connectionName, schema, table) =>
    set({
      currentConnectionName: connectionName,
      currentSchema: schema ?? null,
      currentTable: table ?? null,
    }),

  // Table
  tableState: {
    columns: [],
    rows: [],
    total: 0,
    page: 0,
    pageSize: 100,
    loading: false,
  },
  setTableState: (state) =>
    set((prev) => ({ tableState: { ...prev.tableState, ...state } })),

  // Query
  queryState: {
    sql: "",
    columns: [],
    rows: [],
    rowCount: 0,
    duration: 0,
    error: null,
    loading: false,
  },
  setQueryState: (state) =>
    set((prev) => ({ queryState: { ...prev.queryState, ...state } })),

  // Schema
  schema: null,
  setSchema: (schema) => set({ schema }),

  // Settings
  queryHistoryLimit: 50,
  setQueryHistoryLimit: (limit) => set({ queryHistoryLimit: limit }),

  // Status
  statusMessage: null,
  isStatusError: false,
  setStatusMessage: (msg, isError = false) =>
    set({ statusMessage: msg, isStatusError: isError }),
}));
