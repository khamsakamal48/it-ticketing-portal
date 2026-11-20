// Portal-role rights for a TEAM database (e.g. scholarship). Never needed on IT
// prod (IT's portal_app rights come from db/002 + migrations).
// Gives PORTAL_ROLE exactly IT's portal_app rights plus ticket_assignees, and on
// any database other than it_ticketing_system strips portal_app (which the
// migrations re-grant whenever that role exists on the server).
// Run as the database owner, right after every migrate (npm run db:deploy).
// Usage: DATABASE_URL=postgresql://<owner>@.../<db> PORTAL_ROLE=sch_portal_app node scripts/grants.mjs
import pg from "pg";

const role = process.env.PORTAL_ROLE;
if (!role) {
  console.error("PORTAL_ROLE is required (e.g. sch_portal_app)");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE && process.env.PGSSLMODE !== "disable" ? { rejectUnauthorized: false } : false,
});
await client.connect();

const { rows: [{ db }] } = await client.query("SELECT current_database() AS db");
if (db === "it_ticketing_system") {
  console.error("Refusing to run on it_ticketing_system: IT rights come from db/002 and the migrations.");
  process.exit(1);
}
const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
if (!rowCount) {
  console.error(`Role ${role} does not exist; create it first (db/new-team/create_team_db.sql).`);
  process.exit(1);
}

const r = client.escapeIdentifier(role);
const d = client.escapeIdentifier(db);
const statements = [
  `GRANT CONNECT ON DATABASE ${d} TO ${r}`,
  `GRANT USAGE ON SCHEMA public TO ${r}`,
  `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${r}`,
  `GRANT INSERT, UPDATE ON tickets, messages, ticket_tags, contacts, ticket_assignees TO ${r}`,
  `GRANT INSERT ON ticket_audit_log TO ${r}`,
  `GRANT SELECT, UPDATE ON ticket_feedback TO ${r}`,
  `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`,
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${r}`,
];
const { rowCount: hasPortalApp } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'portal_app'");
if (hasPortalApp && role !== "portal_app") {
  statements.push(
    "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM portal_app",
    "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM portal_app",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM portal_app",
    `REVOKE ALL ON DATABASE ${d} FROM portal_app`,
  );
}
for (const s of statements) await client.query(s);

const { rows } = await client.query(
  "SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs " +
    "FROM information_schema.role_table_grants WHERE grantee IN ($1, 'portal_app') " +
    "GROUP BY 1, 2 ORDER BY 1, 2",
  [role],
);
console.log(`grants applied on ${db} for ${role}:`);
for (const row of rows) console.log(`  ${row.grantee}\t${row.table_name}\t${row.privs}`);
await client.end();
