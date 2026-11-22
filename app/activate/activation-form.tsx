"use client";
import { useCopy } from '@/i18n/client';

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function ActivationForm({ publicId }: { publicId: string | null }) {
  const tr = useCopy();

  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();
  useEffect(() => setHydrated(true), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const normalizedToken = token.trim()
        .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
        .replace(/\s/g, "").toLowerCase();
      if (!/^(?:\d{6}|[a-f0-9]{16}|[a-f0-9]{32})$/.test(normalizedToken)) throw new Error("Invalid activation code");
      const bytes = new TextEncoder().encode(normalizedToken);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const { data, error } = await createClient().rpc("claim_stand_activation", { p_token_hash: tokenHash, p_public_id: publicId });
      if (error || data !== true) throw error ?? new Error("Activation rejected");
      router.replace(publicId ? `/dashboard/items/${publicId}` : "/dashboard"); router.refresh();
    } catch {
      setMessage("كود التفعيل غير صحيح أو مستخدم أو تم إيقاف المحاولات مؤقتًا. تأكد من QR وكود التفعيل المرفق مع القطعة أو تواصل مع الدعم.");
    } finally { setBusy(false); }
  }
  return <form className="login-form" data-testid="activation-form" data-hydrated={hydrated} onSubmit={submit}>
    <fieldset className="activation-controls" disabled={!hydrated || busy}>
    <label htmlFor="activation">{tr("كود التفعيل الخاص المرفق مع القطعة")}</label>
    <input id="activation" type="text" pattern="(?:[0-9٠-٩۰-۹]{6}|[A-Fa-f0-9]{16}|[A-Fa-f0-9]{32})" autoComplete="off" required minLength={6} maxLength={32} value={token} onChange={(event) => setToken(event.target.value)} dir="ltr" />
    <button className="button button-gold" type="submit">{busy ? tr("جاري التفعيل…") : tr("فعّل القطعة")}</button>
    </fieldset>
    <p role="status" aria-live="polite">{tr(message)}</p>
  </form>;
}
