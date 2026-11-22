import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { buildBrandedMailboxEmail } from "@/lib/email-templates";

export const mailboxes = {
  info: { email: "info@cliqoeg.com", passwordEnv: "CLIQO_MAIL_INFO_PASSWORD" },
  contacts: { email: "contacts@cliqoeg.com", passwordEnv: "CLIQO_MAIL_CONTACTS_PASSWORD" },
  admin: { email: "admin@cliqoeg.com", passwordEnv: "CLIQO_MAIL_ADMIN_PASSWORD" },
} as const;

export type MailboxKey = keyof typeof mailboxes;

export function isMailboxKey(value: string | null): value is MailboxKey {
  return !!value && Object.hasOwn(mailboxes, value);
}

function getPassword(key: MailboxKey) {
  const password = process.env[mailboxes[key].passwordEnv];
  if (!password) throw new Error("Mailbox credentials are not configured.");
  return password;
}

export async function connectMailbox(key: MailboxKey) {
  const client = new ImapFlow({
    host: process.env.CLIQO_MAIL_IMAP_HOST || "mail.cliqoeg.com",
    port: 993,
    secure: true,
    auth: { user: mailboxes[key].email, pass: getPassword(key) },
    logger: false,
  });
  await client.connect();
  return client;
}

export async function getMailboxStats(key: MailboxKey) {
  const client = await connectMailbox(key);
  try {
    const status = await client.status("INBOX", { messages: true, unseen: true, size: true });
    if (!status) throw new Error("Inbox status unavailable.");
    return { messages: status.messages ?? 0, unread: status.unseen ?? 0, bytes: status.size ?? 0 };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function getInbox(key: MailboxKey) {
  const client = await connectMailbox(key);
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  try {
    const count = typeof client.mailbox === "object" ? client.mailbox.exists : 0;
    if (!count) return { total: 0, messages: [] };
    const start = Math.max(1, count - 39);
    const messages = await client.fetchAll(`${start}:${count}`, {
      uid: true,
      flags: true,
      envelope: true,
      internalDate: true,
      size: true,
    });
    return {
      total: count,
      messages: messages.reverse().map((message) => ({
        uid: message.uid,
        subject: message.envelope?.subject || "(بدون عنوان)",
        from: (message.envelope?.from ?? []).map((address) => address.name ? `${address.name} <${address.address ?? ""}>` : address.address ?? "").filter(Boolean).join(", "),
        date: message.internalDate instanceof Date ? message.internalDate.toISOString() : new Date(message.internalDate ?? Date.now()).toISOString(),
        unread: !message.flags?.has("\\Seen"),
        size: message.size ?? 0,
      })),
    };
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

export async function getMessage(key: MailboxKey, uid: number) {
  const client = await connectMailbox(key);
  const lock = await client.getMailboxLock("INBOX", { readOnly: true });
  try {
    const message = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
    if (!message || !message.source) return null;
    if ((message.size ?? message.source.length) > 12 * 1024 * 1024) throw new Error("Message is too large to preview here.");
    const parsed = await simpleParser(message.source, { skipTextToHtml: true });
    return {
      subject: parsed.subject || "(بدون عنوان)",
      from: parsed.from?.text ?? "",
      to: parsed.to && !Array.isArray(parsed.to) ? parsed.to.text : Array.isArray(parsed.to) ? parsed.to.map((item) => item.text).join(", ") : "",
      date: parsed.date?.toISOString() ?? null,
      text: (parsed.text || "").slice(0, 120_000),
      attachments: parsed.attachments.map((attachment) => ({ filename: attachment.filename || "attachment", size: attachment.size, contentType: attachment.contentType })),
    };
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

export async function sendMailboxMessage(key: MailboxKey, to: string, subject: string, text: string) {
  const email = mailboxes[key].email;
  const branded = buildBrandedMailboxEmail({
    subject,
    text,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://cliqoeg.com",
  });
  const transport = nodemailer.createTransport({
    host: process.env.CLIQO_MAIL_SMTP_HOST || "mail.cliqoeg.com",
    port: 465,
    secure: true,
    auth: { user: email, pass: getPassword(key) },
  });
  try {
    return await transport.sendMail({ from: { name: "CliQo", address: email }, to, subject, ...branded });
  } finally {
    transport.close();
  }
}

export function mboxSeparator(message: FetchMessageObject) {
  const sender = message.envelope?.from?.[0]?.address || "MAILER-DAEMON";
  const dateValue = message.internalDate instanceof Date ? message.internalDate : new Date(message.internalDate ?? Date.now());
  return Buffer.from(`From ${sender.replace(/[\r\n]/g, "")} ${dateValue.toUTCString()}\r\n`, "utf8");
}

export function escapeMboxSource(source: Buffer) {
  return Buffer.from(source.toString("latin1").replace(/^From /gm, ">From "), "latin1");
}
