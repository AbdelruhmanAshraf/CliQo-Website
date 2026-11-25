"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n/client";
import styles from "./activate.module.css";

export function ScannedLinkForm() {
  const tr = useCopy();
  const router = useRouter();
  const [invalid, setInvalid] = useState(false);

  function openItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = String(new FormData(event.currentTarget).get("itemLink") ?? "").trim();
    let path: string | undefined;
    try {
      const url = new URL(input);
      const allowedOrigin = url.origin === window.location.origin || url.origin === "https://cliqoeg.com";
      if (allowedOrigin && /^\/s\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/?$/i.test(url.pathname)) {
        path = url.pathname.toLowerCase().replace(/\/$/, "");
      }
    } catch { /* Show the same validation message for invalid URLs. */ }

    if (path) {
      setInvalid(false);
      router.push(path);
    } else {
      setInvalid(true);
    }
  }

  return <details className={styles.paste}>
    <summary>{tr("معاك رابط القطعة؟")}</summary>
    <form onSubmit={openItem}>
      <label htmlFor="item-link">{tr("رابط CliQo اللي ظهر بعد المسح")}</label>
      <input id="item-link" name="itemLink" type="url" inputMode="url" dir="ltr" required
        autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={invalid} aria-describedby={invalid ? "item-link-error" : undefined} />
      <button type="submit">{tr("افتح رابط القطعة")}</button>
      {invalid && <p id="item-link-error" role="alert">{tr("اتأكد إنك ناسخ رابط CliQo الخاص بالقطعة.")}</p>}
    </form>
  </details>;
}
