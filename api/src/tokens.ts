import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { query } from "./db";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24; 
const TOKEN_BYTES = 32;

export async function issuePasswordSetToken(personId: number): Promise<string> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const hash = await bcrypt.hash(raw, 12);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await query(
    "insert into password_reset_token (person_id, token_hash, expires_at) values ($1, $2, $3)",
    [personId, hash, expiresAt],
  );

  return raw;
}

export async function consumePasswordSetToken(
  personId: number,
  rawToken: string,
): Promise<boolean> {
  const rows = await query<{ id: number; token_hash: string }>(
    `select id, token_hash from password_reset_token
      where person_id = $1 and used_at is null and expires_at > now()
      order by created_at desc`,
    [personId],
  );

  for (const row of rows) {
    if (await bcrypt.compare(rawToken, row.token_hash)) {
      await query("update password_reset_token set used_at = now() where id = $1", [row.id]);
      return true;
    }
  }
  return false;
}