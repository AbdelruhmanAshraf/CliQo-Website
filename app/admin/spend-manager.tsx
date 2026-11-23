"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/i18n/client";
import { addAdSpend, deleteAdSpend } from "./overview-actions";

type Spend = { id: string; spend_date: string; channel: string; campaign: string; amount_minor: number; note: string };

export function SpendManager({ rows, today, totalMinor }: { rows: Spend[]; today: string; totalMinor: number }) {
  const tr = useCopy();
  const pick = (ar: string, en: string) => tr.locale === "ar" ? ar : en;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    startTransition(async () => {
      const result = await addAdSpend(form);
      setNotice(result.message);
      if (result.ok) { formElement.reset(); router.refresh(); }
    });
  }

  const money = (minor: number) => tr.money(minor / 100);
  return <section className="overview-spend-panel" aria-labelledby="overview-spend-heading">
    <header><div><p className="ops-eyebrow">{pick("إعلانات ومصروفات", "Marketing spend")}</p><h2 id="overview-spend-heading">{pick("المصروف الإعلاني", "Advertising spend")}</h2><p>{pick("إدخال يدوي من الفواتير؛ لا يوجد ربط تلقائي بعد.", "Entered manually from invoices; no automatic account sync yet.")}</p></div><strong>{money(totalMinor)}</strong></header>
    <form className="overview-spend-form" onSubmit={submit}>
      <label>{pick("التاريخ", "Date")}<input name="spendDate" type="date" defaultValue={today} required /></label>
      <label>{pick("القناة", "Channel")}<select name="channel" defaultValue="Meta"><option>Meta</option><option>TikTok</option><option>Google</option><option>{pick("أخرى", "Other")}</option></select></label>
      <label className="overview-spend-campaign">{pick("الحملة أو الوصف", "Campaign or description")}<input name="campaign" maxLength={120} required placeholder={pick("مثال: حملة إطلاق نوفمبر", "Example: November launch campaign")} /></label>
      <label>{pick("المبلغ · ج.م", "Amount · EGP")}<input name="amount" type="number" min="0.01" max="9999999.99" step="0.01" required /></label>
      <label className="overview-spend-note">{pick("ملاحظة (اختياري)", "Note (optional)")}<input name="note" maxLength={300} /></label>
      <button type="submit" disabled={pending}>{pending ? pick("جاري الحفظ…", "Saving…") : pick("سجّل المصروف", "Save spend")}</button>
    </form>
    {notice && <p role="status" className="overview-spend-notice">{tr(notice)}</p>}
    <div className="overview-spend-list">
      {rows.length ? rows.map((row) => <article key={row.id}><time>{tr.date(row.spend_date)}</time><span><b>{row.campaign}</b><small>{row.channel}{row.note ? " · " + row.note : ""}</small></span><strong>{money(row.amount_minor)}</strong><button type="button" disabled={pending} aria-label={pick("حذف سجل المصروف", "Delete spend record")} onClick={() => startTransition(async () => { const result = await deleteAdSpend(row.id); setNotice(result.message); if (result.ok) router.refresh(); })}>×</button></article>) : <p>{pick("لم تسجل مصروفًا إعلانيًا في هذه الفترة.", "No advertising spend recorded for this period.")}</p>}
    </div>
  </section>;
}
