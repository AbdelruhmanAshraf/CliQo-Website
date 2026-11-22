"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCopy } from "@/i18n/client";
import { LanguageSwitcher } from "@/app/language-switcher";

type Setup = { id: string; qr: string; secret: string };
type Initialization = { factorId: string; setup: Setup | null; message: string };

export function OwnerMfaGate({ next }: { next: string }) {
  const tr = useCopy();
  const [supabase] = useState(() => createClient());
  const initialization = useRef<Promise<Initialization> | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("بنجهز التحقق بخطوتين…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    // Share initialization across Strict Mode's effect replay so a second
    // enrollment cannot invalidate the QR currently shown to the owner.
    initialization.current ??= (async (): Promise<Initialization> => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) return { factorId: verified.id, setup: null, message: "اكتب الرمز الحالي من تطبيق المصادقة." };
      for (const factor of data.all.filter((entry) => entry.factor_type === "totp" && entry.status === "unverified")) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) throw removed.error;
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "CliQo Owner" });
      if (enrolled.error || !enrolled.data) throw enrolled.error ?? new Error("MFA enrollment failed");
      return {
        factorId: enrolled.data.id,
        setup: { id: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret },
        message: "امسح رمز QR بتطبيق مصادقة، ثم أدخل الرمز المكوّن من 6 أرقام.",
      };
    })();
    void initialization.current.then((result) => {
      if (!active) return;
      setFactorId(result.factorId); setSetup(result.setup); setMessage(result.message);
    }).catch(() => {
      if (active) setMessage("تعذر تحميل إعداد الأمان. حدّث الصفحة وحاول تاني.");
    });
    return () => { active = false; };
  }, [supabase]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true); setMessage("");
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) { setMessage("تعذر طلب التحقق. جرّب تاني."); return; }
      const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
      if (result.error) { setMessage("الرمز غير صحيح أو انتهت صلاحيته."); return; }
      window.location.assign(next);
    } catch {
      setMessage("تعذر طلب التحقق. جرّب تاني.");
    } finally { setBusy(false); }
  }

  return <main dir={tr.locale === "ar" ? "rtl" : "ltr"} style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--color-surface-subtle)", color: "#000000" }}>
    <section style={{ width: "min(100%,480px)", padding: 32, borderRadius: 20, background: "white", boxShadow: "0 12px 40px #00000014" }}>
      <LanguageSwitcher />
      <p style={{ color: "#fb6221", fontWeight: 700 }}>{tr("حماية لوحة المالك")}</p>
      <h1>{tr(setup ? "فعّل التحقق بخطوتين" : "تحقق من هويتك")}</h1>
      <p role="status" aria-live="polite">{tr(message)}</p>
      {setup && <div style={{ display: "grid", justifyItems: "center", gap: 12, margin: "20px 0" }}>
        <img src={setup.qr} alt={tr("رمز إعداد تطبيق المصادقة")} width="200" height="200" />
        <small>{tr("لو المسح مش متاح، أدخل المفتاح يدويًا في تطبيق المصادقة:")}</small>
        <code dir="ltr" style={{ overflowWrap: "anywhere", padding: 10, background: "var(--color-surface-muted)" }}>{setup.secret}</code>
      </div>}
      <form onSubmit={verify} style={{ display: "grid", gap: 12 }}>
        <label htmlFor="mfa-code">{tr("رمز تطبيق المصادقة")}</label>
        <input id="mfa-code" dir="ltr" disabled={busy || !factorId} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} style={{ minWidth: 0, width: "100%", boxSizing: "border-box", padding: 14, border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 22, letterSpacing: 5 }} />
        <button disabled={busy || !factorId || code.length !== 6} style={{ padding: 14, border: 0, borderRadius: 10, background: "#000000", color: "white", fontWeight: 700, cursor: "pointer" }}>{tr(busy ? "جارٍ التحقق…" : "تأكيد وفتح لوحة الإدارة")}</button>
      </form>
      <p style={{ marginTop: 18, fontSize: 13 }}>{tr("استخدم Google Authenticator أو Microsoft Authenticator أو 1Password.")}</p>
    </section>
  </main>;
}
