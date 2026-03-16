import * as sql from "mssql";
import type {
  ColumnInfo,
  DbSchema,
  FilterOption,
  ForeignKeyInfo,
  IndexInfo,
  MssqlConnectionConfig,
  PkMap,
  QueryResult,
  RoutineObject,
  RowChanges,
  SchemaObject,
  SortOption,
  TableDataResult,
} from "../ConnectionConfig";
import type { IDbAdapter } from "./IDbAdapter";

export class MssqlAdapter implements IDbAdapter {
  private pool: sql.ConnectionPool | null = null;
  private _connected = false;

  constructor(
    public readonly config: MssqlConnectionConfig,
    private password: string,
  ) {}

  private getSqlConfig(): sql.config {
    return {
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.password,
      options: {
        encrypt: this.config.ssl ?? true,
        trustServerCertificate: this.config.trustServerCertificate ?? true,
      },
      connectionTimeout: 10000,
      requestTimeout: 180000,
    };
  }

  async connect(): Promise<void> {
    this.pool = await new sql.ConnectionPool(this.getSqlConfig()).connect();
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
    this._connected = false;
  }

  async testConnection(): Promise<boolean> {
    const testPool = await new sql.ConnectionPool({
      ...this.getSqlConfig(),
      connectionTimeout: 5000,
    }).connect();
    try {
      await testPool.request().query("SELECT 1 AS result");
      return true;
    } finally {
      await testPool.close();
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  private getPool(): sql.ConnectionPool {
    if (!this.pool) {
      throw new Error("Not connected to database");
    }
    return this.pool;
  }

  async query(sqlText: string): Promise<QueryResult> {
    const pool = this.getPool();
    const start = Date.now();
    const result = await pool.request().query(sqlText);
    const duration = Date.now() - start;

    const columns: ColumnInfo[] = (
      result.recordset?.columns
        ? Object.entries(result.recordset.columns).map(([name, col]) => ({
            name,
            dataType:
              sql.TYPES[col.type as unknown as keyof typeof sql.TYPES]?.name ||
              String(col.type),
            nullable: col.nullable,
            defaultValue: null,
            isPrimaryKey: false,
            isForeignKey: false,
            maxLength: col.length ?? null,
          }))
        : []
    ) as ColumnInfo[];

    return {
      columns,
      rows: result.recordset || [],
      rowCount: result.rowsAffected?.[0] ?? (result.recordset?.length || 0),
      duration,
    };
  }

  async getSchema(): Promise<DbSchema> {
    const schemas = await this.getSchemas();
    const pool = this.getPool();

    const tablesResult = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA != 'sys'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    const viewsResult = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA != 'sys'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    const functionsResult = await pool.request().query(`
      SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_SCHEMA != 'sys'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `);

    return {
      schemas,
      tables: tablesResult.recordset.map(
        (r: Record<string, string>) =>
          ({ name: r.TABLE_NAME, schema: r.TABLE_SCHEMA }) as SchemaObject,
      ),
      views: viewsResult.recordset.map(
        (r: Record<string, string>) =>
          ({ name: r.TABLE_NAME, schema: r.TABLE_SCHEMA }) as SchemaObject,
      ),
      functions: functionsResult.recordset.map(
        (r: Record<string, string>) =>
          ({
            name: r.ROUTINE_NAME,
            schema: r.ROUTINE_SCHEMA,
            type: r.ROUTINE_TYPE?.toLowerCase() === "procedure" ? "procedure" : "function",
          }) as RoutineObject,
      ),
    };
  }

  async getSchemas(): Promise<string[]> {
    const result = await this.getPool()
      .request()
      .query(`
      SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
      ORDER BY SCHEMA_NAME
    `);
    return result.recordset.map((r: Record<string, string>) => r.SCHEMA_NAME);
  }

  async getTables(schema: string): Promise<string[]> {
    const result = await this.getPool()
      .request()
      .input("schema", sql.NVarChar, schema)
      .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = @schema AND TABLE_TYPE = 'BASE TABLE'
              ORDER BY TABLE_NAME`);
    return result.recordset.map((r: Record<string, string>) => r.TABLE_NAME);
  }

  async getViews(schema: string): Promise<string[]> {
    const result = await this.getPool()
      .request()
      .input("schema", sql.NVarChar, schema)
      .query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS
              WHERE TABLE_SCHEMA = @schema
              ORDER BY TABLE_NAME`);
    return result.recordset.map((r: Record<string, string>) => r.TABLE_NAME);
  }

  async getFunctions(schema: string): Promise<RoutineObject[]> {
    const result = await this.getPool()
      .request()
      .input("schema", sql.NVarChar, schema)
      .query(`SELECT ROUTINE_NAME, ROUTINE_TYPE FROM INFORMATION_SCHEMA.ROUTINES
              WHERE ROUTINE_SCHEMA = @schema
              ORDER BY ROUTINE_NAME`);
    return result.recordset.map((r: Record<string, string>) => ({
      name: r.ROUTINE_NAME,
      schema: schema,
      type: r.ROUTINE_TYPE?.toLowerCase() === "procedure" ? "procedure" : "function",
    }));
  }

  async getColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.getPool()
      .request()
      .input("schema", sql.NVarChar, schema)
      .input("table", sql.NVarChar, table)
      .query(`
        SELECT
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.IS_NULLABLE,
          c.COLUMN_DEFAULT,
          c.CHARACTER_MAXIMUM_LENGTH,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_pk,
          CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_fk
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT kcu.COLUMN_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          WHERE tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @table AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        LEFT JOIN (
          SELECT kcu.COLUMN_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          WHERE tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @table AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        ) fk ON c.COLUMN_NAME = fk.COLUMN_NAME
        WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
        ORDER BY c.ORDINAL_POSITION
      `);

    return result.recordset.map((r: Record<string, unknown>) => ({
      name: r.COLUMN_NAME as string,
      dataType: r.DATA_TYPE as string,
      nullable: r.IS_NULLABLE === "YES",
      defaultValue: (r.COLUMN_DEFAULT as string) || null,
      isPrimaryKey: r.is_pk === 1,
      isForeignKey: r.is_fk === 1,
      maxLength: (r.CHARACTER_MAXIMUM_LENGTH as number) || null,
    }));
  }

