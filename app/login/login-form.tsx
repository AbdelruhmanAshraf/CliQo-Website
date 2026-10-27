"use client";
import { useCopy } from '@/i18n/client';


import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./login.module.css";

type LoginStep = "email" | "code";

export function LoginForm({ next = "/dashboard", googleEnabled = false }: { next?: string; googleEnabled?: boolean }) {
  const tr = useCopy();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<LoginStep>("email");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const resendSeconds = resendAt === null ? 0 : Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (step !== "code" || resendAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step, resendAt]);

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setEmail(normalizedEmail);
      setCode("");
      setStep("code");
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
      setMessage("بعتنالك كود من 6 أرقام. راجع الوارد والـSpam لو ما ظهرش.");
    } catch {
      setMessage("ماقدرناش نبعت الكود دلوقتي. راجع البريد وحاول بعد شوية.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      window.location.assign(next);
    } catch {
      setMessage("الكود غير صحيح أو انتهت صلاحيته. راجعه أو اطلب كودًا جديدًا.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch {
      setMessage("تسجيل Google مش متاح حاليًا. جرّب كود البريد.");
      setBusy(false);
    }
  }

  return <div className={styles.wrapper}>
    {step === "email" ? <form className={styles.form} onSubmit={sendCode}>
      <label className={styles.label} htmlFor="login-email">{tr("البريد الإلكتروني")}</label>
      <input className={styles.input} id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" dir="ltr" />
      <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? tr("جاري الإرسال…") : tr("ابعتلي كود الدخول")}</button>
    </form> : <form className={styles.form} onSubmit={verifyCode}>
      <div className={styles.sentTo}><span>{tr("بعتنا الكود إلى")}</span><strong dir="ltr">{email}</strong></div>
      <label className={styles.label} htmlFor="login-code">{tr("كود الدخول")}</label>
      <input className={`${styles.input} ${styles.codeInput}`} id="login-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" dir="ltr" />
      <small className={styles.expiry}>{tr("الكود صالح لمدة 10 دقايق، وبيستخدم مرة واحدة.")}</small>
      <button className={styles.primaryButton} type="submit" disabled={busy || code.length !== 6}>{busy ? tr("بنتأكد من الكود…") : tr("تأكيد الدخول")}</button>
      <div className={styles.codeActions}>
        <button type="button" onClick={() => { setStep("email"); setCode(""); setMessage(""); }}>{tr("تغيير البريد")}</button>
        <button type="button" onClick={() => void sendCode()} disabled={busy || resendSeconds > 0}>{resendSeconds > 0 ? tr("إعادة الإرسال بعد {value0} ثانية", {value0: resendSeconds}) : tr("ابعت كود جديد")}</button>
      </div>
    </form>}

    {googleEnabled && <>
      <div className={styles.separator}><span>{tr("أو")}</span></div>
      <button className={styles.googleButton} type="button" onClick={() => void signInWithGoogle()} disabled={busy}>
        <span className={styles.googleMark} aria-hidden="true">G</span>{tr("المتابعة باستخدام Google")} </button>
    </>}
    <p className={styles.status} role="status" aria-live="polite">{tr(message)}</p>
    <p className={styles.privacy}>{tr("لو البريد مش مسجل، هننشئ لك حسابًا بعد تأكيد الكود. دخول لوحة المالك يفضل محمي بصلاحية المالك.")}</p>
  </div>;
}
