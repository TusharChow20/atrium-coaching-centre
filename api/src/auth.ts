import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { Request, Response, NextFunction } from "express";
import { query } from "./db";

export const SESSION_COOKIE = "atrium_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const BCRYPT_ROUNDS = 12;

function sessionSecret(): string {
  return process.env.SESSION_SECRET || "change-me";
}

// Legacy used only to verify old seed data hashes, never for new passwords
function legacySha256(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  personId: number,
): Promise<boolean> {
  const isBcrypt = storedHash.startsWith("$2");

  if (isBcrypt) {
    return bcrypt.compare(password, storedHash);
  }

  if (legacySha256(password) !== storedHash) {
    return false;
  }

  const upgraded = await hashPassword(password);
  await query("update person set password_hash = $1 where id = $2", [
    upgraded,
    personId,
  ]);
  return true;
}

export function signSession(
  personId: number,
  issuedAt: number = Date.now(),
): string {
  const payload = `${personId}.${issuedAt}`;
  const mac = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${mac}`;
}

export function readSession(
  cookie: string | undefined,
): { personId: number; issuedAt: number } | null {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;

  const payload = `${parts[0]}.${parts[1]}`;
  const mac = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
  if (mac !== parts[2]) return null;

  const personId = Number(parts[0]);
  const issuedAt = Number(parts[1]);
  if (!Number.isInteger(personId) || !Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) return null;

  return { personId, issuedAt };
}

export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const session = readSession(
    req.cookies ? req.cookies[SESSION_COOKIE] : undefined,
  );
  if (!session) {
    res.status(401).json({ error: "not signed in" });
    return;
  }
  res.locals.personId = session.personId;
  next();
}

// role must be attached by a preceding middleware — see attachRole below
export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const kind = res.locals.personKind as string | undefined;
    if (!kind || !allowed.includes(kind)) {
      res.status(403).json({ error: "not permitted for this role" });
      return;
    }
    next();
  };
}

export async function attachRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const people = await query(
      "select kind, active from person where id = $1",
      [res.locals.personId],
    );
    if (people.length === 0 || !people[0].active) {
      res.status(401).json({ error: "account not found or inactive" });
      return;
    }
    res.locals.personKind = people[0].kind;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not verify role" });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const email = req.body ? req.body.email : undefined;
  const password = req.body ? req.body.password : undefined;

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  try {
    const people = await query(
      "select id, email, full_name, kind, password_hash, active from person where email = $1",
      [email],
    );

    if (people.length === 0) {
      res.status(401).json({ error: "invalid email or password" });
      return;
    }

    const person = people[0];

    if (!person.active) {
      res.status(403).json({ error: "this account is inactive" });
      return;
    }

    const ok = await verifyPassword(password, person.password_hash, person.id);
    if (!ok) {
      res.status(401).json({ error: "invalid email or password" });
      return;
    }

    res.cookie(SESSION_COOKIE, signSession(person.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS,
    });

    // for frrontend reedeirection
    res.json({
      id: person.id,
      email: person.email,
      full_name: person.full_name,
      kind: person.kind,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not sign in" });
  }
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ signed_out: true });
}

export async function me(_req: Request, res: Response): Promise<void> {
  try {
    const people = await query(
      "select id, email, full_name, kind, credits, active from person where id = $1",
      [res.locals.personId],
    );
    if (people.length === 0 || !people[0].active) {
      res.status(401).json({ error: "not signed in" });
      return;
    }
    res.json(people[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load the current user" });
  }
}
