import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const file = join(root, ".env");
  if (!existsSync(file)) {
    console.error(
      "No .env found. Copy env.example to .env and set DATABASE_URL.",
    );
    process.exit(1);
  }
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

const dir = join(root, "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No migrations found in migrations/");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
} catch (err) {
  console.error(`Could not connect using DATABASE_URL: ${err.message}`);
  console.error(
    "Is PostgreSQL running, and does the database exist? See INSTRUCTIONS.md.",
  );
  process.exit(1);
}

// The starter had no migration tracking at all — every run re-applied every
// file, which fails the moment a table already exists. This makes the
// script safe to run repeatedly; only files not yet recorded here get run.
await client.query(`
  create table if not exists schema_migrations (
    filename    text primary key,
    applied_at  timestamptz not null default now()
  )
`);

const { rows: appliedRows } = await client.query(
  "select filename from schema_migrations",
);
const applied = new Set(appliedRows.map((r) => r.filename));
const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log(
    "Nothing to apply — everything in migrations/ is already recorded.",
  );
  await client.end();
  process.exit(0);
}

for (const file of pending) {
  process.stdout.write(`applying ${file} ... `);
  const sql = readFileSync(join(dir, file), "utf8");
  try {
    await client.query(sql);
    await client.query("insert into schema_migrations (filename) values ($1)", [
      file,
    ]);
    console.log("ok");
  } catch (err) {
    console.log("failed");
    console.error(`\n${file}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`\n${pending.length} migration(s) applied.`);
