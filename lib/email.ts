import "server-only";

import {createHash} from "node:crypto";
import nodemailer, {type Transporter} from "nodemailer";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailDeliveryError extends Error {
  constructor(public readonly code: "not-configured" | "invalid-config" | "delivery-failed") {
    super(code);
  }
}

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  user: string | null;
  password: string | null;
  fromName: string;
  fromEmail: string;
  siteUrl: string;
  orderAccessSecret: string;
};

function smtpConfig(): SmtpConfig | null {
  const host = process.env.CLIQO_SMTP_HOST?.trim();
  const port = Number(process.env.CLIQO_SMTP_PORT);
  const fromEmail = process.env.CLIQO_EMAIL_FROM?.trim().toLowerCase();
  const siteValue = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const user = process.env.CLIQO_SMTP_USER?.trim() || null;
  const password = process.env.CLIQO_SMTP_PASSWORD || null;
  const fromName = process.env.CLIQO_EMAIL_FROM_NAME?.trim() || "CliQo";
  const orderAccessSecret = process.env.CLIQO_ORDER_ACCESS_SECRET ?? "";
  const secure = process.env.CLIQO_SMTP_SECURE === "true" || port === 465;
  const localhost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const requireTLS = !secure && !localhost && process.env.CLIQO_SMTP_REQUIRE_TLS !== "false";

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535
      || !fromEmail || !emailPattern.test(fromEmail) || fromName.length > 100
      || orderAccessSecret.length < 32
      || Boolean(user) !== Boolean(password)) return null;
  try {
    const site = new URL(siteValue ?? "");
    if (!["http:", "https:"].includes(site.protocol) || site.username || site.password
        || (site.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(site.hostname))) return null;
    return {
      host, port, secure, requireTLS, user, password, fromName, fromEmail,
      siteUrl: site.origin, orderAccessSecret,
    };
  } catch {
    return null;
  }
}

export function emailTransportFingerprint() {
  const config = smtpConfig();
  if (!config) return null;
  return createHash("sha256").update(JSON.stringify([
    config.host, config.port, config.secure, config.requireTLS,
    config.user, config.password, config.fromName, config.fromEmail, config.siteUrl,
    config.orderAccessSecret,
  ])).digest("hex");
}

function transportFromConfig(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(config.user && config.password ? {auth: {user: config.user, pass: config.password}} : {}),
  });
}

export async function sendEmailTest(recipient: string) {
  const config = smtpConfig();
  const fingerprint = emailTransportFingerprint();
  if (!config || !fingerprint) throw new EmailDeliveryError("not-configured");
  if (!emailPattern.test(recipient) || recipient.length > 254) throw new EmailDeliveryError("invalid-config");
  const transport = transportFromConfig(config);
  try {
    await transport.verify();
    await transport.sendMail({
      from: {name: config.fromName, address: config.fromEmail},
      to: recipient,
      subject: "CliQo — اختبار البريد / Email delivery test",
      text: "تم إرسال رسالة الاختبار بنجاح. Transactional email delivery is ready.",
      html: "<div dir=\"rtl\" style=\"font:16px Arial,Tahoma,sans-serif;color:#183a32\"><strong style=\"color:#000000\">CliQo</strong><p>تم إرسال رسالة الاختبار بنجاح.</p><p dir=\"ltr\">Transactional email delivery is ready.</p></div>",
    });
    return fingerprint;
  } catch {
    throw new EmailDeliveryError("delivery-failed");
  } finally {
    transport.close();
  }
}

export function createEmailTransport() {
  const config = smtpConfig();
  if (!config) throw new EmailDeliveryError("not-configured");
  return {
    transport: transportFromConfig(config),
    from: {name: config.fromName, address: config.fromEmail},
    siteUrl: config.siteUrl,
  };
}
