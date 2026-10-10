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

export async function testDatabaseConnection(hyperdriveBinding?: { connectionString?: string }): Promise<DbQueryResult> {
  const startTime = Date.now();

  // Determine connection string from parameter, environment variables, or global Worker bindings
  let connectionString: string | undefined = undefined;
  let connectionStringSource = "none";

  if (hyperdriveBinding?.connectionString) {
    connectionString = hyperdriveBinding.connectionString;
    connectionStringSource = "Hyperdrive parameter binding";
  } else if (process.env.DATABASE_URL) {
    connectionString = process.env.DATABASE_URL;
    connectionStringSource = "DATABASE_URL env";
  } else if (process.env.HYPERDRIVE_URL) {
    connectionString = process.env.HYPERDRIVE_URL;
    connectionStringSource = "HYPERDRIVE_URL env";
  } else if ((process.env as any).HYPERDRIVE?.connectionString) {
    connectionString = (process.env as any).HYPERDRIVE.connectionString;
    connectionStringSource = "HYPERDRIVE env binding";
  }

  if (!connectionString) {
    return {
      success: false,
      error: "Database connection string is not configured. Please set DATABASE_URL, HYPERDRIVE_URL, or bind a HYPERDRIVE resource.",
      latencyMs: Date.now() - startTime,
      connectionStringSource,
    };
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();

    const infoResult = await client.query(
      "SELECT NOW() as current_time, version() as version, current_database() as database_name"
    );

    const tablesResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LIMIT 10"
    );

    await client.end();

    const latencyMs = Date.now() - startTime;
    const row = infoResult.rows[0] || {};

    return {
      success: true,
      now: row.current_time ? new Date(row.current_time).toISOString() : undefined,
      version: row.version,
      database: row.database_name,
      tablesCount: tablesResult.rowCount ?? 0,
      tables: tablesResult.rows.map((r: { table_name: string }) => r.table_name),
      latencyMs,
      connectionStringSource,
    };
  } catch (err) {
    try {
      await client.end();
    } catch {
      // Ignore cleanup error
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startTime,
      connectionStringSource,
    };
  }
}
