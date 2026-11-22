"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPhysicalCheck } from "../actions";
import { useCopy } from "@/i18n/client";

type Check = {
  nfc_mode: "unwritten" | "prewritten" | "customer_write";
  qr_scanned_at: string | null;
  nfc_tested_at: string | null;
  nfc_locked_at: string | null;
  note: string;
};

export function PhysicalCheckForm({ publicId, initial }: { publicId: string; initial: Check | null }) {
  const tr = useCopy();
  const router = useRouter();
  const [mode, setMode] = useState<Check["nfc_mode"]>(initial?.nfc_mode ?? "unwritten");
  const [qrScanned, setQrScanned] = useState(Boolean(initial?.qr_scanned_at));
  const [nfcTested, setNfcTested] = useState(Boolean(initial?.nfc_tested_at));
  const [nfcLocked, setNfcLocked] = useState(Boolean(initial?.nfc_locked_at));
  const [note, setNote] = useState(initial?.note ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const locked = Boolean(initial?.nfc_locked_at);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nfcLocked && !locked && !window.confirm(tr("قفل شريحة NFC قد يكون دائمًا. تأكد أنك كتبت الرابط الثابت، قرأته بهاتف آخر، واختبرت QR. سجّل القفل؟"))) return;
    startTransition(async () => {
      const result = await recordPhysicalCheck(publicId, { mode, qrScanned, nfcTested, nfcLocked, note });
      setMessage(tr(result.message));
      if (result.ok) router.refresh();
    });
  }

  return <form className="stock-receipt-form" onSubmit={submit}>
    <h2>{tr("فحص QR وNFC الفعلي")}</h2>
    <p>{tr("سجّل نتيجة الفحص بعد مسح القطعة الحقيقية. هذه الخانات إثبات يدوي، وليست قراءة آلية للشريحة.")}</p>
    <label>{tr("تجهيز NFC")}
      <select value={mode} disabled={locked} onChange={(event) => { setMode(event.target.value as Check["nfc_mode"]); setNfcTested(false); setNfcLocked(false); }}>
        <option value="unwritten">{tr("لم تُكتب بعد")}</option>
        <option value="prewritten">{tr("CliQo كتبت الرابط")}</option>
        <option value="customer_write">{tr("العميل سيكتبها بنفسه · تُسلّم مفتوحة")}</option>
      </select>
    </label>
    <label><input type="checkbox" style={{ width: 18, height: 18 }} checked={qrScanned} disabled={locked} onChange={(event) => setQrScanned(event.target.checked)} />{tr("QR المطبوع اتفحص بموبايل")}</label>
    {mode === "prewritten" && <>
      <label><input type="checkbox" style={{ width: 18, height: 18 }} checked={nfcTested} disabled={locked} onChange={(event) => { setNfcTested(event.target.checked); if (!event.target.checked) setNfcLocked(false); }} />{tr("NFC اتقرت بموبايل تاني وفتحت نفس الرابط")}</label>
      <label><input type="checkbox" style={{ width: 18, height: 18 }} checked={nfcLocked} disabled={locked || !nfcTested || !qrScanned} onChange={(event) => setNfcLocked(event.target.checked)} />{tr("الشريحة اتقفلت للقراءة فقط بعد الاختبار")}</label>
    </>}
    <label>{tr("ملاحظة فحص (اختياري)")}<textarea value={note} maxLength={300} rows={2} onChange={(event) => setNote(event.target.value)} /></label>
    <button type="submit" className="save-note" disabled={pending}>{pending ? tr("جاري الحفظ…") : tr("احفظ نتيجة الفحص")}</button>
    {locked && <p>{tr("مسجل أنها مقفولة. تغيير وجهة العميل لاحقًا يتم من الداشبورد.")}</p>}
    {message && <p role="status">{message}</p>}
  </form>;
}
