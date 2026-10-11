import { Client } from "pg";

export interface DbQueryResult {
  success: boolean;
  now?: string;
  version?: string;
  database?: string;
  tablesCount?: number;
  tables?: string[];
  latencyMs?: number;
  connectionStringSource?: string;
  error?: string;
}

export interface HyperdriveBinding {
  connectionString: string;
}

/**
 * Cloudflare Hyperdrive経由でSupabase PostgreSQLへの接続を確認する。
 *
 * @param hyperdriveBinding WranglerのHYPERDRIVEバインディング
 */
export async function testDatabaseConnection(
  hyperdriveBinding?: HyperdriveBinding,
): Promise<DbQueryResult> {
  const startTime = Date.now();

  let connectionString: string | undefined;
  let connectionStringSource = "none";

  // Cloudflare WorkersではHyperdriveを優先する
  if (hyperdriveBinding?.connectionString) {
    connectionString = hyperdriveBinding.connectionString;
    connectionStringSource = "Cloudflare Hyperdrive";
  } else if (process.env.NODE_ENV !== "production") {
    // ローカルのVinext開発用
    connectionString = process.env.DATABASE_URL;
    connectionStringSource = connectionString ? "Local DATABASE_URL" : "none";
  }

  if (!connectionString) {
    return {
      success: false,
      error:
        "Database connection is not configured. " +
        "Pass HYPERDRIVE in Cloudflare Workers or set DATABASE_URL locally.",
      latencyMs: Date.now() - startTime,
      connectionStringSource,
    };
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
    // Hyperdrive経由では接続先のTLS設定に従う。
    // SSL設定を独自に上書きしない。
  });

  try {
    await client.connect();

    const infoResult = await client.query<{
      current_time: Date;
      version: string;
      database_name: string;
      tables_count: number;
    }>(`
      SELECT
        NOW() AS current_time,
        version() AS version,
        current_database() AS database_name,
        (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables_count
    `);

    const tablesResult = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
      LIMIT 10
    `);

    const row = infoResult.rows[0];

    return {
      success: true,
      now: row?.current_time
        ? new Date(row.current_time).toISOString()
        : undefined,
      version: row?.version,
      database: row?.database_name,
      tablesCount: row?.tables_count ?? 0,
      tables: tablesResult.rows.map((r) => r.table_name),
      latencyMs: Date.now() - startTime,
      connectionStringSource,
    };
  } catch {
    return {
      success: false,
      error: "Database connection or query failed. Check the database and Hyperdrive configuration.",
      latencyMs: Date.now() - startTime,
      connectionStringSource,
    };
  } finally {
    // Hyperdriveの接続プールはCloudflare側が管理する。
    // クライアント側の接続は必ず終了する。
    try {
      await client.end();
    } catch {
      // 元の接続エラーを優先する
    }
  }
}
