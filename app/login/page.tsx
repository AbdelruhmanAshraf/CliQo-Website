import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { LoginForm } from "./login-form";
import { safeNextPath } from "@/lib/safe-next-path";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const tr = await getCopy();

  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(requested);
  const adminLogin = next === "/cliqo-control" || next.startsWith("/cliqo-control/") || next === "/admin" || next.startsWith("/admin/");
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
  const authError = params.error === "link";
  return <main className="utility-page" ><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={145} variant="light" /></Link><section>
    <p className="eyebrow">{adminLogin ? tr("حساب مالك CliQo") : tr("حساب عميل CliQo")}</p><h1>{adminLogin ? <>{tr("إدارة مشروعك،")}<br /><em>{tr("من مكان واحد.")}</em></> : <>{tr("لوحة نشاطك،")}<br /><em>{tr("في مكان واحد.")}</em></>}</h1>
    <p className="utility-copy">{adminLogin ? tr("اكتب بريد حساب المالك، وأكد الدخول بكود OTP من 6 أرقام.") : tr("اكتب بريدك، وأكد الدخول بكود OTP من 6 أرقام. QR وNFC مش وسيلة دخول للوحة.")}</p>
    {authError && <p className="setup-note">{tr("ماقدرناش نكمل تسجيل الدخول. ابدأ محاولة جديدة من هنا.")}</p>}
    {configured ? <LoginForm next={next} googleEnabled={googleEnabled} /> : <p className="setup-note">{tr("تسجيل الدخول هيتاح بعد ربط Supabase وإعداد البريد.")}</p>}
    <Link className="utility-back" href="/">{tr("الرجوع للموقع")}</Link>
  </section></main>;
}
