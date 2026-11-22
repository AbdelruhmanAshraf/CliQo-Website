import {snapshotLabel} from "@/i18n/catalog";
import { getCopy } from '@/i18n/server';
import { cookies } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import {isOrderAccessCookieValid} from "@/lib/order-access";
import { orderStatusLabels, paymentStateLabels, type OrderStatus } from "@/app/admin/data";
import { SiteNav } from "@/app/site-nav";
import { MarketingFooter } from "@/app/marketing-footer";
import { DesignUpload } from "./design-upload";
import {CardOrderSync} from "./card-order-sync";
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
  const accessCookie = store.get("cliqo_order_" + reference)?.value ?? "";
  let order: {
    id: string; order_reference: string; state: OrderStatus; payment_state: string; payment_method: "card" | "cod" | "test"; payment_attempt_status: string | null;
    total_minor: number; shipping_minor: number; created_at: string;
  } | undefined;
  let lines: {
    id: string; product_name_snapshot: string; quantity: number; line_total_minor: number;
    design_tier: string | null; design_business_name: string | null; design_request_url: string | null; design_brief: string | null; state: string;
  }[] = [];
  let files: { id: string; order_line_id: string; original_name: string; created_at: string }[] = [];
  if (/^CQ-[0-9]{6,}$/.test(reference) && accessCookie) {
    const result = await getDb().query<NonNullable<typeof order> & {tracking_token_hash: string}>(
      "select o.id,o.order_reference,o.state,o.payment_state,o.payment_method,o.total_minor,o.shipping_minor,o.created_at,o.tracking_token_hash, " +
      "(select a.status from app_private.payment_attempts a where a.order_id=o.id order by a.attempt_number desc limit 1) as payment_attempt_status " +
      "from public.orders o where o.order_reference=$1",
      [reference],
    );
    const candidate = result.rows[0];
    if (candidate && isOrderAccessCookieValid(reference, accessCookie, candidate.tracking_token_hash)) {
      order = {
        id: candidate.id, order_reference: candidate.order_reference, state: candidate.state,
        payment_state: candidate.payment_state, payment_method: candidate.payment_method,
        payment_attempt_status: candidate.payment_attempt_status, total_minor: candidate.total_minor,
        shipping_minor: candidate.shipping_minor, created_at: candidate.created_at,
      };
    }
    if (order) {
      const details = await getDb().query<{
        id: string; product_name_snapshot: string; quantity: number; line_total_minor: number;
        design_tier: string | null; design_business_name: string | null; design_request_url: string | null; design_brief: string | null; state: string;
      }>(
        "select id,product_name_snapshot,quantity,line_total_minor,state,options_snapshot->>'design' as design_tier," +
        "design_business_name,design_request_url,design_brief from public.order_lines where order_id=$1 order by created_at",
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
  const testOrder = order?.payment_method === "test";
  const money = (minor: number) => tr.money(minor / 100);
  return <><SiteNav /><main className="checkout-page order-status" >
    {order ? <>
      {order.payment_method === "card" && <CardOrderSync paymentMethod="card" paymentState={order.payment_state} attemptStatus={order.payment_attempt_status} />}
      <p className="section-kicker"><span>CliQo</span>  {tr("متابعة الطلب")}</p>
      <h1>{tr(testOrder ? "طلب الاختبار اتسجّل." : "طلبك اتسجّل.")}</h1><p>{testOrder
        ? tr("طلب تجريبي من غير تحصيل أو شحنة فعلية. تابع الحالة هنا بعد مراجعة الإدارة.")
        : order.payment_method === "card"
        ? order.payment_attempt_status === "late_success" ? tr("وصل الدفع بعد انتهاء المهلة ويحتاج مراجعة. لا تعِد الدفع.")
          : order.payment_state === "paid" ? tr("تم تأكيد الدفع. الطلب بانتظار مراجعة CliQo قبل التجهيز.")
            : order.payment_state === "failed" ? tr("الدفع لم يتأكد. راجع السلة وأعد المحاولة أو تواصل مع CliQo.")
            : tr("جارٍ تأكيد الدفع من البوابة. صفحة الرجوع وحدها لا تؤكد نجاح الدفع.")
        : tr("الطلب بانتظار مراجعة وتأكيد CliQo قبل التجهيز.")}</p>
      <section className="checkout-summary"><h2>{order.order_reference}</h2>
        <div><span>{tr("الحالة")}</span><b>{tr(orderStatusLabels[order.state] ?? order.state)}</b></div>
        {!testOrder && <div><span>{tr("الدفع")}</span><b>{order.payment_method === "cod" && order.payment_state === "cod_to_collect"
          ? tr("عند الاستلام · لم يُحصّل بعد") : tr(paymentStateLabels[order.payment_state] ?? order.payment_state)}</b></div>}
        {lines.map((line) => <div key={line.id} className="order-status-line"><span>{snapshotLabel(tr, line.product_name_snapshot)} × {line.quantity}</span><b>{money(line.line_total_minor)}</b>
          {(line.design_tier === "T1" || line.design_tier === "T2") && <section className="order-design-details">
            <h3>{tr("تفاصيل التصميم")} {line.design_tier}</h3><p>{tr("النشاط:")} {line.design_business_name}</p>
            <p>{tr("الرابط الأولي:")} <bdi dir="ltr">{line.design_request_url}</bdi></p>
            {line.design_brief && <p className="design-brief" dir="auto">{line.design_brief}</p>}
            <DesignUpload reference={reference} orderLineId={line.id} required={line.design_tier === "T1"}
              open={line.state === "awaiting_design" && !["cancelled", "returned", "shipped", "delivered"].includes(order.state)}
              files={files.filter((file) => file.order_line_id === line.id).map((file) => ({ name: file.original_name, createdAt: file.created_at }))} />
          </section>}
        </div>)}
        {!testOrder && <div><span>{tr("الشحن")}</span><b>{money(order.shipping_minor)}</b></div>}
        <div className="checkout-total"><span>{tr(testOrder ? "الإجمالي التجريبي" : "الإجمالي")}</span><b>{money(order.total_minor)}</b></div>
      </section>
      {order.payment_method === "card" && order.payment_state === "failed" && order.payment_attempt_status !== "late_success" && <Link className="button button-primary" href="/checkout">{tr("إعادة محاولة الدفع")} <span>←</span></Link>}
      <p className="order-status-help">{tr(testOrder ? "تابع طلب الاختبار من نفس المتصفح اللي سجلته فيه." : "احتفظ برقم الطلب. رابط البريد الإلكتروني يفتح متابعة آمنة؛ لا تشاركه مع غيرك.")}</p>
      <Link className="button button-primary" href="/">{tr("الرئيسية")} <span>←</span></Link>
    </> : <section className="checkout-closed"><h1>{tr("مش قادرين نعرض الطلب.")}</h1><p>{tr("افتح رابط المتابعة من نفس الجهاز اللي سجلت منه الطلب، أو تواصل مع CliQo برقم الطلب.")}</p><Link href="/contact">{tr("تواصل معنا")}</Link></section>}
  </main><MarketingFooter /></>;
}
