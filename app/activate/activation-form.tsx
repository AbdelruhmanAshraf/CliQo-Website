"use client";
import { useCopy } from '@/i18n/client';

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function ActivationForm({ publicId }: { publicId: string | null }) {
  const tr = useCopy();

  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const normalizedToken = token.trim().replace(/[\s-]/g, "").toLowerCase();
      const bytes = new TextEncoder().encode(normalizedToken);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const { error } = await createClient().rpc("claim_stand_activation", { p_token_hash: tokenHash, p_public_id: publicId });
      if (error) throw error;
      router.replace(publicId ? `/dashboard/items/${publicId}` : "/dashboard"); router.refresh();
    } catch {
      setMessage("الكود غير صالح أو انتهت صلاحيته. راجع كارت التفعيل أو تواصل مع الدعم.");
    } finally { setBusy(false); }
  }
  return <form className="login-form" onSubmit={submit}>
    <label htmlFor="activation">{tr("كود التفعيل الخاص")}</label>
    <input id="activation" type="text" autoComplete="off" required minLength={16} value={token} onChange={(event) => setToken(event.target.value)} dir="ltr" />
    <button className="button button-gold" type="submit" disabled={busy}>{busy ? tr("جاري التفعيل…") : tr("فعّل القطعة")}</button>
    <p role="status" aria-live="polite">{tr(message)}</p>
  </form>;
}
