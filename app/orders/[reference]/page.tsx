import {snapshotLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { orderStatusLabels, paymentStateLabels, type OrderStatus } from "@/app/admin/data";
import { SiteNav } from "@/app/site-nav";
import { MarketingFooter } from "@/app/marketing-footer";
import { DesignUpload } from "./design-upload";
import "@/app/checkout/checkout.css";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("حالة الطلب | CliQo"), robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

export default async function OrderStatusPage({ params }: { params: Promise<{ reference: string }> }) {
  const tr = await getCopy();

  const { reference } = await params;
  const store = await cookies();
  const key = store.get("cliqo_order_" + reference)?.value;
  let order: {
    id: string; order_reference: string; state: OrderStatus; payment_state: string;
    total_minor: number; shipping_minor: number; created_at: string;
  } | undefined;
  let lines: {
    id: string; product_name_snapshot: string; quantity: number; line_total_minor: number;
    design_tier: string | null; design_business_name: string | null; design_request_url: string | null; state: string;
  }[] = [];
  let files: { id: string; order_line_id: string; original_name: string; created_at: string }[] = [];
  if (/^CQ-[0-9]{6,}$/.test(reference) && key && /^[a-f0-9]{64}$/.test(key)) {
    const hash = createHash("sha256").update(key).digest("hex");
    const result = await getDb().query<typeof order & { id: string }>(
      "select id,order_reference,state,payment_state,total_minor,shipping_minor,created_at " +
      "from public.orders where order_reference=$1 and tracking_token_hash=$2",
      [reference, hash]
    );
    order = result.rows[0];
    if (order) {
      const details = await getDb().query<{
        id: string; product_name_snapshot: string; quantity: number; line_total_minor: number;
        design_tier: string | null; design_business_name: string | null; design_request_url: string | null; state: string;
      }>(
        "select id,product_name_snapshot,quantity,line_total_minor,state,options_snapshot->>'design' as design_tier," +
        "design_business_name,design_request_url from public.order_lines where order_id=$1 order by created_at",
        [order.id]
      );
      lines = details.rows;
      const customLineIds = lines.filter((line) => line.design_tier === "T1" || line.design_tier === "T2").map((line) => line.id);
      if (customLineIds.length) {
        const uploaded = await getDb().query<{ id: string; order_line_id: string; original_name: string; created_at: string }>(
          "select id,order_line_id,original_name,created_at from public.order_files where order_line_id=any($1::uuid[]) order by created_at",
          [customLineIds],
        );
        files = uploaded.rows;
      }
    }
  }
  const money = (minor: number) => tr.money(minor / 100);
  return <><SiteNav /><main className="checkout-page order-status" >
    {order ? <>
      <p className="section-kicker"><span>CliQo</span>  {tr("متابعة الطلب")}</p>
      <h1>{tr("طلبك اتسجّل.")}</h1><p>{tr("الطلب بانتظار مراجعة وتأكيد CliQo قبل التجهيز.")}</p>
      <section className="checkout-summary"><h2>{order.order_reference}</h2>
        <div><span>{tr("الحالة")}</span><b>{tr(orderStatusLabels[order.state] ?? order.state)}</b></div>
        <div><span>{tr("الدفع")}</span><b>{order.payment_state === "cod_to_collect" ? tr("عند الاستلام · لم يُحصّل بعد") : tr(paymentStateLabels[order.payment_state] ?? order.payment_state)}</b></div>
        {lines.map((line) => <div key={line.id} className="order-status-line"><span>{snapshotLabel(tr, line.product_name_snapshot)} × {line.quantity}</span><b>{money(line.line_total_minor)}</b>
          {(line.design_tier === "T1" || line.design_tier === "T2") && <section className="order-design-details">
            <h3>{tr("تفاصيل التصميم")} {line.design_tier}</h3><p>{tr("النشاط:")} {line.design_business_name}</p>
            <p>{tr("الرابط الأولي:")} <bdi dir="ltr">{line.design_request_url}</bdi></p>
            <DesignUpload reference={reference} orderLineId={line.id} required={line.design_tier === "T1"} files={files.filter((file) => file.order_line_id === line.id).map((file) => ({ name: file.original_name, createdAt: file.created_at }))} />
          </section>}
        </div>)}
        <div><span>{tr("الشحن")}</span><b>{money(order.shipping_minor)}</b></div>
        <div className="checkout-total"><span>{tr("الإجمالي")}</span><b>{money(order.total_minor)}</b></div>
      </section>
      <p className="order-status-help">{tr("احتفظ برقم الطلب. رابط المتابعة متاح على الجهاز اللي سجلت منه الطلب؛ رابط البريد الإلكتروني هيتضاف بعد تجهيز رسائل التأكيد.")}</p>
      <Link className="button button-primary" href="/">{tr("الرئيسية")} <span>←</span></Link>
    </> : <section className="checkout-closed"><h1>{tr("مش قادرين نعرض الطلب.")}</h1><p>{tr("افتح رابط المتابعة من نفس الجهاز اللي سجلت منه الطلب، أو تواصل مع CliQo برقم الطلب.")}</p><Link href="/contact">{tr("تواصل معنا")}</Link></section>}
  </main><MarketingFooter /></>;
}
