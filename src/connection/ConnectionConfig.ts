/**
 * Database connection configuration types.
 */

export type DbType = "postgresql" | "mssql" | "sqlite" | "mysql";

export interface BaseConnectionConfig {
  name: string;
  type: DbType;
  password?: string;
}

export interface PostgresConnectionConfig extends BaseConnectionConfig {
  type: "postgresql";
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
}

export interface MssqlConnectionConfig extends BaseConnectionConfig {
  type: "mssql";
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
  trustServerCertificate: boolean;
}

export interface SqliteConnectionConfig extends BaseConnectionConfig {
  type: "sqlite";
  filePath: string;
}

export interface MysqlConnectionConfig extends BaseConnectionConfig {
  type: "mysql";
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
}

export type ConnectionConfig =
  | PostgresConnectionConfig
  | MssqlConnectionConfig
  | SqliteConnectionConfig
  | MysqlConnectionConfig;

// ---------- Schema / Metadata types ----------

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  maxLength: number | null;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface ForeignKeyInfo {
  name: string;
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
  referencedSchema: string;
}

export interface SchemaObject {
  name: string;
  schema: string;
}

export interface RoutineObject extends SchemaObject {
  type: "function" | "procedure";
}

export interface DbSchema {
  schemas: string[];
  tables: SchemaObject[];
  views: SchemaObject[];
  functions: RoutineObject[];
}

// ---------- Query result types ----------

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
}

export interface TableDataResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
}

export type SortDirection = "asc" | "desc";

export interface SortOption {
  column: string;
  direction: SortDirection;
}

export interface FilterOption {
  column: string;
  operator:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "like"
    | "ilike"
    | "is_null"
    | "is_not_null";
  value: string;
}

export type PkMap = Record<string, unknown>;
export type RowChanges = Record<string, unknown>;