  async getIndexes(schema: string, table: string): Promise<IndexInfo[]> {
    const result = await this.getPool()
      .request()
      .input("schema", sql.NVarChar, schema)
      .input("table", sql.NVarChar, table)
      .query(`
        SELECT
          i.name AS index_name,
          STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns,
          i.is_unique,
          i.is_primary_key
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        JOIN sys.tables t ON i.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name = @table
        GROUP BY i.name, i.is_unique, i.is_primary_key
        ORDER BY i.name
      `);

    return result.recordset.map((r: Record<string, unknown>) => ({
      name: r.index_name as string,
      columns: (r.columns as string).split(","),
      isUnique: r.is_unique as boolean,
      isPrimary: r.is_primary_key as boolean,
    }));
  }

  async getForeignKeys(
    schema: string,
    table: string,
  ): Promise<ForeignKeyInfo[]> {
    const result = await this.getPool()
      .request()
      .input("schema", sql.NVarChar, schema)
      .input("table", sql.NVarChar, table)
      .query(`
        SELECT
          fk.name AS constraint_name,
          COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
          OBJECT_NAME(fkc.referenced_object_id) AS referenced_table,
          COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column,
          SCHEMA_NAME(rt.schema_id) AS referenced_schema
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        JOIN sys.tables t ON fk.parent_object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
        WHERE s.name = @schema AND t.name = @table
        ORDER BY fk.name
      `);

    return result.recordset.map((r: Record<string, string>) => ({
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
    const request = this.getPool().request();
    const qualifiedTable = `[${schema}].[${table}]`;

    // Build WHERE
    let whereClause = "";
    if (filters && filters.length > 0) {
      const conditions = filters.map((f, i) => {
        const paramName = `filter${i}`;
        const col = `[${f.column}]`;
        switch (f.operator) {
          case "eq":
            request.input(paramName, sql.NVarChar, f.value);
            return `${col} = @${paramName}`;
          case "neq":
            request.input(paramName, sql.NVarChar, f.value);
            return `${col} != @${paramName}`;
          case "gt":
            request.input(paramName, sql.NVarChar, f.value);
            return `${col} > @${paramName}`;
          case "gte":
            request.input(paramName, sql.NVarChar, f.value);
            return `${col} >= @${paramName}`;
          case "lt":
            request.input(paramName, sql.NVarChar, f.value);
            return `${col} < @${paramName}`;
          case "lte":
            request.input(paramName, sql.NVarChar, f.value);
            return `${col} <= @${paramName}`;
          case "like":
            request.input(paramName, sql.NVarChar, `%${f.value}%`);
            return `CAST(${col} AS NVARCHAR(MAX)) LIKE @${paramName}`;
          case "ilike":
            request.input(paramName, sql.NVarChar, `%${f.value}%`);
            return `CAST(${col} AS NVARCHAR(MAX)) LIKE @${paramName}`;
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
    const countRequest = this.getPool().request();
    // Re-add filter params for count query
    if (filters) {
      filters.forEach((f, i) => {
        if (f.operator !== "is_null" && f.operator !== "is_not_null") {
          const val =
            f.operator === "like" || f.operator === "ilike"
              ? `%${f.value}%`
              : f.value;
          countRequest.input(`filter${i}`, sql.NVarChar, val);
        }
      });
    }
    const countResult = await countRequest.query(
      `SELECT COUNT(*) AS total FROM ${qualifiedTable} ${whereClause}`,
    );
    const total = countResult.recordset[0].total;

    // Order
    const orderClause = sort
      ? `ORDER BY [${sort.column}] ${sort.direction === "desc" ? "DESC" : "ASC"}`
      : "ORDER BY (SELECT NULL)";

    const offset = page * pageSize;
    request.input("offset", sql.Int, offset);
    request.input("pageSize", sql.Int, pageSize);

    const dataResult = await request.query(
      `SELECT * FROM ${qualifiedTable} ${whereClause} ${orderClause} OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    );

    const columns = await this.getColumns(schema, table);

    return {
      columns,
      rows: dataResult.recordset,
      total,
    };
  }

  async updateRow(
    schema: string,
    table: string,
    pk: PkMap,
    changes: RowChanges,
  ): Promise<void> {
    const request = this.getPool().request();
    const setClauses: string[] = [];
    let i = 0;

    for (const [col, val] of Object.entries(changes)) {
      if (val === "$HAPPYDB_NOW$") {
        setClauses.push(`[${col}] = GETDATE()`);
      } else {
        const paramName = `set${i++}`;
        setClauses.push(`[${col}] = @${paramName}`);
        request.input(paramName, val as sql.ISqlType);
      }
    }

    const whereClauses: string[] = [];
    for (const [col, val] of Object.entries(pk)) {
      const paramName = `pk${i++}`;
      whereClauses.push(`[${col}] = @${paramName}`);
      request.input(paramName, val as sql.ISqlType);
    }

    await request.query(
      `UPDATE [${schema}].[${table}] SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
    );
  }

  async insertRow(
    schema: string,
    table: string,
    row: RowChanges,
  ): Promise<void> {
    const request = this.getPool().request();
    const columns: string[] = [];
    const values: string[] = [];
    let i = 0;

    for (const [col, val] of Object.entries(row)) {
      columns.push(`[${col}]`);
      if (val === "$HAPPYDB_NOW$") {
        values.push("GETDATE()");
      } else {
        const paramName = `ins${i++}`;
        values.push(`@${paramName}`);
        request.input(paramName, val as sql.ISqlType);
      }
    }

    await request.query(
      `INSERT INTO [${schema}].[${table}] (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    );
  }

  async deleteRow(schema: string, table: string, pk: PkMap): Promise<void> {
    const request = this.getPool().request();
    const whereClauses: string[] = [];
    let i = 0;

    for (const [col, val] of Object.entries(pk)) {
      const paramName = `pk${i++}`;
      whereClauses.push(`[${col}] = @${paramName}`);
      request.input(paramName, val as sql.ISqlType);
    }

    await request.query(
      `DELETE FROM [${schema}].[${table}] WHERE ${whereClauses.join(" AND ")}`,
    );
  }

  async getTableDdl(schema: string, table: string): Promise<string> {
    const pool = this.getPool();
    const typeResult = await pool.request()
      .input("schema", sql.NVarChar, schema)
      .input("table", sql.NVarChar, table)
      .query("SELECT TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table");

    if (typeResult.recordset.length > 0 && typeResult.recordset[0].TABLE_TYPE === "VIEW") {
      const viewDefResult = await pool.request()
        .input("schema", sql.NVarChar, schema)
        .input("table", sql.NVarChar, table)
        .query("SELECT OBJECT_DEFINITION(OBJECT_ID(@schema + '.' + @table)) as def");
      
      if (viewDefResult.recordset.length > 0 && viewDefResult.recordset[0].def) {
        return viewDefResult.recordset[0].def;
      }
    }

    const columns = await this.getColumns(schema, table);
    const indexes = await this.getIndexes(schema, table);
    const fks = await this.getForeignKeys(schema, table);

    let ddl = `CREATE TABLE [${schema}].[${table}] (\n`;
    const colDefs = columns.map((c) => {
      let def = `  [${c.name}] ${c.dataType}`;
      if (c.maxLength && c.maxLength > 0) {
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
      .map((c) => `[${c.name}]`);
    if (pkCols.length > 0) {
      colDefs.push(`  PRIMARY KEY (${pkCols.join(", ")})`);
    }

    for (const fk of fks) {
      colDefs.push(
        `  FOREIGN KEY ([${fk.columnName}]) REFERENCES [${fk.referencedSchema}].[${fk.referencedTable}]([${fk.referencedColumn}])`,
      );
    }

    ddl += colDefs.join(",\n");
    ddl += "\n);\n";

    for (const idx of indexes) {
      if (!idx.isPrimary) {
        const unique = idx.isUnique ? "UNIQUE " : "";
        ddl += `\nCREATE ${unique}INDEX [${idx.name}] ON [${schema}].[${table}] (${idx.columns.map((c) => `[${c}]`).join(", ")});`;
      }
    }

    return ddl;
  }

  async getRoutineDdl(
    schema: string,
    routine: string,
    _type: "function" | "procedure",
  ): Promise<string> {
    const result = await this.getPool()
      .request()
      .input("schema", sql.NVarChar, schema)
      .input("routine", sql.NVarChar, routine)
      .query(`
        SELECT OBJECT_DEFINITION(OBJECT_ID(@schema + '.' + @routine)) AS def
      `);

    if (result.recordset.length === 0 || !result.recordset[0].def) {
      throw new Error(`Routine ${schema}.${routine} not found.`);
    }

    return result.recordset[0].def;
  }
}
