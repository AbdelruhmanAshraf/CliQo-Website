"use client";
import {snapshotLabel} from "@/i18n/catalog";

import { useCopy } from '@/i18n/client';


import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addOrderNote, changeLineStatus, changeOrderStatus, deleteCancelledOrder, setOrderArchived } from "./actions";
import { lineStatusLabels, orderStatusLabels, paymentAttemptLabels, paymentStateLabels, type LineStatus, type OrderRow, type OrderStatus } from "../data";

const orderStatuses = Object.entries(orderStatusLabels) as [OrderStatus, string][];
const lineStatuses = Object.entries(lineStatusLabels) as [LineStatus, string][];


export function OrdersWorkspace({ orders, canEdit, archived, canArchive, canDelete, designerNumber, initialQuery = '', currentPage, totalPages, totalMatches }: { orders: OrderRow[]; canEdit: boolean; archived: boolean; canArchive: boolean; canDelete: boolean; designerNumber: string | null; initialQuery?: string; currentPage: number; totalPages: number; totalMatches: number }) {
  const tr = useCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;

  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => setQuery(initialQuery), [initialQuery]);
  const [dragged, setDragged] = useState<string | null>(null);
  const [archivePrompt, setArchivePrompt] = useState<string | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => { if (expanded) details.current?.focus(); }, [expanded]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => orders.filter((order) => filter === "all" || order.status === filter), [orders, filter]);
  const pageHref = (page: number) => `/cliqo-control/orders?${new URLSearchParams({ ...(initialQuery ? { q: initialQuery } : {}), ...(archived ? {view: "archive"} : {}), page: String(page) })}`;
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
    <div className="ops-heading"><div><h1>{tr(archived ? "أرشيف الطلبات" : "الطلبات")} <span className="count-pill">{totalMatches}</span></h1></div></div>
    {notice && <div role="status" className="inline-feedback">{tr(notice)}<button onClick={() => setNotice("")} aria-label={tr("إغلاق")}>×</button></div>}
    <div className="orders-panel">
      <div className="orders-toolbar kanban-toolbar">
        <form className="orders-search-form" method="get">
          {archived && <input type="hidden" name="view" value="archive" />}
          <label className="search-field"><input name="q" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("ابحث برقم الطلب أو العميل أو الهاتف")} aria-label={tr("ابحث برقم الطلب أو العميل أو الهاتف")} /></label>
          <button type="submit">{tr("بحث")}</button>
        </form>
        <label className="kanban-filter">
          {tr("فلتر الحالات")}
          <select value={filter} onChange={event => {setFilter(event.target.value as OrderStatus | "all"); setExpanded(null);}}>
            <option value="all">{tr("كل الطلبات")}</option>
            {orderStatuses.map(([key, label]) => <option key={key} value={key}>{tr(label)}</option>)}
          </select>
        </label>
        <Link className="export-button" href={archived ? "/cliqo-control/orders" : "/cliqo-control/orders?view=archive"}>{tr(archived ? "لوحة الطلبات" : "الأرشيف")}</Link>
      </div>
      {visible.filter((order) => order.id === expanded).map((order) => <div className="order-detail" key={order.id} ref={details} tabIndex={-1} aria-label={tr("تفاصيل الطلب")}>
        <div className="detail-heading"><div><span>{tr("تفاصيل الطلب")}</span><strong>{order.reference}</strong></div><div className="order-detail-end"><span className="detail-location">{order.city}</span><span className={"order-status-chip order-status-" + order.status}>{tr(orderStatusLabels[order.status])}</span><button type="button" className="row-more" aria-label={tr("إغلاق")} onClick={() => setExpanded(null)}>×</button></div></div>
        {order.payment === "test" && <div className="test-order-strip">
          <div><strong>{tr("طلب اختبار")}</strong><small>{tr("بدون تحصيل أو شحن فعلي")}</small></div>
        </div>}
        <p className="kanban-contact"><strong>{order.customer}</strong> · <bdi>{order.phone}</bdi> · {tr.date(order.createdAt)}</p>
        {order.payment !== "test" && <p className="kanban-contact">{tr(order.payment === "cod" ? "عند الاستلام" : "بطاقة")} · {tr(paymentStateLabels[order.paymentState] ?? order.paymentState)}{order.paymentAttempt && <> · {tr(paymentAttemptLabels[order.paymentAttempt] ?? order.paymentAttempt)}</>}</p>}
        {canArchive && archived && <div className="kanban-archive">
          <button className="export-button" disabled={pending} onClick={() => save(() => setOrderArchived(order.id, false))}>{tr("استرجع الطلب")}</button>
        </div>}
        {canArchive && !archived && ["returned", "delivered"].includes(order.status) && <div className="kanban-archive">
          {archivePrompt === order.id ? <>
            <span>{tr("الطلب هيتنقل للأرشيف وتقدر تسترجعه.")}</span>
            <button className="export-button" disabled={pending} onClick={() => save(() => setOrderArchived(order.id, true))}>{pick("أرشف الطلب", "Archive order")}</button>
            <button className="export-button" onClick={() => setArchivePrompt(null)}>{tr("تراجع")}</button>
          </> : <button className="export-button" onClick={() => setArchivePrompt(order.id)}>{pick("أرشف الطلب", "Archive order")}</button>}
        </div>}
        {canDelete && order.status === "cancelled" && <div className="order-delete-panel">
          {deletePrompt === order.id ? <>
            <p>{pick("حذف نهائي. لا يمكن استرجاع الطلب أو ملاحظاته وملفات تصميمه.", "Permanent deletion cannot be undone. The order, notes and design files will be removed.")}</p>
            <button type="button" disabled={pending || ["paid", "cod_collected", "cod_settled", "refunded"].includes(order.paymentState)} onClick={() => save(() => deleteCancelledOrder(order.id))}>{pick("احذف نهائيًا", "Delete permanently")}</button>
            <button type="button" disabled={pending} onClick={() => setDeletePrompt(null)}>{tr("تراجع")}</button>
            {["paid", "cod_collected", "cod_settled", "refunded"].includes(order.paymentState) && <small>{pick("لا يمكن حذف طلب عليه تحصيل أو استرداد.", "Orders with a collection or refund record must be kept.")}</small>}
          </> : <button type="button" onClick={() => setDeletePrompt(order.id)}>{pick("حذف الطلب الملغي", "Delete cancelled order")}</button>}
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
                {(canDownload || whatsapp || Boolean(order.payment === "test" && line.testItemIds?.length)) && <div className="order-workflow-actions">
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
        {!archived && <><label className="note-field">{tr("ملاحظة داخلية")}<textarea value={draft} maxLength={2000} placeholder={tr("أضف ملاحظة للمتابعة...")} onChange={(event) => setDraft(event.target.value)} /></label>
        <button className="save-note" disabled={pending || !draft.trim()} onClick={() => save(() => addOrderNote(order.id, draft), true)}>{tr("حفظ الملاحظة")}</button></>}
      </div>)}
      <div className="kanban-board" role="region" aria-label={tr("لوحة الطلبات")} tabIndex={0}>
        {orderStatuses.filter(([key]) => filter === "all" || key === filter).map(([key, label]) => {
          const cards = visible.filter(order => order.status === key);
          return <section key={key} data-order-status={key} className={"kanban-column" + (dragged ? " is-drop-ready" : "")} aria-label={tr(label)} tabIndex={0}
            onDragOver={event => { if (canEdit && dragged && !pending) event.preventDefault(); }}
            onDrop={event => {
              event.preventDefault();
              const draggedId = event.dataTransfer.getData("text/plain") || dragged;
              const order = visible.find(item => item.id === draggedId);
              setDragged(null);
              if (canEdit && !pending && order && order.status !== key) save(() => changeOrderStatus(order.id, key, order.status));
            }}>
            <header><h2>{tr(label)}</h2><span>{cards.length}</span></header>
            <div className="kanban-cards">{cards.map(order => <article key={order.id} className={"kanban-card" + (dragged === order.id ? " is-dragged" : "")}
              draggable={canEdit && !pending}
              onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", order.id); setDragged(order.id); }}
              onDragEnd={() => setDragged(null)}>
              <button className="kanban-open" type="button" aria-expanded={expanded === order.id} onClick={() => {
                setExpanded(expanded === order.id ? null : order.id); setDraft(""); setArchivePrompt(null);
              }}><bdi>{order.reference}</bdi><strong>{order.customer}</strong></button>
              <span>{order.lines.reduce((sum, line) => sum + line.qty, 0)} {tr("قطعة")} · {order.payment === "test" ? tr("طلب اختبار") : `${(order.totalMinor / 100).toLocaleString(tr.numberLocale)} ${tr("ج.م")}`}</span>
            </article>)}
            {!cards.length && <p>{tr("مفيش طلبات")}</p>}</div>
          </section>;
        })}
      </div>
      <footer className="table-footer"><span>{tr("عرض {value0} من {value1} طلب", { value0: visible.length, value1: totalMatches })} · {tr("صفحة {value0} من {value1}", { value0: currentPage, value1: totalPages })}</span><nav className="order-pagination" aria-label={tr("صفحات الطلبات")}>{currentPage>1&&<Link href={pageHref(currentPage-1)}>{tr("السابق")}</Link>}{currentPage<totalPages&&<Link href={pageHref(currentPage+1)}>{tr("التالي")}</Link>}</nav></footer>
    </div>
  </section>;
}
