import type {
  ColumnInfo,
  ConnectionConfig,
  DbSchema,
  FilterOption,
  ForeignKeyInfo,
  IndexInfo,
  PkMap,
  RowChanges,
  SortOption,
} from "../connection/ConnectionConfig";

// ---- Webview → Extension ----

export interface ConnectMessage {
  type: "connect";
  connectionName: string;
}

export interface DisconnectMessage {
  type: "disconnect";
  connectionName: string;
}

export interface QueryMessage {
  type: "query";
  connectionName: string;
  sql: string;
}

export interface FetchTableMessage {
  type: "fetchTable";
  connectionName: string;
  schema: string;
  table: string;
  page: number;
  pageSize: number;
  sort?: SortOption;
  filters?: FilterOption[];
}

export interface UpdateRowMessage {
  type: "updateRow";
  connectionName: string;
  schema: string;
  table: string;
  pk: PkMap;
  changes: RowChanges;
}

export interface InsertRowMessage {
  type: "insertRow";
  connectionName: string;
  schema: string;
  table: string;
  row: RowChanges;
}

export interface DeleteRowMessage {
  type: "deleteRow";
  connectionName: string;
  schema: string;
  table: string;
  pk: PkMap;
}

export interface GetSchemaMessage {
  type: "getSchema";
  connectionName: string;
}

export interface SaveConnectionMessage {
  type: "saveConnection";
  config: ConnectionConfig;
  password?: string;
  originalName?: string;
}

export interface DeleteConnectionMessage {
  type: "deleteConnection";
  connectionName: string;
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
  connectionName: string;
  schema: string;
  table: string;
}

export interface GetTableIndexesMessage {
  type: "getTableIndexes";
  connectionName: string;
  schema: string;
  table: string;
}

export interface GetTableForeignKeysMessage {
  type: "getTableForeignKeys";
  connectionName: string;
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
  | GetConnectionsMessage
  | GetTableDdlMessage
  | GetTableIndexesMessage
  | GetTableForeignKeysMessage;

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

export interface TableIndexesMessage {
  type: "tableIndexes";
  indexes: IndexInfo[];
}

export interface TableForeignKeysMessage {
  type: "tableForeignKeys";
  foreignKeys: ForeignKeyInfo[];
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface InitMessage {
  type: "init";
  view: "connectionForm" | "tableView" | "queryEditor" | "tableStructure";
  connectionName?: string;
  schema?: string;
  table?: string;
  initialSql?: string;
  pageSize?: number;
  queryHistoryLimit?: number;
}

export interface UpdateSettingsMessage {
  type: "updateSettings";
  pageSize: number;
  queryHistoryLimit: number;
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
  | TableIndexesMessage
  | TableForeignKeysMessage
  | ErrorMessage
  | InitMessage
  | UpdateSettingsMessage;
