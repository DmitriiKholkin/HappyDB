import { create } from "zustand";

// --- Types (mirrored from extension) ---

export interface ConnectionConfig {
  id: string;
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
  color?: string;
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
  connectionId?: string;
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
  editingConnectionId: string | null;
  setEditingConnectionId: (id: string | null) => void;

  // Connections
  connections: ConnectionConfig[];
  setConnections: (connections: ConnectionConfig[]) => void;

  // Current view context
  currentConnectionId: string | null;
  currentSchema: string | null;
  currentTable: string | null;
  setCurrentContext: (
    connectionId: string,
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

  // Status messages
  statusMessage: string | null;
  setStatusMessage: (msg: string | null) => void;
}

export const useDbStore = create<DbStore>((set) => ({
  // UI
  activeView: "welcome",
  setActiveView: (view) => set({ activeView: view }),

  // Connection form
  editingConnectionId: null,
  setEditingConnectionId: (id) => set({ editingConnectionId: id }),

  // Connections
  connections: [],
  setConnections: (connections) => set({ connections }),

  // Context
  currentConnectionId: null,
  currentSchema: null,
  currentTable: null,
  setCurrentContext: (connectionId, schema, table) =>
    set({
      currentConnectionId: connectionId,
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

  // Status
  statusMessage: null,
  setStatusMessage: (msg) => set({ statusMessage: msg }),
}));
