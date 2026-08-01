import { appendFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

const OUTBOX = path.join(process.cwd(), ".mail-outbox.log");

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * True when no SMTP server is configured. In that mode nothing is sent over the
 * network — mail is printed to the server console and appended to
 * `.mail-outbox.log` so magic links are usable without an email provider.
 */
export function isDevMailMode() {
  return !process.env.SMTP_HOST;
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMail(mail: Mail) {
  const from = process.env.MAIL_FROM ?? "Coach LMS <no-reply@coach-lms.local>";

  if (isDevMailMode()) {
    const entry = [
      "─".repeat(72),
      `[dev mail] ${new Date().toISOString()}`,
      `To:      ${mail.to}`,
      `Subject: ${mail.subject}`,
      "",
      mail.text,
      "",
    ].join("\n");

    console.log(entry);
    await appendFile(OUTBOX, `${entry}\n`, "utf8").catch(() => {
      // The outbox is a convenience; console output is the source of truth.
    });
    return { delivered: false as const };
  }

  await getTransporter().sendMail({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return { delivered: true as const };
}
