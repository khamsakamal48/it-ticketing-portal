import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Single pooled connection to the AWS Postgres (reached over the Tailscale
// tunnel in prod, or localhost in dev). Uses the least-privilege `portal_app`
// role: SELECT on all ticket tables, INSERT/UPDATE only on the tables the
// portal mutates. No DDL / DELETE / cross-database access.

const sslMode = process.env.PGSSLMODE ?? "disable";

function sslConfig() {
  if (sslMode === "disable") return false;
  // verify-full with the AWS CA bundle when provided
  const ca = process.env.PGSSLROOTCERT;
  if (sslMode === "verify-full" && ca) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    return { ca: fs.readFileSync(ca).toString(), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: sslMode !== "no-verify" };
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") global.__pgPool = pool;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool.query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Run fn inside a transaction; rolls back on throw. Used for write+audit atomicity.
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
