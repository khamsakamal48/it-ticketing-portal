// Applies the additive portal migrations (audit log table + views).
// The least-priv role (002_*) must be run separately by a DB superuser.
// Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, "..", "db");

const files = readdirSync(dbDir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .filter((f) => !f.includes("least_priv")) // needs superuser; run manually
  .sort();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE && process.env.PGSSLMODE !== "disable" ? { rejectUnauthorized: false } : false,
});

await client.connect();
for (const f of files) {
  process.stdout.write(`applying ${f} ... `);
  await client.query(readFileSync(join(dbDir, f), "utf8"));
  console.log("ok");
}
await client.end();
console.log("migrations complete");
