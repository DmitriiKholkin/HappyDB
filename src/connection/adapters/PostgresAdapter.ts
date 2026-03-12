import * as pg from "pg";
import type {
  ColumnInfo,
  DbSchema,
  FilterOption,
  ForeignKeyInfo,
  IndexInfo,
  PkMap,
  PostgresConnectionConfig,
  QueryResult,
  RoutineObject,
  RowChanges,
  SchemaObject,
  SortOption,
  TableDataResult,
} from "../ConnectionConfig";
import type { IDbAdapter } from "./IDbAdapter";

export class PostgresAdapter implements IDbAdapter {
  private pool: pg.Pool | null = null;
  private _connected = false;

  constructor(
    public readonly config: PostgresConnectionConfig,
    private password: string,
  ) {}

  async connect(): Promise<void> {
    this.pool = new pg.Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
    });
    // Verify connection
    const client = await this.pool.connect();
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
    const testPool = new pg.Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    try {
      const client = await testPool.connect();
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

  private getPool(): pg.Pool {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }
    return this.pool;
  }

  async query(sql: string): Promise<QueryResult> {
    const pool = this.getPool();
    const start = Date.now();
    const result = await pool.query(sql);
    const duration = Date.now() - start;

    const columns: ColumnInfo[] = (result.fields || []).map((f) => ({
      name: f.name,
      dataType: String(f.dataTypeID),
      nullable: true,
      defaultValue: null,
      isPrimaryKey: false,
      isForeignKey: false,
      maxLength: null,
    }));

    return {
      columns,
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      duration,
    };
  }

  async getSchema(): Promise<DbSchema> {
    const schemas = await this.getSchemas();
    const tablesResult = await this.getPool().query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);
    const viewsResult = await this.getPool().query(`
      SELECT table_schema, table_name
      FROM information_schema.views
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    const functionsResult = await this.getPool().query(`
      SELECT routine_schema, routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY routine_schema, routine_name
    `);

    return {
      schemas,
      tables: tablesResult.rows.map(
        (r) => ({ name: r.table_name, schema: r.table_schema }) as SchemaObject,
      ),
      views: viewsResult.rows.map(
        (r) => ({ name: r.table_name, schema: r.table_schema }) as SchemaObject,
      ),
      functions: functionsResult.rows.map(
        (r) =>
          ({
            name: r.routine_name,
            schema: r.routine_schema,
            type:
              r.routine_type?.toLowerCase() === "procedure"
                ? "procedure"
                : "function",
          }) as RoutineObject,
      ),
    };
  }

  async getSchemas(): Promise<string[]> {
    const result = await this.getPool().query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schema_name
    `);
    return result.rows.map((r) => r.schema_name);
  }

  async getTables(schema: string): Promise<string[]> {
    const result = await this.getPool().query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema],
    );
    return result.rows.map((r) => r.table_name);
  }

  async getViews(schema: string): Promise<string[]> {
    const result = await this.getPool().query(
      `SELECT table_name FROM information_schema.views
       WHERE table_schema = $1
       ORDER BY table_name`,
      [schema],
    );
    return result.rows.map((r) => r.table_name);
  }

  async getFunctions(schema: string): Promise<RoutineObject[]> {
    const result = await this.getPool().query(
      `SELECT routine_name, routine_type FROM information_schema.routines
       WHERE routine_schema = $1
       ORDER BY routine_name`,
      [schema],
    );
    return result.rows.map(
      (r) =>
        ({
          name: r.routine_name,
          schema: schema,
          type:
            r.routine_type?.toLowerCase() === "procedure"
              ? "procedure"
              : "function",
        }) as RoutineObject,
    );
  }

  async getColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.getPool().query(
      `SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk,
        CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_fk
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'FOREIGN KEY'
      ) fk ON c.column_name = fk.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position`,
      [schema, table],
    );

    return result.rows.map((r) => ({
      name: r.column_name,
      dataType: r.data_type,
      nullable: r.is_nullable === "YES",
      defaultValue: r.column_default,
      isPrimaryKey: r.is_pk,
      isForeignKey: r.is_fk,
      maxLength: r.character_maximum_length,
    }));
  }

  async getIndexes(schema: string, table: string): Promise<IndexInfo[]> {
    const result = await this.getPool().query(
      `SELECT
        i.relname AS index_name,
        array_agg(a.attname ORDER BY k.n) AS columns,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = $1 AND t.relname = $2
      GROUP BY i.relname, ix.indisunique, ix.indisprimary
      ORDER BY i.relname`,
      [schema, table],
    );

    return result.rows.map((r) => ({
      name: r.index_name,
      columns: r.columns,
      isUnique: r.is_unique,
      isPrimary: r.is_primary,
    }));
  }

  async getForeignKeys(
    schema: string,
    table: string,
  ): Promise<ForeignKeyInfo[]> {
    const result = await this.getPool().query(
      `SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column,
        ccu.table_schema AS referenced_schema
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.constraint_name`,
      [schema, table],
    );

    return result.rows.map((r) => ({
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
    let paramIndex = 1;

    // Build WHERE clause
    let whereClause = "";
    if (filters && filters.length > 0) {
      const conditions = filters.map((f) => {
        const col = `"${f.column}"`;
        switch (f.operator) {
          case "eq":
            params.push(f.value);
            return `${col} = $${paramIndex++}`;
          case "neq":
            params.push(f.value);
            return `${col} != $${paramIndex++}`;
          case "gt":
            params.push(f.value);
            return `${col} > $${paramIndex++}`;
          case "gte":
            params.push(f.value);
            return `${col} >= $${paramIndex++}`;
          case "lt":
            params.push(f.value);
            return `${col} < $${paramIndex++}`;
          case "lte":
            params.push(f.value);
            return `${col} <= $${paramIndex++}`;
          case "like":
            params.push(`%${f.value}%`);
            return `${col}::text LIKE $${paramIndex++}`;
          case "ilike":
            params.push(`%${f.value}%`);
            return `${col}::text ILIKE $${paramIndex++}`;
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

    // Build ORDER BY
    const orderClause = sort
      ? `ORDER BY "${sort.column}" ${sort.direction === "desc" ? "DESC" : "ASC"}`
      : "";

    const qualifiedTable = `"${schema}"."${table}"`;

    // Get total count
    const countResult = await this.getPool().query(
      `SELECT COUNT(*) as total FROM ${qualifiedTable} ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get data
    const offset = page * pageSize;
    const dataParams = [...params, pageSize, offset];
    const dataResult = await this.getPool().query(
      `SELECT * FROM ${qualifiedTable} ${whereClause} ${orderClause} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      dataParams,
    );

    const columns = await this.getColumns(schema, table);

    return {
      columns,
      rows: dataResult.rows,
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
    let paramIndex = 1;

    for (const [col, val] of Object.entries(changes)) {
      setClauses.push(`"${col}" = $${paramIndex++}`);
      params.push(val);
    }

    const whereClauses: string[] = [];
    for (const [col, val] of Object.entries(pk)) {
      whereClauses.push(`"${col}" = $${paramIndex++}`);
      params.push(val);
    }

    await this.getPool().query(
      `UPDATE "${schema}"."${table}" SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
      params,
    );
  }

  async insertRow(
    schema: string,
    table: string,
    row: RowChanges,
  ): Promise<void> {
    const columns = Object.keys(row)
      .map((c) => `"${c}"`)
      .join(", ");
    const params = Object.values(row);
    const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");

    await this.getPool().query(
      `INSERT INTO "${schema}"."${table}" (${columns}) VALUES (${placeholders})`,
      params,
    );
  }

  async deleteRow(schema: string, table: string, pk: PkMap): Promise<void> {
    const params: unknown[] = [];
    const whereClauses: string[] = [];
    let paramIndex = 1;

    for (const [col, val] of Object.entries(pk)) {
      whereClauses.push(`"${col}" = $${paramIndex++}`);
      params.push(val);
    }

    await this.getPool().query(
      `DELETE FROM "${schema}"."${table}" WHERE ${whereClauses.join(" AND ")}`,
      params,
    );
  }

  async getTableDdl(schema: string, table: string): Promise<string> {
    const pool = this.getPool();
    const typeResult = await pool.query(
      "SELECT table_type FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
      [schema, table],
    );

    if (typeResult.rows.length > 0 && typeResult.rows[0].table_type === "VIEW") {
      const viewDefResult = await pool.query(
        "SELECT pg_get_viewdef($1::regclass, true) as def",
        [`"${schema}"."${table}"`],
      );
      if (viewDefResult.rows.length > 0) {
        return `CREATE VIEW "${schema}"."${table}" AS\n${viewDefResult.rows[0].def}`;
      }
    }

    const columns = await this.getColumns(schema, table);
    const indexes = await this.getIndexes(schema, table);
    const fks = await this.getForeignKeys(schema, table);

    let ddl = `CREATE TABLE "${schema}"."${table}" (\n`;
    const colDefs = columns.map((c) => {
      let def = `  "${c.name}" ${c.dataType}`;
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

    // Primary key
    const pkCols = columns
      .filter((c) => c.isPrimaryKey)
      .map((c) => `"${c.name}"`);
    if (pkCols.length > 0) {
      colDefs.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
    }

    // Foreign keys
    for (const fk of fks) {
      colDefs.push(
        `  FOREIGN KEY ("${fk.columnName}") REFERENCES "${fk.referencedSchema}"."${fk.referencedTable}"("${fk.referencedColumn}")`,
      );
    }

    ddl += colDefs.join(",\n");
    ddl += "\n);\n";

    // Indexes (non-primary)
    for (const idx of indexes) {
      if (!idx.isPrimary) {
        const unique = idx.isUnique ? "UNIQUE " : "";
        ddl += `\nCREATE ${unique}INDEX "${idx.name}" ON "${schema}"."${table}" (${idx.columns.map((c) => `"${c}"`).join(", ")});`;
      }
    }

    return ddl;
  }

  async getRoutineDdl(
    schema: string,
    routine: string,
    _type: "function" | "procedure",
  ): Promise<string> {
    const result = await this.getPool().query(
      `SELECT pg_get_functiondef(p.oid) AS def
       FROM pg_proc p
       JOIN pg_namespace n ON p.pronamespace = n.oid
       WHERE n.nspname = $1 AND p.proname = $2`,
      [schema, routine],
    );

    if (result.rows.length === 0) {
      throw new Error(`Routine ${schema}.${routine} not found.`);
    }

    return result.rows[0].def;
  }
}
