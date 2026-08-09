import { Router } from "express";
import { query } from "../db";
import { hashPassword } from "../auth";
import { consumePasswordSetToken } from "../tokens";

const router = Router();

router.post("/set-password", async (req, res) => {
  const { person_id, token, password } = req.body || {};

  if (!person_id || !token || !password) {
    res
      .status(400)
      .json({ error: "person_id, token and password are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "password must be at least 8 characters" });
    return;
  }

  const ok = await consumePasswordSetToken(Number(person_id), String(token));
  if (!ok) {
    res.status(400).json({ error: "that link is invalid or has expired" });
    return;
  }

  const hash = await hashPassword(password);
  await query("update person set password_hash = $1 where id = $2", [
    hash,
    person_id,
  ]);

  res.json({ ok: true });
});

export default router;
