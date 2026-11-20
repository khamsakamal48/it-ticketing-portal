// Runs SQL assertion files in db/tests inside BEGIN ... ROLLBACK, so nothing persists.
// Connect as the database owner (it creates test users/tickets inside the transaction).
// Usage: DATABASE_URL=postgresql://<owner>@.../<db> node scripts/db-test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const testsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "tests");
const files = readdirSync(testsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE && process.env.PGSSLMODE !== "disable" ? { rejectUnauthorized: false } : false,
});
client.on("notice", (n) => console.log(`  notice: ${n.message}`));

await client.connect();
let failed = false;
for (const f of files) {
  process.stdout.write(`${f} ... `);
  try {
    await client.query("BEGIN");
    await client.query(readFileSync(join(testsDir, f), "utf8"));
    console.log("ok");
  } catch (err) {
    failed = true;
    console.log(`FAILED: ${err.message}`);
  } finally {
    await client.query("ROLLBACK");
  }
}
await client.end();
process.exit(failed ? 1 : 0);
