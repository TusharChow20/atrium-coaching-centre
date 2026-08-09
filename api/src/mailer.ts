import nodemailer from "nodemailer";
import { query } from "./db";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

const FROM = process.env.MAIL_FROM || "no-reply@atrium.local";

export async function sendMail(
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  if (!to) return;
  try {
    await transporter.sendMail({ from: FROM, to, subject, text });
  } catch (err) {
    // Email is a best-effort notification, not a transactional guarantee —
    // a failed send must never roll back or block the booking/cancel it
    // describes.
    console.error(`mail send failed to ${to}:`, err);
  }
}

export async function getAdminEmails(): Promise<string[]> {
  const admins = await query<{ email: string }>(
    "select email from person where kind = 'admin' and active",
  );
  return admins.map((a) => a.email);
}
