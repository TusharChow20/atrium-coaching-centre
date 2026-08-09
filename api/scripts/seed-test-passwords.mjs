
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import pg from "pg";

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function loadEnv() {
  const file = path.join(root, ".env");
  if (!existsSync(file)) {
    console.error("No .env found at repo root.");
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

const TEST_PASSWORD = "Password123!";

const highlighted = [
  { email: "admin@atrium.local", label: "admin" },
  { email: "oscar.lindqvist@atrium.local", label: "coach" },
  { email: "sofia.marino@atrium.local", label: "participant" },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const hash = await bcrypt.hash(TEST_PASSWORD, 12);

const result = await client.query(
  "update person set password_hash = $1 where active returning id, email, kind",
);

console.log(`Set password for ${result.rowCount} active account(s).`);
console.log(`All of them now use password: ${TEST_PASSWORD}\n`);

for (const account of highlighted) {
  const match = result.rows.find((r) => r.email === account.email);
  if (match) {
    console.log(
      `${account.label.padEnd(12)} ${account.email}  (id ${match.id}, kind ${match.kind})`,
    );
  } else {
    console.log(`NOT FOUND: ${account.email}`);
  }
}

await client.end();
