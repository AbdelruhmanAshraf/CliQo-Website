import { getCopy } from '@/i18n/server';
import Link from "next/link";
import { CliqoLogo } from "@/app/cliqo-logo";
import { notFound, redirect } from "next/navigation";
import { ActivationForm } from "./activation-form";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  const tr = await getCopy();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <main className="utility-page" ><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={145} /></Link><section><p className="eyebrow">{tr("تفعيل آمن لقطعتك")}</p><h1>{tr("تفعيل الستاند")}<br /><em>{tr("قريبًا.")}</em></h1><p className="setup-note">{tr("التفعيل هيتاح بعد ربط قاعدة البيانات.")}</p><Link className="utility-back" href="/">{tr("الرجوع للموقع")}</Link></section></main>;
  }
  const params = await searchParams;
  const requestedItem = Array.isArray(params.item) ? params.item[0] : params.item;
  if (requestedItem && !uuid.test(requestedItem)) notFound();
  const publicId = requestedItem?.toLowerCase() ?? null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(publicId ? `/activate?item=${publicId}` : "/activate")}`);
  return <main className="utility-page" ><Link className="brand" href="/" aria-label={tr("CliQo الرئيسية")}><CliqoLogo width={145} /></Link><section><p className="eyebrow">{tr("تفعيل آمن لقطعتك")}</p><h1>{tr("اربط الستاند")}<br /><em>{tr("بحسابك.")}</em></h1><p className="utility-copy">{tr("اكتب الكود الموجود داخل العبوة. الكود خاص بحسابك، ويُستخدم مرة واحدة.")}{publicId && tr("هنطابقه مع القطعة اللي مسحت QR بتاعها.")}</p><ActivationForm publicId={publicId} /><Link className="utility-back" href="/dashboard">{tr("الرجوع للوحة العميل")}</Link></section></main>;
}
