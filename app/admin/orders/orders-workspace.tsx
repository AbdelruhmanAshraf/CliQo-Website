"use client";
import {snapshotLabel} from "@/i18n/catalog";

import { useCopy } from '@/i18n/client';


import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addOrderNote, changeLineStatus, changeOrderStatus } from "./actions";
import { lineStatusLabels, orderStatusLabels, paymentStateLabels, type LineStatus, type OrderRow, type OrderStatus } from "../data";

const orderStatuses = Object.entries(orderStatusLabels) as [OrderStatus, string][];
const lineStatuses = Object.entries(lineStatusLabels) as [LineStatus, string][];


export function OrdersWorkspace({ orders, canEdit }: { orders: OrderRow[]; canEdit: boolean }) {
  const tr = useCopy();

  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => orders.filter((order) =>
    (filter === "all" || order.status === filter) &&
    `${order.reference} ${order.customer} ${order.phone}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [orders, filter, query]);
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
    <div className="ops-heading"><div><p className="ops-eyebrow">{tr("نظرة عامة على المتجر")}</p><h1>{tr("الطلبات")} <span className="count-pill">{orders.length}</span></h1><p>{tr("الطلبات المسجلة فعليًا، وأحدث ١٠٠ طلب.")}</p></div></div>
    {notice && <div role="status" className="inline-feedback">{tr(notice)}<button onClick={() => setNotice("")} aria-label={tr("إغلاق")}>×</button></div>}
    <div className="ops-metrics">
      <article><span>{tr("الطلبات المعروضة")}</span><strong>{orders.length}</strong><small>{tr("أحدث ١٠٠ طلب")}</small><i className="metric-icon green">▤</i></article>
      <article><span>{tr("تحتاج متابعة")}</span><strong>{orders.filter((o) => ["new", "confirmed", "awaiting_design", "in_production", "quality_check"].includes(o.status)).length}</strong><small>{tr("لم تجهز للشحن")}</small><i className="metric-icon orange">◷</i></article>
      <article><span>{tr("جاهزة للشحن")}</span><strong>{orders.filter((o) => o.status === "ready_to_ship").length}</strong><small>{tr("بانتظار شركة الشحن")}</small><i className="metric-icon blue">▣</i></article>
      <article><span>{tr("تم التسليم")}</span><strong>{orders.filter((o) => o.status === "delivered").length}</strong><small>{tr("من الطلبات المعروضة")}</small><i className="metric-icon purple">✓</i></article>
    </div>
    <div className="orders-panel">
      <div className="orders-toolbar"><div className="filter-tabs" role="group" aria-label={tr("فلترة حسب الحالة")}>
        {(["all", "new", "in_production", "ready_to_ship", "shipped"] as const).map((key) => <button key={key} aria-pressed={filter === key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>{key === "all" ? tr("كل الطلبات") : tr(orderStatusLabels[key])}</button>)}
      </div><label className="search-field"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("ابحث برقم الطلب أو العميل")} aria-label={tr("ابحث برقم الطلب أو العميل")} /></label></div>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>{tr("رقم الطلب")}</th><th>{tr("العميل")}</th><th>{tr("التاريخ")}</th><th>{tr("المنتجات")}</th><th>{tr("الدفع")}</th><th>{tr("الإجمالي")}</th><th>{tr("الحالة")}</th><th>{tr("تفاصيل")}</th></tr></thead><tbody>
        {visible.map((order) => <tr key={order.id} className={expanded === order.id ? "row-expanded" : ""}>
          <td><button className="order-id" onClick={() => { setExpanded(expanded === order.id ? null : order.id); setDraft(""); }}>{order.reference}</button></td>
          <td><strong>{order.customer}</strong><small dir="ltr">{order.phone}</small></td><td>{tr.date(order.createdAt)}</td>
          <td>{order.lines.reduce((sum, line) => sum + line.qty, 0)}  {tr("قطع")}<small>{order.lines.map((line) => snapshotLabel(tr, line.name)).join(tr("،"))}</small></td>
          <td><span className={`pay-method ${order.payment}`}>{order.payment === "cod" ? tr("عند الاستلام") : tr("بطاقة")}</span><small>{tr(paymentStateLabels[order.paymentState] ?? order.paymentState)}</small></td>
          <td>{(order.totalMinor / 100).toLocaleString(tr.numberLocale)}  {tr("ج.م")}</td>
          <td>{canEdit ? <select className="status-select" value={order.status} disabled={pending} aria-label={tr("حالة {value0}", {value0: order.reference})} onChange={(event) => save(() => changeOrderStatus(order.id, event.target.value as OrderStatus))}>{orderStatuses.map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}</select> : tr(orderStatusLabels[order.status])}</td>
          <td><button className="row-more" onClick={() => { setExpanded(expanded === order.id ? null : order.id); setDraft(""); }} aria-expanded={expanded === order.id} aria-label={tr("تفاصيل {value0}", {value0: order.reference})}>{expanded === order.id ? "⌃" : "⌄"}</button></td>
        </tr>)}
        {visible.length === 0 && <tr><td colSpan={8} className="empty-results">{orders.length ? tr("مفيش طلبات مطابقة للبحث.") : tr("لسه مفيش طلبات مسجلة.")}</td></tr>}
      </tbody></table></div>
      {visible.filter((order) => order.id === expanded).map((order) => <div className="order-detail" key={order.id}>
        <div className="detail-heading"><div><span>{tr("تفاصيل الطلب")}</span><strong>{order.reference}</strong></div><span className="detail-location">⌖ {order.city}</span></div>
        <div className="line-list">{order.lines.map((line) => <div className="line-item" key={line.id}><div><strong>{snapshotLabel(tr, line.name)}</strong><small>{snapshotLabel(tr, line.option)}  {tr("· الكمية")} {line.qty}</small>{line.design && <div className="order-design-admin"><b>{tr("تصميم")} {line.design.tier} · {line.design.businessName}</b><a href={line.design.destinationUrl} target="_blank" rel="noreferrer">{tr("الرابط الأولي")} <span dir="ltr">{line.design.destinationUrl}</span></a>{line.design.files.map((file, index) => <a key={`${file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer">{tr("ملف التصميم:")} {file.name}</a>)}{!line.design.files.length && line.design.tier === "T1" && <small>{tr("ملف العميل لم يصل بعد؛ لا تبدأ الإنتاج.")}</small>}</div>}</div><label>{tr("حالة البند")} {canEdit ? <select value={line.status} disabled={pending} onChange={(event) => save(() => changeLineStatus(line.id, event.target.value as LineStatus))}>{lineStatuses.map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}</select> : tr(lineStatusLabels[line.status])}</label></div>)}</div>
        {order.notes.length > 0 && <div className="order-notes"><strong>{tr("ملاحظات الإدارة")}</strong>{order.notes.map((note) => <p key={note.id}>{note.body}<small>{tr.date(note.createdAt)}</small></p>)}</div>}
        <label className="note-field">{tr("ملاحظة داخلية")}<textarea value={draft} maxLength={2000} placeholder={tr("أضف ملاحظة للمتابعة...")} onChange={(event) => setDraft(event.target.value)} /></label>
        <button className="save-note" disabled={pending || !draft.trim()} onClick={() => save(() => addOrderNote(order.id, draft), true)}>{tr("حفظ الملاحظة")}</button>
      </div>)}
      <footer className="table-footer"><span>{tr("عرض")} {visible.length}  {tr("من")} {orders.length}  {tr("طلبات مسجلة")}</span></footer>
    </div>
  </section>;
}
