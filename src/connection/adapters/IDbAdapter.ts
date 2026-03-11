import type {
  ColumnInfo,
  ConnectionConfig,
  DbSchema,
  FilterOption,
  ForeignKeyInfo,
  IndexInfo,
  PkMap,
  QueryResult,
  RoutineObject,
  RowChanges,
  SortOption,
  TableDataResult,
} from "../ConnectionConfig";

/**
 * Unified interface for all database adapters.
 */
export interface IDbAdapter {
  readonly config: ConnectionConfig;

  /** Connect to the database. */
  connect(): Promise<void>;

  /** Disconnect from the database. */
  disconnect(): Promise<void>;

  /** Test if the connection can be established. Returns true on success, throws on failure. */
  testConnection(): Promise<boolean>;

  /** Check if currently connected. */
  isConnected(): boolean;

  // ---- Queries ----

  /** Execute an arbitrary SQL query. */
  query(sql: string): Promise<QueryResult>;

  // ---- Schema introspection ----

  /** Get full schema overview. */
  getSchema(): Promise<DbSchema>;

  /** Get list of schemas/databases. */
  getSchemas(): Promise<string[]>;

  /** Get tables in a schema. */
  getTables(schema: string): Promise<string[]>;

  /** Get views in a schema. */
  getViews(schema: string): Promise<string[]>;

  /** Get functions in a schema. */
  getFunctions(schema: string): Promise<RoutineObject[]>;

  /** Get columns of a table. */
  getColumns(schema: string, table: string): Promise<ColumnInfo[]>;

  /** Get indexes of a table. */
  getIndexes(schema: string, table: string): Promise<IndexInfo[]>;

  /** Get foreign keys of a table. */
  getForeignKeys(schema: string, table: string): Promise<ForeignKeyInfo[]>;

  // ---- Data operations ----

  /** Get paginated and optionally filtered/sorted table data. */
  getTableData(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: SortOption,
    filters?: FilterOption[],
  ): Promise<TableDataResult>;

  /** Update a single row identified by primary key. */
  updateRow(
    schema: string,
    table: string,
    pk: PkMap,
    changes: RowChanges,
  ): Promise<void>;

  /** Insert a new row. */
  insertRow(schema: string, table: string, row: RowChanges): Promise<void>;

  /** Delete a row identified by primary key. */
  deleteRow(schema: string, table: string, pk: PkMap): Promise<void>;

  /** Generate DDL (CREATE TABLE) for a table/view. */
  getTableDdl(schema: string, table: string): Promise<string>;

  /** Generate DDL for a function or procedure. */
  getRoutineDdl(
    schema: string,
    routine: string,
    type: "function" | "procedure",
  ): Promise<string>;
}
