"use client";
import {snapshotLabel} from "@/i18n/catalog";

import { useCopy } from '@/i18n/client';


import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addOrderNote, changeLineStatus, changeOrderStatus } from "./actions";
import { lineStatusLabels, orderStatusLabels, paymentAttemptLabels, paymentStateLabels, type LineStatus, type OrderRow, type OrderStatus } from "../data";

const orderStatuses = Object.entries(orderStatusLabels) as [OrderStatus, string][];
const lineStatuses = Object.entries(lineStatusLabels) as [LineStatus, string][];


export function OrdersWorkspace({ orders, canEdit, designerNumber, statusCounts, dailyCounts, initialQuery = '', currentPage, totalPages, totalMatches }: { orders: OrderRow[]; canEdit: boolean; designerNumber: string | null; statusCounts: Record<string,number>; dailyCounts: {day:string;total:number}[]; initialQuery?: string; currentPage: number; totalPages: number; totalMatches: number }) {
  const tr = useCopy();

  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => { if (expanded) details.current?.focus(); }, [expanded]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => orders.filter((order) => filter === "all" || order.status === filter), [orders, filter]);
  const pageHref = (page: number) => `/cliqo-control/orders?${new URLSearchParams({ ...(initialQuery ? { q: initialQuery } : {}), page: String(page) })}`;
  function save(action: () => Promise<{ ok: boolean; message: string }>, clearDraft = false) {
    setNotice("");
    startTransition(async () => {
      try {
        const result = await action();
        setNotice(result.message);
        if (result.ok) { if (clearDraft) setDraft(""); router.refresh(); }
      } catch { setNotice("تعذر إتمام التعديل. تأكد من صلاحياتك واتصالك."); }
    });
  }
  return <section className="ops-content">
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr("نظرة عامة على المتجر")}</p><h1>{tr("الطلبات")} <span className="count-pill">{totalMatches}</span></h1><p>{tr("كل الطلبات، مع بحث في السجل الكامل وصفحات واضحة.")}</p></div></div>
    {notice && <div role="status" className="inline-feedback">{tr(notice)}<button onClick={() => setNotice("")} aria-label={tr("إغلاق")}>×</button></div>}
    <div className="ops-metrics order-metrics">
      <article><span>{tr("كل الطلبات")}</span><strong>{Object.values(statusCounts).reduce((a,b)=>a+b,0)}</strong><small>{tr("في السجل الكامل")}</small></article>
      <article><span>{tr("تحتاج متابعة")}</span><strong>{["new", "confirmed", "awaiting_design", "in_production", "quality_check"].reduce((sum,state)=>sum+(statusCounts[state]??0),0)}</strong><small>{tr("لم تجهز للشحن")}</small></article>
      <article><span>{tr("جاهزة للشحن")}</span><strong>{statusCounts.ready_to_ship??0}</strong><small>{tr("بانتظار شركة الشحن")}</small></article>
      <article><span>{tr("تم التسليم")}</span><strong>{statusCounts.delivered??0}</strong><small>{tr("من كل الطلبات")}</small></article>
    </div>
    <div className="orders-panel">
      <div className="orders-toolbar"><div className="filter-tabs" role="group" aria-label={tr("فلترة حسب الحالة")}>
        {(["all", "new", "in_production", "ready_to_ship", "shipped"] as const).map((key) => <button key={key} aria-pressed={filter === key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{key === "all" ? tr("كل الطلبات") : tr(orderStatusLabels[key])}</button>)}
      </div><form className="orders-search-form" method="get"><label className="search-field"><span aria-hidden="true">⌕</span><input name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("ابحث برقم الطلب أو العميل أو الهاتف")} aria-label={tr("ابحث برقم الطلب أو العميل أو الهاتف")} /></label><button type="submit">{tr("بحث")}</button></form></div>
      {visible.filter((order) => order.id === expanded).map((order) => <div className="order-detail" key={order.id} ref={details} tabIndex={-1} aria-label={tr("تفاصيل الطلب")}>
        <div className="detail-heading"><div><span>{tr("تفاصيل الطلب")}</span><strong>{order.reference}</strong></div><div className="order-detail-end"><span className="detail-location">{order.city}</span>{canEdit && <select className="order-detail-state" aria-label={tr("حالة الطلب")} value={order.status} disabled={pending}
          onChange={(event) => save(() => changeOrderStatus(order.id, event.target.value as OrderStatus))}>
          {orderStatuses.map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}
        </select>}<button type="button" className="row-more" aria-label={tr("إغلاق")} onClick={() => setExpanded(null)}>×</button></div></div>
        {order.payment === "test" && <div className="test-order-strip">
          <div><strong>{tr("طلب اختبار")}</strong><small>{tr("بدون تحصيل أو شحن فعلي")}</small></div>
          {canEdit && order.status === "new" && <button className="save-note" type="button" disabled={pending}
            onClick={() => save(() => changeOrderStatus(order.id, "confirmed"))}>{tr("أكّد طلب الاختبار يدويًا")}</button>}
        </div>}
        <div className="line-list">{order.lines.map((line) => {
          const tier = line.design?.tier;
          const heading = tier === "T2" ? tr("تصميم من CliQo") : tier === "T1" ? tr("تصميم العميل") : tr("قالب جاهز");
          const activeOrder = !["cancelled", "returned"].includes(order.status);
          const archive = `/cliqo-control/orders/${order.id}/production?line=${line.id}`;
          const canDownload = canEdit && activeOrder && (
            tier === "T2" || (line.stockUnits === line.qty && (tier !== "T1" || Boolean(line.design?.files.length)))
          );
          const whatsapp = tier === "T2" && line.design && canEdit && activeOrder && designerNumber
            ? `https://wa.me/${designerNumber}?text=${encodeURIComponent([
                `طلب تصميم من CliQo · ${order.reference}`,
                `المنتج: ${snapshotLabel(tr, line.name)} · ${snapshotLabel(tr, line.option)}`,
                `الكمية: ${line.qty}`,
                `النشاط: ${line.design.businessName}`,
                `الرابط المطلوب: ${line.design.destinationUrl ?? "—"}`,
                `تفاصيل التصميم: ${line.design.brief ?? "—"}`,
                `المرفقات: ${line.design.files.length} — من ملف الطلب المضغوط.`,
                "المطلوب معاينة للاعتماد، مع مساحة للـQR قبل الطباعة.",
              ].join("\n"))}`
            : null;
          return <article className="line-item order-workflow-line" key={line.id}>
            <div>
              <span className="order-workflow-label">{heading}</span>
              <strong>{snapshotLabel(tr, line.name)}</strong>
              <small>{snapshotLabel(tr, line.option)} · {tr("الكمية")} {line.qty}</small>
              {line.design && <div className="order-design-admin">
                <b dir="auto">{line.design.businessName}</b>
                {line.design.destinationUrl && <a href={line.design.destinationUrl} target="_blank" rel="noreferrer">{tr("الرابط الأولي")} <bdi>{line.design.destinationUrl}</bdi></a>}
                {line.design.brief && <p className="design-brief" dir="auto">{line.design.brief}</p>}
                {line.design.files.map((file) => <a key={file.url} href={file.url} target="_blank" rel="noreferrer">{tr("ملف التصميم:")} {file.name}</a>)}
                {!line.design.files.length && tier === "T1" && <small>{tr("ملف العميل لم يصل بعد؛ لا تبدأ الإنتاج.")}</small>}
              </div>}
              {canEdit && activeOrder && <>
                {tier !== "T2" && <small className="order-workflow-stock">{line.stockUnits
                  ? tr("مخصّص من المخزون: {value0} من {value1}", { value0: line.stockUnits, value1: line.qty })
                  : tr("أكّد الطلب لتخصيص القطع من المخزون.")}</small>}
                {(canDownload || whatsapp) && <div className="order-workflow-actions">
                  {canDownload && <a className="export-button" href={archive} download>{tier === "T2" ? tr("نزّل طلب التصميم ومرفقاته") : tr("نزّل ملفات المصنع")}</a>}
                  {order.payment === "test" && line.testItemIds?.map((id, index) =>
                    <Link className="export-button" key={id} href={`/cliqo-control/items/${id}`}>{tr("قطعة الاختبار {value0}",{value0:index+1})}</Link>)}
                  {whatsapp && <a className="export-button order-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">{tr("افتح مسودة واتساب للمصمم")}</a>}
                </div>}
                {tier === "T2" && (whatsapp
                  ? <small>{tr("أرفق الملف المضغوط مع الرسالة في واتساب.")}</small>
                  : <small>{tr("رقم واتساب المصمم غير مضبوط.")}</small>)}
              </>}
            </div>
            <label>{tr("حالة البند")} {canEdit
              ? <select value={line.status} disabled={pending} onChange={(event) => save(() => changeLineStatus(line.id, event.target.value as LineStatus))}>
                  {lineStatuses.map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}
                </select>
              : tr(lineStatusLabels[line.status])}</label>
          </article>;
        })}</div>
        {order.notes.length > 0 && <div className="order-notes"><strong>{tr("ملاحظات الإدارة")}</strong>{order.notes.map((note) => <p key={note.id}>{note.body}<small>{tr.date(note.createdAt)}</small></p>)}</div>}
        <label className="note-field">{tr("ملاحظة داخلية")}<textarea value={draft} maxLength={2000} placeholder={tr("أضف ملاحظة للمتابعة...")} onChange={(event) => setDraft(event.target.value)} /></label>
        <button className="save-note" disabled={pending || !draft.trim()} onClick={() => save(() => addOrderNote(order.id, draft), true)}>{tr("حفظ الملاحظة")}</button>
      </div>)}
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>{tr("رقم الطلب")}</th><th>{tr("العميل")}</th><th>{tr("التاريخ")}</th><th>{tr("المنتجات")}</th><th>{tr("الدفع")}</th><th>{tr("الإجمالي")}</th><th>{tr("الحالة")}</th><th>{tr("تفاصيل")}</th></tr></thead><tbody>
        {visible.map((order) => <tr key={order.id} className={expanded === order.id ? "row-expanded" : ""}>
          <td><button className="order-id" onClick={() => { setExpanded(expanded === order.id ? null : order.id); setDraft(""); }}>{order.reference}</button></td>
          <td><strong>{order.customer}</strong><small dir="ltr">{order.phone}</small></td><td>{tr.date(order.createdAt)}</td>
          <td>{order.lines.reduce((sum, line) => sum + line.qty, 0)}  {tr("قطع")}<small className="order-line-summary">{order.lines.slice(0, 2).map(line => snapshotLabel(tr, line.name)).join(tr("،"))}
            {order.lines.length > 2 && <span> +{order.lines.length - 2}</span>}</small></td>
          <td><span className={`pay-method ${order.payment}`}>{order.payment === "test" ? tr("طلب اختبار") : order.payment === "cod" ? tr("عند الاستلام") : tr("بطاقة")}</span><small>{order.payment === "test" ? tr("بدون تحصيل أو شحن فعلي") : tr(paymentStateLabels[order.paymentState] ?? order.paymentState)}</small>{order.payment === "card" && order.paymentAttempt && <small>{tr(paymentAttemptLabels[order.paymentAttempt] ?? order.paymentAttempt)}</small>}</td>
          <td>{(order.totalMinor / 100).toLocaleString(tr.numberLocale)}  {tr("ج.م")}</td>
          <td>{canEdit ? <select className="status-select" value={order.status} disabled={pending} aria-label={tr("حالة {value0}", {value0: order.reference})} onChange={(event) => save(() => changeOrderStatus(order.id, event.target.value as OrderStatus))}>{orderStatuses.map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}</select> : tr(orderStatusLabels[order.status])}</td>
          <td><button className="row-more" onClick={() => { setExpanded(expanded === order.id ? null : order.id); setDraft(""); }} aria-expanded={expanded === order.id} aria-label={tr("تفاصيل {value0}", {value0: order.reference})}>{expanded === order.id ? "⌃" : "⌄"}</button></td>
        </tr>)}
        {visible.length === 0 && <tr><td colSpan={8} className="empty-results">{orders.length ? tr("مفيش طلبات مطابقة للبحث.") : tr("لسه مفيش طلبات مسجلة.")}</td></tr>}
      </tbody></table></div>
      <footer className="table-footer"><span>{tr("عرض {value0} من {value1} طلب", { value0: visible.length, value1: totalMatches })} · {tr("صفحة {value0} من {value1}", { value0: currentPage, value1: totalPages })}</span><nav className="order-pagination" aria-label={tr("صفحات الطلبات")}>{currentPage>1&&<Link href={pageHref(currentPage-1)}>{tr("السابق")}</Link>}{currentPage<totalPages&&<Link href={pageHref(currentPage+1)}>{tr("التالي")}</Link>}</nav></footer>
    </div>
    <details className="order-insights"><summary>{tr("إحصائيات الطلبات")}</summary>
    <section className="order-trend" aria-label={tr('الطلبات خلال آخر ١٤ يومًا')}><div><strong>{tr('الطلبات خلال آخر ١٤ يومًا')}</strong><p>{tr('عدد الطلبات المسجلة يوميًا بتوقيت القاهرة')}</p></div><div className="order-trend-bars">{dailyCounts.map(day=><div key={day.day} className="order-trend-day" title={`${day.day}: ${day.total}`}><span>{day.total||''}</span><i style={{height:`${Math.max(day.total/Math.max(1,...dailyCounts.map(x=>x.total))*70,day.total?5:2)}%`}}/><small>{day.day.slice(8)}</small></div>)}</div></section>
    <section className="order-flow" aria-label={tr('حالات الطلبات كلها')}><div className="order-flow-heading"><div><strong>{tr('حركة الطلبات')}</strong><p>{tr('توزيع الحالات من كل الطلبات المسجلة، وليس أحدث ١٠٠ فقط.')}</p></div><span>{Object.values(statusCounts).reduce((a,b)=>a+b,0)} {tr('طلب')}</span></div><div className="order-flow-bars">{orderStatuses.map(([key,label])=>{const count=statusCounts[key]??0;const all=Object.values(statusCounts).reduce((a,b)=>a+b,0);return <div className="order-flow-row" key={key}><span>{tr(label)}</span><div className="order-flow-track"><i style={{width:`${all?Math.max(count/all*100,count?2:0):0}%`}}/></div><strong>{count}</strong></div>})}</div></section>
    </details>
  </section>;
}
