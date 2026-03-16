import * as mysql from "mysql2/promise";
import type {
  ColumnInfo,
  DbSchema,
  FilterOption,
  ForeignKeyInfo,
  IndexInfo,
  MysqlConnectionConfig,
  PkMap,
  QueryResult,
  RoutineObject,
  RowChanges,
  SchemaObject,
  SortOption,
  TableDataResult,
} from "../ConnectionConfig";
import type { IDbAdapter } from "./IDbAdapter";

export class MysqlAdapter implements IDbAdapter {
  private pool: mysql.Pool | null = null;
  private _connected = false;

  constructor(
    public readonly config: MysqlConnectionConfig,
    private password: string,
  ) {}

  async connect(): Promise<void> {
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database || undefined,
      user: this.config.username,
      password: this.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 5,
      connectTimeout: 10000,
    });
    // Verify connection
    const client = await this.pool.getConnection();
    client.release();
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this._connected = false;
  }

  async testConnection(): Promise<boolean> {
    const testPool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database || undefined,
      user: this.config.username,
      password: this.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 1,
      connectTimeout: 10000,
    });
    try {
      const client = await testPool.getConnection();
      await client.query("SELECT 1");
      client.release();
      return true;
    } finally {
      await testPool.end();
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  private getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }
    return this.pool;
  }

  async query(sql: string): Promise<QueryResult> {
    const pool = this.getPool();
    const start = Date.now();

    // In mysql2, query() returns [rows, fields]
    const [rows, fields] = await pool.query(sql);
    const duration = Date.now() - start;

    let columns: ColumnInfo[] = [];
    let rowData: Record<string, unknown>[] = [];
    let rowCount = 0;

    if (Array.isArray(rows)) {
      rowData = rows as Record<string, unknown>[];
      rowCount = rowData.length;
    } else {
      // It's a ResultSetHeader for UPDATE/INSERT
      rowCount = (rows as mysql.ResultSetHeader).affectedRows || 0;
    }

    if (fields && Array.isArray(fields)) {
      columns = fields.map((f) => ({
        name: f.name,
        dataType: String(f.columnType), // Rough mapping
        nullable: true, // Difficult to know from just query results in mysql driver sometimes
        defaultValue: null,
        isPrimaryKey: false,
        isForeignKey: false,
        maxLength: f.columnLength || null,
      }));
    }

    return {
      columns,
      rows: rowData,
      rowCount,
      duration,
    };
  }

  async getSchema(): Promise<DbSchema> {
    const schemas = await this.getSchemas();

    // MySQL uses table_schema as database
    const [tablesResult] = await this.getPool().query(`
      SELECT table_schema AS "table_schema", table_name AS "table_name"
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);

    const [viewsResult] = await this.getPool().query(`
      SELECT table_schema AS "table_schema", table_name AS "table_name"
      FROM information_schema.views
      WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY table_schema, table_name
    `);

    const [functionsResult] = await this.getPool().query(`
      SELECT routine_schema AS routine_schema, routine_name AS routine_name, routine_type AS routine_type
      FROM information_schema.routines
      WHERE routine_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY routine_schema, routine_name
    `);

    const mapObject = (r: any): SchemaObject => ({
      name: r.table_name || r.routine_name,
      schema: r.table_schema || r.routine_schema,
    });

    const mapRoutine = (r: any): RoutineObject => ({
      name: r.routine_name,
      schema: r.routine_schema,
      type:
        r.routine_type?.toLowerCase() === "procedure"
          ? "procedure"
          : "function",
    });

    return {
      schemas,
      tables: (tablesResult as any[]).map(mapObject),
      views: (viewsResult as any[]).map(mapObject),
      functions: (functionsResult as any[]).map(mapRoutine),
    };
  }

  async getSchemas(): Promise<string[]> {
    const [result] = await this.getPool().query(`
      SELECT schema_name AS schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY schema_name
    `);
    return (result as any[]).map((r) => r.schema_name);
  }

  async getTables(schema: string): Promise<string[]> {
    const [result] = await this.getPool().query(
      `SELECT table_name AS table_name FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema],
    );
    return (result as any[]).map((r) => r.table_name);
  }

  async getViews(schema: string): Promise<string[]> {
    const [result] = await this.getPool().query(
      `SELECT table_name AS table_name FROM information_schema.views
       WHERE table_schema = ?
       ORDER BY table_name`,
      [schema],
    );
    return (result as any[]).map((r) => r.table_name);
  }

  async getFunctions(schema: string): Promise<RoutineObject[]> {
    const [result] = await this.getPool().query(
      `SELECT routine_name AS routine_name, routine_type AS routine_type FROM information_schema.routines
       WHERE routine_schema = ?
       ORDER BY routine_name`,
      [schema],
    );
    return (result as any[]).map((r) => ({
      name: r.routine_name,
      schema: schema,
      type:
        r.routine_type?.toLowerCase() === "procedure"
          ? "procedure"
          : "function",
    }));
  }

  async getColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const [result] = await this.getPool().query(
      `SELECT
        c.column_name AS column_name,
        c.data_type AS data_type,
        c.is_nullable AS is_nullable,
        c.column_default AS column_default,
        c.character_maximum_length AS character_maximum_length,
        CASE WHEN kcu.constraint_name = 'PRIMARY' THEN true ELSE false END as is_pk,
        CASE WHEN fk.constraint_name IS NOT NULL THEN true ELSE false END as is_fk
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.column_name = kcu.column_name AND c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name AND kcu.constraint_name = 'PRIMARY'
      LEFT JOIN (
        SELECT column_name, constraint_name, table_schema, table_name
        FROM information_schema.key_column_usage
        WHERE referenced_table_name IS NOT NULL
      ) fk ON c.column_name = fk.column_name AND c.table_schema = fk.table_schema AND c.table_name = fk.table_name
      WHERE c.table_schema = ? AND c.table_name = ?
      ORDER BY c.ordinal_position`,
      [schema, table],
    );

    return (result as any[]).map((r) => ({
      name: r.column_name,
      dataType: r.data_type,
      nullable: r.is_nullable === "YES",
      defaultValue: r.column_default,
      isPrimaryKey: r.is_pk === 1 || r.is_pk === true,
      isForeignKey: r.is_fk === 1 || r.is_fk === true,
      maxLength: r.character_maximum_length,
    }));
  }

  async getIndexes(schema: string, table: string): Promise<IndexInfo[]> {
    const [result] = await this.getPool().query(
      `SELECT
        index_name AS index_name,
        GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns,
        MAX(CASE WHEN non_unique = 0 THEN 1 ELSE 0 END) AS is_unique,
        MAX(CASE WHEN index_name = 'PRIMARY' THEN 1 ELSE 0 END) AS is_primary
      FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ?
      GROUP BY index_name
      ORDER BY index_name`,
      [schema, table],
    );

    return (result as any[]).map((r) => ({
      name: r.index_name,
      columns: r.columns.split(","),
      isUnique: r.is_unique === 1,
      isPrimary: r.is_primary === 1,
    }));
  }

  async getForeignKeys(
    schema: string,
    table: string,
  ): Promise<ForeignKeyInfo[]> {
    const [result] = await this.getPool().query(
      `SELECT
        constraint_name AS constraint_name,
        column_name AS column_name,
        referenced_table_name AS referenced_table,
        referenced_column_name AS referenced_column,
        referenced_table_schema AS referenced_schema
      FROM information_schema.key_column_usage
      WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL
      ORDER BY constraint_name`,
      [schema, table],
    );

    return (result as any[]).map((r) => ({
      name: r.constraint_name,
      columnName: r.column_name,
      referencedTable: r.referenced_table,
      referencedColumn: r.referenced_column,
      referencedSchema: r.referenced_schema,
    }));
  }

  async getTableData(
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    sort?: SortOption,
    filters?: FilterOption[],
  ): Promise<TableDataResult> {
    const params: unknown[] = [];

    // Build WHERE clause
    let whereClause = "";
    if (filters && filters.length > 0) {
      const conditions = filters.map((f) => {
        const col = `\`${f.column}\``;
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
            return `${col} LIKE ?`; // MySQL LIKE is usually case-insensitive by default based on collation
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

    // Build ORDER BY sql
    const orderClause = sort
      ? `ORDER BY \`${sort.column}\` ${sort.direction === "desc" ? "DESC" : "ASC"}`
      : "";

    // In MySQL we use backticks instead of double quotes
    const qualifiedTable = `\`${schema}\`.\`${table}\``;

    // Get total count
    const [countResult] = await this.getPool().query(
      `SELECT COUNT(*) as total FROM ${qualifiedTable} ${whereClause}`,
      params,
    );
    const total = parseInt((countResult as any[])[0].total, 10);

    // Get data
    const offset = page * pageSize;
    const dataParams = [...params, pageSize, offset];
    const [dataResult] = await this.getPool().query(
      `SELECT * FROM ${qualifiedTable} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      dataParams,
    );

    const columns = await this.getColumns(schema, table);

    return {
      columns,
      rows: dataResult as Record<string, unknown>[],
      total,
    };
  }

  async updateRow(
    schema: string,
    table: string,
    pk: PkMap,
    changes: RowChanges,
  ): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const [col, val] of Object.entries(changes)) {
      if (val === "$HAPPYDB_NOW$") {
        setClauses.push(`\`${col}\` = NOW()`);
      } else {
        setClauses.push(`\`${col}\` = ?`);
        params.push(val);
      }
    }

    const whereClauses: string[] = [];
    for (const [col, val] of Object.entries(pk)) {
      whereClauses.push(`\`${col}\` = ?`);
      params.push(val);
    }

    await this.getPool().query(
      `UPDATE \`${schema}\`.\`${table}\` SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
      params,
    );
  }

  async insertRow(
    schema: string,
    table: string,
    row: RowChanges,
  ): Promise<void> {
    const colList: string[] = [];
    const valExps: string[] = [];
    const params: unknown[] = [];

    for (const [col, val] of Object.entries(row)) {
      colList.push(`\`${col}\``);
      if (val === "$HAPPYDB_NOW$") {
        valExps.push("NOW()");
      } else {
        valExps.push("?");
        params.push(val);
      }
    }

    await this.getPool().query(
      `INSERT INTO \`${schema}\`.\`${table}\` (${colList.join(", ")}) VALUES (${valExps.join(", ")})`,
      params,
    );
  }

  async deleteRow(schema: string, table: string, pk: PkMap): Promise<void> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    for (const [col, val] of Object.entries(pk)) {
      whereClauses.push(`\`${col}\` = ?`);
      params.push(val);
    }

    await this.getPool().query(
      `DELETE FROM \`${schema}\`.\`${table}\` WHERE ${whereClauses.join(" AND ")}`,
      params,
    );
  }

  async getTableDdl(schema: string, table: string): Promise<string> {
    try {
      const [result] = await this.getPool().query(
        `SHOW CREATE TABLE \`${schema}\`.\`${table}\``,
      );
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as any;
        return (row["Create Table"] || row["Create View"]) + ";";
      }
    } catch (e) {
      console.warn(
        "Could not SHOW CREATE TABLE, falling back to manual generation.",
        e,
      );
    }

    // Fallback manual generation (will be less accurate than SHOW CREATE TABLE)
    const columns = await this.getColumns(schema, table);
    const indexes = await this.getIndexes(schema, table);
    const fks = await this.getForeignKeys(schema, table);

    let ddl = `CREATE TABLE \`${schema}\`.\`${table}\` (\n`;
    const colDefs = columns.map((c) => {
      let def = `  \`${c.name}\` ${c.dataType}`;
      if (c.maxLength) {
        def += `(${c.maxLength})`;
      }
      if (!c.nullable) {
        def += " NOT NULL";
      }
      if (c.defaultValue) {
        def += ` DEFAULT ${c.defaultValue}`;
      }
      return def;
    });

    const pkCols = columns
      .filter((c) => c.isPrimaryKey)
      .map((c) => `\`${c.name}\``);
    if (pkCols.length > 0) {
      colDefs.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
    }

    for (const fk of fks) {
      colDefs.push(
        `  CONSTRAINT \`${fk.name}\` FOREIGN KEY (\`${fk.columnName}\`) REFERENCES \`${fk.referencedSchema}\`.\`${fk.referencedTable}\`(\`${fk.referencedColumn}\`)`,
      );
    }

    for (const idx of indexes) {
      if (!idx.isPrimary) {
        const unique = idx.isUnique ? "UNIQUE " : "";
        colDefs.push(
          `  ${unique}KEY \`${idx.name}\` (${idx.columns.map((c) => `\`${c}\``).join(", ")})`,
        );
      }
    }

    ddl += colDefs.join(",\n");
    ddl += "\n);\n";

    return ddl;
  }

  async getRoutineDdl(
    schema: string,
    routine: string,
    type: "function" | "procedure",
  ): Promise<string> {
    const keyword = type === "function" ? "FUNCTION" : "PROCEDURE";
    const [result] = await this.getPool().query(
      `SHOW CREATE ${keyword} \`${schema}\`.\`${routine}\``,
    );

    if (Array.isArray(result) && result.length > 0) {
      const row = result[0] as any;
      const def =
        row[`Create ${type === "function" ? "Function" : "Procedure"}`];
      if (def) {
        return def + ";";
      }
    }

    throw new Error(
      `Could not get definition for ${type} ${schema}.${routine}`,
    );
  }
}
