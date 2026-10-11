import { env } from "cloudflare:workers";
import { Client } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { getUserDatabase } from "./user";

export type UserImportTransaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** CSV writes must run inside this callback. Never accept caller-provided claims or roles. */
export async function withUserImportTransaction<T>(
  work: (tx: UserImportTransaction, userId: string) => Promise<T>,
): Promise<T> {
  const { claims, user } = await getUserDatabase();
  const connectionString = env.HYPERDRIVE?.connectionString ??
    (process.env.NODE_ENV !== "production" ? process.env.DATABASE_URL : undefined);
  if (!connectionString) throw new Error("Database import connection is not configured.");

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
    statement_timeout: 15000,
  });
  try {
    await client.connect();
    return await drizzle(client).transaction(async (tx) => {
      // Both settings expire at COMMIT/ROLLBACK, including on a pooled connection.
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`
        select
          set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
          set_config('request.jwt.claim.sub', ${user.id}, true),
          set_config('request.jwt.claim.role', 'authenticated', true)
      `);
      await tx.execute(sql`set local row_security = on`);
      const guard = await tx.execute<{ rls_ready: boolean }>(sql`
        select (c.relrowsecurity and not r.rolsuper and not r.rolbypassrls
          and (c.relforcerowsecurity or c.relowner <> r.oid)) as rls_ready
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_roles r on r.rolname = current_user
        where n.nspname = 'public' and c.relname = 'transactions_work'
      `);
      if (guard.rows[0]?.rls_ready !== true) {
        throw new Error("transactions_work RLS must be enabled for authenticated imports.");
      }
      return work(tx, user.id);
    });
  } finally {
    await client.end().catch(() => {});
  }
}
