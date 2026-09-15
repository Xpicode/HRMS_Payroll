import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * SMTP transport from .env. `SMTP_HOST=json` selects nodemailer's JSON transport: nothing
 * leaves the machine, the "sent" message is returned as JSON (dev and tests). Unset = off.
 */
export type MailConfig = {
  configured: boolean;
  from: string | null;
  mode: "smtp" | "json" | "off";
};

export function mailConfig(): MailConfig {
  const e = env();
  if (!e.SMTP_HOST) return { configured: false, from: null, mode: "off" };
  return {
    configured: Boolean(e.SMTP_FROM),
    from: e.SMTP_FROM ?? null,
    mode: e.SMTP_HOST === "json" ? "json" : "smtp",
  };
}

let cached: Transporter | null = null;

export function transporter(): Transporter {
  if (cached) return cached;
  const e = env();
  if (!e.SMTP_HOST || !e.SMTP_FROM)
    throw new Error("SMTP is not configured (SMTP_HOST, SMTP_FROM).");
  cached =
    e.SMTP_HOST === "json"
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS ?? "" } : undefined,
          connectionTimeout: 15_000,
        });
  return cached;
}

export type SendResult = { providerId: string | null };

export async function sendMail(msg: {
  to: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
}): Promise<SendResult> {
  const e = env();
  const info = await transporter().sendMail({ from: e.SMTP_FROM, ...msg });
  const id = typeof info.messageId === "string" ? info.messageId : null;
  return { providerId: id };
}
