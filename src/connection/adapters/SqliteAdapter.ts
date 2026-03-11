import Database from "better-sqlite3";
import type {
  ColumnInfo,
  DbSchema,
  FilterOption,
  ForeignKeyInfo,
  IndexInfo,
  PkMap,
  QueryResult,
  RoutineObject,
  RowChanges,
  SchemaObject,
  SortOption,
  SqliteConnectionConfig,
  TableDataResult,
} from "../ConnectionConfig";
import type { IDbAdapter } from "./IDbAdapter";

export class SqliteAdapter implements IDbAdapter {
  private db: Database.Database | null = null;
  private _connected = false;

  constructor(public readonly config: SqliteConnectionConfig) {}

  async connect(): Promise<void> {
    this.db = new Database(this.config.filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this._connected = false;
  }

  async testConnection(): Promise<boolean> {
    const testDb = new Database(this.config.filePath, { readonly: true });
    try {
      testDb.prepare("SELECT 1").get();
      return true;
    } finally {
      testDb.close();
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error("Not connected to database");
    }
    return this.db;
  }

  async query(sql: string): Promise<QueryResult> {
    const db = this.getDb();
    const start = Date.now();

    // Determine if it's a SELECT-like statement
    const trimmed = sql.trim().toUpperCase();
    const isSelect =
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("PRAGMA") ||
      trimmed.startsWith("WITH") ||
      trimmed.startsWith("EXPLAIN");

    if (isSelect) {
      const stmt = db.prepare(sql);
      const rows = stmt.all() as Record<string, unknown>[];
      const duration = Date.now() - start;

      const columns: ColumnInfo[] =
        rows.length > 0
          ? Object.keys(rows[0]).map((name) => ({
              name,
              dataType: "TEXT",
              nullable: true,
              defaultValue: null,
              isPrimaryKey: false,
              isForeignKey: false,
              maxLength: null,
            }))
          : [];

      return { columns, rows, rowCount: rows.length, duration };
    } else {
      const result = db.prepare(sql).run();
      const duration = Date.now() - start;
      return {
        columns: [],
        rows: [],
        rowCount: result.changes,
        duration,
      };
    }
  }

  async getSchema(): Promise<DbSchema> {
    const tables = await this.getTables("main");
    const views = await this.getViews("main");

    return {
      schemas: ["main"],
      tables: tables.map((t) => ({ name: t, schema: "main" }) as SchemaObject),
      views: views.map((v) => ({ name: v, schema: "main" }) as SchemaObject),
      functions: [],
    };
  }

  async getSchemas(): Promise<string[]> {
    return ["main"];
  }

  async getTables(_schema: string): Promise<string[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  async getViews(_schema: string): Promise<string[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name`,
      )
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  async getFunctions(_schema: string): Promise<RoutineObject[]> {
    // SQLite doesn't have user-defined functions accessible via schema queries
    return [];
  }

  async getColumns(_schema: string, table: string): Promise<ColumnInfo[]> {
    const db = this.getDb();
    const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>;

    // Get foreign keys
    const fkRows = db
      .prepare(`PRAGMA foreign_key_list("${table}")`)
      .all() as Array<{
      from: string;
    }>;
    const fkColumns = new Set(fkRows.map((f) => f.from));

    return rows.map((r) => ({
      name: r.name,
      dataType: r.type || "TEXT",
      nullable: r.notnull === 0,
      defaultValue: r.dflt_value,
      isPrimaryKey: r.pk > 0,
      isForeignKey: fkColumns.has(r.name),
      maxLength: null,
    }));
  }

  async getIndexes(_schema: string, table: string): Promise<IndexInfo[]> {
    const db = this.getDb();
    const indexes = db.prepare(`PRAGMA index_list("${table}")`).all() as Array<{
      name: string;
      unique: number;
    }>;

    return indexes.map((idx) => {
      const cols = db
        .prepare(`PRAGMA index_info("${idx.name}")`)
        .all() as Array<{ name: string }>;
      return {
        name: idx.name,
        columns: cols.map((c) => c.name),
        isUnique: idx.unique === 1,
        isPrimary: idx.name.startsWith("sqlite_autoindex"),
      };
    });
  }

  async getForeignKeys(
    _schema: string,
    table: string,
  ): Promise<ForeignKeyInfo[]> {
    const db = this.getDb();
    const rows = db
      .prepare(`PRAGMA foreign_key_list("${table}")`)
      .all() as Array<{
      id: number;
      table: string;
      from: string;
      to: string;
    }>;

    return rows.map((r) => ({
      name: `fk_${table}_${r.from}`,
      columnName: r.from,
      referencedTable: r.table,
      referencedColumn: r.to,
      referencedSchema: "main",
    }));
  }

  async getTableData(
    _schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: SortOption,
    filters?: FilterOption[],
  ): Promise<TableDataResult> {
    const db = this.getDb();
    const params: unknown[] = [];

    // WHERE
    let whereClause = "";
    if (filters && filters.length > 0) {
      const conditions = filters.map((f) => {
        const col = `"${f.column}"`;
        switch (f.operator) {
          case "eq":
            params.push(f.value);
            return `${col} = ?`;
          case "neq":
            params.push(f.value);
            return `${col} != ?`;
          case "gt":
            params.push(f.value);
            return `${col} > ?`;
          case "gte":
            params.push(f.value);
            return `${col} >= ?`;
          case "lt":
            params.push(f.value);
            return `${col} < ?`;
          case "lte":
            params.push(f.value);
            return `${col} <= ?`;
          case "like":
            params.push(`%${f.value}%`);
            return `${col} LIKE ?`;
          case "ilike":
            params.push(`%${f.value}%`);
            return `${col} LIKE ? COLLATE NOCASE`;
          case "is_null":
            return `${col} IS NULL`;
          case "is_not_null":
            return `${col} IS NOT NULL`;
          default:
            return "1=1";
        }
      });
      whereClause = `WHERE ${conditions.join(" AND ")}`;
    }

    // Count
    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM "${table}" ${whereClause}`)
      .get(...params) as { total: number };
    const total = countRow.total;

    // ORDER BY
    const orderClause = sort
      ? `ORDER BY "${sort.column}" ${sort.direction === "desc" ? "DESC" : "ASC"}`
      : "";

    // Data
    const offset = page * pageSize;
    const dataParams = [...params, pageSize, offset];
    const rows = db
      .prepare(
        `SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      )
      .all(...dataParams) as Record<string, unknown>[];

    const columns = await this.getColumns("main", table);

    return { columns, rows, total };
  }

  async updateRow(
    _schema: string,
    table: string,
    pk: PkMap,
    changes: RowChanges,
  ): Promise<void> {
    const db = this.getDb();
    const params: unknown[] = [];

    const setClauses = Object.entries(changes).map(([col, val]) => {
      params.push(val);
      return `"${col}" = ?`;
    });

    const whereClauses = Object.entries(pk).map(([col, val]) => {
      params.push(val);
      return `"${col}" = ?`;
    });

    db.prepare(
      `UPDATE "${table}" SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
    ).run(...params);
  }

  async insertRow(
    _schema: string,
    table: string,
    row: RowChanges,
  ): Promise<void> {
    const db = this.getDb();
    const columns = Object.keys(row)
      .map((c) => `"${c}"`)
      .join(", ");
    const params = Object.values(row);
    const placeholders = params.map(() => "?").join(", ");

    db.prepare(
      `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
    ).run(...params);
  }

  async deleteRow(_schema: string, table: string, pk: PkMap): Promise<void> {
    const db = this.getDb();
    const params: unknown[] = [];

    const whereClauses = Object.entries(pk).map(([col, val]) => {
      params.push(val);
      return `"${col}" = ?`;
    });

    db.prepare(
      `DELETE FROM "${table}" WHERE ${whereClauses.join(" AND ")}`,
    ).run(...params);
  }

  async getTableDdl(_schema: string, table: string): Promise<string> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`,
      )
      .get(table) as { sql: string } | undefined;

    if (!row) {
      throw new Error(`Table or view "${table}" not found`);
    }

    let ddl = row.sql + ";\n";

    // Add index DDLs
    const indexes = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
      )
      .all(table) as Array<{ sql: string }>;

    for (const idx of indexes) {
      ddl += `\n${idx.sql};`;
    }

    return ddl;
  }

  async getRoutineDdl(
    _schema: string,
    _routine: string,
    _type: "function" | "procedure",
  ): Promise<string> {
    throw new Error(
      "SQLite does not support stored procedures or functions in schema.",
    );
  }
}
