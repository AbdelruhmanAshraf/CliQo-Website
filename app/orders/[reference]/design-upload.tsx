"use client";
import { useCopy } from '@/i18n/client';


import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function DesignUpload({ reference, orderLineId, required, open, files }: {
  reference: string; orderLineId: string; required: boolean; open: boolean; files: { name: string; createdAt: string }[];
}) {
  const tr = useCopy();

  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const hasFile = files.length > 0;
  return <form className="design-upload" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !open) return;
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setMessage(tr("اختار ملفًا لا يتجاوز ٥ ميجابايت."));
      return;
    }
    setBusy(true);
    setMessage("");
    const data = new FormData();
    data.set("orderLineId", orderLineId);
    data.set("file", file);
    try {
      const response = await fetch(`/orders/${encodeURIComponent(reference)}/design-files`, { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error ?? tr("تعذر رفع الملف.")); return; }
      form.reset();
      setMessage(tr("اترفع الملف بأمان. CliQo هتراجعه قبل تجهيز التصميم."));
      router.refresh();
    } catch {
      setMessage(tr("تعذر الاتصال. جرّب رفع الملف مرة ثانية."));
    } finally {
      setBusy(false);
    }
  }}>
    <strong>{required && !hasFile ? tr("مطلوب قبل بدء الإنتاج") : tr("ملف التصميم")}</strong>
    {hasFile && <ul>{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}</ul>}
    {open && files.length < 3 && <>
      <label>{tr("اختر ملف JPG أو PNG أو WebP أو PDF")}<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={required && !hasFile} /></label>
      <button type="submit" className="button button-secondary" disabled={busy}>{busy ? tr("جاري الرفع…") : hasFile ? tr("رفع نسخة محدثة") : tr("رفع ملف التصميم")}</button>
      <small>{tr("الملف خاص بالطلب، الحد الأقصى ٥ ميجابايت. يمكنك إضافة ٣ ملفات كحد أقصى.")}</small>
    </>}
    {!open && <small>{tr("انتهت فترة استلام ملفات التصميم لهذا الطلب.")}</small>}
    {message && <p role="status">{tr(message)}</p>}
  </form>;
}
