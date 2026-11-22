"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useCopy } from "@/i18n/client";

type MailboxKey = "info" | "contacts" | "admin";
type MessageRow = { uid: number; subject: string; from: string; date: string; unread: boolean; size: number };
type MessageDetail = { subject: string; from: string; to: string; date: string | null; text: string; attachments: Array<{ filename: string; size: number; contentType: string }> };

const boxes: Array<{ id: MailboxKey; address: string }> = [
  { id: "info", address: "info@cliqoeg.com" },
  { id: "contacts", address: "contacts@cliqoeg.com" },
  { id: "admin", address: "admin@cliqoeg.com" },
];

function formatSize(bytes: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: "compact", style: "unit", unit: "byte", unitDisplay: "narrow" }).format(bytes);
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(value));
}

function MailIcon({ children }: { children: string }) {
  return <span className="admin-mail-icon" aria-hidden="true">{children}</span>;
}

export function AdminEmailWorkspace() {
  const tr = useCopy();
  const [activeBox, setActiveBox] = useState<MailboxKey>("info");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<MessageDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [compose, setCompose] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const loadInbox = useCallback(async (box: MailboxKey) => {
    setBusy(true);
    setSelected(null);
    try {
      const response = await fetch(`/api/admin/mail?box=${box}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load email.");
      setMessages(result.messages ?? []);
      setTotal(result.total ?? 0);
      setNotice("");
    } catch (error) {
      setMessages([]);
      setTotal(0);
      setNotice(error instanceof Error ? error.message : "Unable to load email.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadInbox(activeBox); }, [activeBox, loadInbox]);

  async function openMessage(uid: number) {
    setLoadingMessage(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/mail?box=${activeBox}&uid=${uid}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to open this message.");
      setSelected(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to open this message.");
    } finally {
      setLoadingMessage(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ box: activeBox, to: recipient, subject, text: body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send this message.");
      setNotice(tr("Message sent."));
      setRecipient(""); setSubject(""); setBody(""); setCompose(false);
      await loadInbox(activeBox);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to send this message.");
    } finally {
      setBusy(false);
    }
  }

  const activeAddress = boxes.find((box) => box.id === activeBox)?.address ?? boxes[0].address;
  const filteredMessages = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return messages;
    return messages.filter((message) => `${message.from} ${message.subject}`.toLocaleLowerCase().includes(needle));
  }, [messages, query]);

  return <div className="admin-mail-workspace" dir={tr.locale === "ar" ? "rtl" : "ltr"}>
    <header className="admin-mail-topbar">
      <label className="admin-mail-search">
        <MailIcon>⌕</MailIcon>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Search mail")} aria-label={tr("Search mail")} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label={tr("Clear search")}>×</button>}
      </label>
      <a className="admin-mail-webmail" href="https://webmail.cliqoeg.com/" target="_blank" rel="noreferrer">{tr("Open Roundcube")} ↗</a>
    </header>

    <div className="admin-mail-layout">
      <aside className="admin-mail-sidebar" aria-label={tr("Mailboxes")}>
        <button className="admin-mail-compose-trigger" type="button" onClick={() => { setCompose((value) => !value); setSelected(null); }}>
          <MailIcon>✎</MailIcon>{compose ? tr("Close") : tr("Compose")}
        </button>
        <div className="admin-mail-nav-label">{tr("Mailboxes")}</div>
        <nav className="admin-mail-mailboxes" role="tablist" aria-label={tr("Mailboxes")}>
          {boxes.map((box) => <button key={box.id} type="button" role="tab" aria-selected={activeBox === box.id} className={activeBox === box.id ? "active" : ""} onClick={() => { setActiveBox(box.id); setCompose(false); setQuery(""); }}>
            <MailIcon>{box.id === "info" ? "▣" : box.id === "contacts" ? "▤" : "⚙"}</MailIcon>
            <span><strong>{tr(box.id === "info" ? "General inquiries" : box.id === "contacts" ? "Customer contacts" : "Company administration")}</strong><small dir="ltr">{box.address}</small></span>
          </button>)}
        </nav>
        <div className="admin-mail-sidebar-tools">
          <div className="admin-mail-nav-label">{tr("Tools")}</div>
          <a href="/api/admin/mail/report"><MailIcon>⇩</MailIcon>{tr("Download report")}</a>
          <a href={`/api/admin/mail/backup?box=${activeBox}`} onClick={() => setNotice(tr("Mailbox backup download started."))}><MailIcon>⇩</MailIcon>{tr("Local backup")}</a>
          <p>{tr("The backup downloads as an MBOX file to your Downloads folder. The browser does not let the dashboard inspect files on your device.")}</p>
        </div>
      </aside>

      <main className="admin-mail-main">
        <div className="admin-mail-panel">
          {notice && <p className="admin-mail-notice" role="status">{notice}</p>}
          {compose ? <form className="admin-mail-compose" onSubmit={send}>
            <div className="admin-mail-compose-heading"><strong>{tr("New message")}</strong><button type="button" onClick={() => setCompose(false)} aria-label={tr("Close")}>×</button></div>
            <p>{tr("Sending from")} <b dir="ltr">{activeAddress}</b></p>
            <label>{tr("To")}<input type="email" required maxLength={254} value={recipient} onChange={(event) => setRecipient(event.target.value)} autoComplete="email" /></label>
            <label>{tr("Subject")}<input required maxLength={180} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
            <label>{tr("Message")}<textarea required maxLength={30000} rows={9} value={body} onChange={(event) => setBody(event.target.value)} /></label>
            <button className="admin-mail-send" type="submit" disabled={busy}>{busy ? tr("Sending…") : tr("Send")}</button>
          </form> : selected || loadingMessage ? <section className="admin-mail-reader" aria-live="polite">
            <div className="admin-mail-reader-toolbar"><button type="button" onClick={() => setSelected(null)} aria-label={tr("Back to inbox")}>←</button><span>{tr("Inbox")}</span></div>
            {loadingMessage ? <p className="admin-mail-empty">{tr("Opening message…")}</p> : selected && <article>
              <h2>{selected.subject}</h2>
              <dl><div><dt>{tr("From")}</dt><dd dir="auto">{selected.from}</dd></div><div><dt>{tr("To")}</dt><dd dir="auto">{selected.to}</dd></div>{selected.date && <div><dt>{tr("Date")}</dt><dd>{formatDate(selected.date, tr.locale === "ar" ? "ar-EG" : "en-US")}</dd></div>}</dl>
              <pre>{selected.text || tr("This message has no displayable text.")}</pre>
              {!!selected.attachments.length && <div className="admin-mail-attachments"><strong>{tr("Attachments")}</strong>{selected.attachments.map((attachment, index) => <span key={`${attachment.filename}-${index}`}>{attachment.filename} · {formatSize(attachment.size, tr.locale === "ar" ? "ar-EG" : "en-US")}</span>)}</div>}
            </article>}
          </section> : <>
            <div className="admin-mail-toolbar">
              <div className="admin-mail-toolbar-title"><h2>{tr("Inbox")}</h2><span dir="ltr">{activeAddress}</span></div>
              <div className="admin-mail-toolbar-actions"><span>{busy ? tr("Loading…") : `${filteredMessages.length} / ${total}`}</span><button type="button" onClick={() => void loadInbox(activeBox)} disabled={busy} aria-label={tr("Refresh")} title={tr("Refresh")}>↻</button></div>
            </div>
            {filteredMessages.length === 0 && !busy ? <p className="admin-mail-empty">{query ? tr("No matching messages.") : tr("This inbox is empty.")}</p> : <div className="admin-mail-list" aria-label={tr("Messages")}>
              {filteredMessages.map((message) => <button type="button" className={`admin-mail-row ${message.unread ? "unread" : ""}`} key={message.uid} onClick={() => void openMessage(message.uid)}>
                <span className="admin-mail-avatar" aria-hidden="true">{(message.from || "?").trim().slice(0, 1).toLocaleUpperCase()}</span>
                <span className="admin-mail-row-copy">
                  <span className="admin-mail-row-top"><strong>{message.from || tr("Unknown sender")}</strong><time>{formatDate(message.date, tr.locale === "ar" ? "ar-EG" : "en-US")}</time></span>
                  <span className="admin-mail-row-bottom"><b>{message.subject || tr("No subject")}</b><small> · {formatSize(message.size, tr.locale === "ar" ? "ar-EG" : "en-US")}{message.unread && <i>{tr("New")}</i>}</small></span>
                </span>
              </button>)}
            </div>}
            <div className="admin-mail-list-footer">{busy ? tr("Loading…") : tr("Latest 40 messages")}</div>
          </>}
        </div>
      </main>
    </div>
  </div>;
}
