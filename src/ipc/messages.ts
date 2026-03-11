import type {
  ColumnInfo,
  ConnectionConfig,
  DbSchema,
  FilterOption,
  PkMap,
  RowChanges,
  SortOption,
} from "../connection/ConnectionConfig";

// ---- Webview → Extension ----

export interface ConnectMessage {
  type: "connect";
  connectionId: string;
}

export interface DisconnectMessage {
  type: "disconnect";
  connectionId: string;
}

export interface QueryMessage {
  type: "query";
  connectionId: string;
  sql: string;
}

export interface FetchTableMessage {
  type: "fetchTable";
  connectionId: string;
  schema: string;
  table: string;
  page: number;
  pageSize: number;
  sort?: SortOption;
  filters?: FilterOption[];
}

export interface UpdateRowMessage {
  type: "updateRow";
  connectionId: string;
  schema: string;
  table: string;
  pk: PkMap;
  changes: RowChanges;
}

export interface InsertRowMessage {
  type: "insertRow";
  connectionId: string;
  schema: string;
  table: string;
  row: RowChanges;
}

export interface DeleteRowMessage {
  type: "deleteRow";
  connectionId: string;
  schema: string;
  table: string;
  pk: PkMap;
}

export interface GetSchemaMessage {
  type: "getSchema";
  connectionId: string;
}

export interface SaveConnectionMessage {
  type: "saveConnection";
  config: ConnectionConfig;
  password?: string;
}

export interface DeleteConnectionMessage {
  type: "deleteConnection";
  connectionId: string;
}

export interface TestConnectionMessage {
  type: "testConnection";
  config: ConnectionConfig;
  password?: string;
}

export interface GetConnectionsMessage {
  type: "getConnections";
}

export interface GetTableDdlMessage {
  type: "getTableDdl";
  connectionId: string;
  schema: string;
  table: string;
}

export type ExtensionMessage =
  | ConnectMessage
  | DisconnectMessage
  | QueryMessage
  | FetchTableMessage
  | UpdateRowMessage
  | InsertRowMessage
  | DeleteRowMessage
  | GetSchemaMessage
  | SaveConnectionMessage
  | DeleteConnectionMessage
  | TestConnectionMessage
  | GetConnectionsMessage
  | GetTableDdlMessage;

// ---- Extension → Webview ----

export interface QueryResultMessage {
  type: "queryResult";
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
}

export interface QueryErrorMessage {
  type: "queryError";
  message: string;
  detail?: string;
}

export interface TableDataMessage {
  type: "tableData";
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
}

export interface SchemaLoadedMessage {
  type: "schemaLoaded";
  schema: DbSchema;
}

export interface ConnectionsListMessage {
  type: "connectionsList";
  connections: ConnectionConfig[];
}

export interface ConnectionStatusMessage {
  type: "connectionStatus";
  id: string;
  status: "ok" | "error";
  error?: string;
}

export interface TestConnectionResultMessage {
  type: "testConnectionResult";
  success: boolean;
  error?: string;
}

export interface TableDdlMessage {
  type: "tableDdl";
  ddl: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface InitMessage {
  type: "init";
  view: "connectionForm" | "tableView" | "queryEditor" | "tableStructure";
  connectionId?: string;
  schema?: string;
  table?: string;
  initialSql?: string;
}

export type WebviewMessage =
  | QueryResultMessage
  | QueryErrorMessage
  | TableDataMessage
  | SchemaLoadedMessage
  | ConnectionsListMessage
  | ConnectionStatusMessage
  | TestConnectionResultMessage
  | TableDdlMessage
  | ErrorMessage
  | InitMessage;
