"use client";
import { useCopy } from '@/i18n/client';


import { useState } from "react";

export function DownloadQr({ downloadReady, preview }: { downloadReady: boolean; preview: boolean }) {
  const tr = useCopy();

  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const response = await fetch(`${window.location.pathname}/qr`);
      if (!response.ok || !response.headers.get("content-type")?.includes("image/svg+xml")) throw new Error("qr_download_failed");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? "cliqo-qr.svg";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.alert(tr("تعذر تنزيل QR. حدّث الصفحة وحاول مرة أخرى."));
    } finally {
      setDownloading(false);
    }
  }

  return <section className="item-qr-download" aria-labelledby="item-qr-title">
    <div><strong id="item-qr-title">{tr("QR الخاص بقطعتك")}</strong><p>{tr("ملف SVG واضح للطباعة. يفتح نفس الرابط الثابت المسجل على NFC.")}</p>
      {!downloadReady && <small>{tr("تنزيل QR متاح بعد ضبط عنوان الموقع.")}</small>}
      {preview && <small>{tr("QR التجربة يفتح الموقع المحلي فقط. لا تطبعه على منتج للبيع.")}</small>}
    </div>
    <button type="button" onClick={download} disabled={downloading || !downloadReady}>{downloading ? tr("جاري التجهيز…") : tr(preview ? "نزّل QR للتجربة · SVG" : "نزّل QR بصيغة SVG")}</button>
  </section>;
}
