"use client";
import { useCopy } from '@/i18n/client';


import {skuLabel} from "@/i18n/catalog";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useCart } from "../cart-provider";

type Quote = {
  lines: { skuId: string; name: string; quantity: number; lineTotalMinor: number; designTier?: string; businessName?: string }[];
  subtotalMinor: number; shippingMinor: number; totalMinor: number; carrierName: string;
};


function attemptKey(fingerprint: string) {
  const stored = window.sessionStorage.getItem("cliqo-checkout-attempt");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.fingerprint === fingerprint && /^[a-f0-9]{64}$/.test(parsed.key)) return parsed.key as string;
    } catch { /* Create a fresh token below. */ }
  }
  const key = Array.from(window.crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  window.sessionStorage.setItem("cliqo-checkout-attempt", JSON.stringify({ fingerprint, key }));
  return key;
}

export function CheckoutForm({ carrierName }: { carrierName: string }) {
  const tr = useCopy();
  const money = (minor: number) => tr.money(minor / 100);

  const { items, ready, clearCart } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fingerprint = items.map((item) => JSON.stringify([item.skuId, item.quantity, item.customDesign ?? null])).sort().join("|");

  useEffect(() => {
    if (!ready || !items.length) return;
    let active = true;
    setQuote(null);
    const fetchQuote = async () => {
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: items.map((item) => ({
            sku_id: item.skuId, quantity: item.quantity,
            ...(item.customDesign ? { business_name: item.customDesign.businessName, destination_url: item.customDesign.destinationUrl } : {}),
          })) }),
        });
        const result = await response.json();
        if (!active) return;
        if (!response.ok) { setQuote(null); setError(result.error ?? "تعذر مراجعة السلة."); return; }
        setError(""); setQuote(result as Quote);
      } catch { if (active) { setQuote(null); setError("تعذر مراجعة السلة. جرّب مرة ثانية."); } }
    };
    void fetchQuote();
    return () => { active = false; };
  }, [ready, fingerprint, items]);

  if (!ready) return <p className="checkout-closed">{tr("بنحمّل السلة…")}</p>;
  if (!items.length) return <section className="checkout-closed"><h2>{tr("السلة فاضية.")}</h2><Link href="/products">{tr("تصفح المنتجات")}</Link></section>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || busy) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const rawPhone = String(form.get("phone") ?? "").trim().replaceAll(" ", "");
    const phone = /^01[0-9]{9}$/.test(rawPhone) ? "+2" + rawPhone : rawPhone;
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: attemptKey(fingerprint),
          items: items.map((item) => ({
            sku_id: item.skuId, quantity: item.quantity,
            ...(item.customDesign ? { business_name: item.customDesign.businessName, destination_url: item.customDesign.destinationUrl } : {}),
          })),
          name: String(form.get("name") ?? ""), phone,
          email: String(form.get("email") ?? ""),
          address: {
            governorate: String(form.get("governorate") ?? ""),
            city: String(form.get("city") ?? ""),
            street: String(form.get("street") ?? ""),
          },
          note: String(form.get("note") ?? ""),
        }),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "تعذر تسجيل الطلب."); return; }
      clearCart();
      window.sessionStorage.removeItem("cliqo-checkout-attempt");
      window.location.assign(result.statusPath);
    } catch { setError("تعذر الاتصال. جرّب مرة ثانية؛ نفس المحاولة مش هتعمل طلبًا مكررًا."); }
    finally { setBusy(false); }
  }

  return <div className="checkout-grid">
    <form className="checkout-form" onSubmit={submit}>
      <h2>{tr("بياناتك والتوصيل")}</h2>
      <div className="checkout-fields">
        <label>{tr("الاسم بالكامل")}<input name="name" required maxLength={140} autoComplete="name" /></label>
        <label>{tr("رقم الموبايل")}<input name="phone" type="tel" required autoComplete="tel" dir="ltr" placeholder={tr("010... أو +20...")} /></label>
        <label>{tr("البريد الإلكتروني")} <small>{tr("اختياري")}</small><input name="email" type="email" maxLength={254} autoComplete="email" dir="ltr" /></label>
        <label>{tr("المحافظة")}<input name="governorate" required minLength={2} maxLength={100} /></label>
        <label>{tr("المدينة / المنطقة")}<input name="city" required minLength={2} maxLength={100} /></label>
        <label className="full">{tr("الشارع والعنوان التفصيلي")}<input name="street" required minLength={3} maxLength={250} autoComplete="street-address" /></label>
        <label className="full">{tr("ملاحظات التوصيل")} <small>{tr("اختياري")}</small><textarea name="note" maxLength={1000} /></label>
      </div>
      <div className="checkout-payment"><strong>{tr("طريقة الدفع")}</strong><label><input type="radio" checked readOnly />  {tr("الدفع عند الاستلام")}</label><p>{tr("الكارت هيتاح بعد اختيار وربط بوابة الدفع.")}</p></div>
      {error && <p className="checkout-error" role="alert">{tr(error)}</p>}
      <button className="button button-primary" type="submit" disabled={!quote || busy}>{busy ? tr("بنجهّز الطلب…") : tr("تأكيد الطلب والدفع عند الاستلام")} <span>←</span></button>
      <small>{tr("هنراجع الطلب قبل التجهيز. الدفع عند الاستلام لا يعني إن الطلب مدفوع.")}</small>
    </form>
    <aside className="checkout-summary"><h2>{tr("ملخص طلبك")}</h2>
      {quote ? <>{quote.lines.map((line, index) => <div key={`${line.skuId}-${index}`}><span>{skuLabel(tr, items.find((item) => item.skuId === line.skuId)?.slug ?? "", {}, line.name)} × {line.quantity}{line.designTier && <small>{tr("تصميم")} {line.designTier} · {line.businessName}</small>}</span><b>{money(line.lineTotalMinor)}</b></div>)}
        <div><span>{tr("المنتجات")}</span><b>{money(quote.subtotalMinor)}</b></div>
        <div><span>{tr("الشحن ·")} {quote.carrierName}</span><b>{money(quote.shippingMinor)}</b></div>
        <div className="checkout-total"><span>{tr("الإجمالي")}</span><b>{money(quote.totalMinor)}</b></div></>
        : <p>{tr("بنراجع الأسعار والتوافر…")}</p>}
      <Link href="/cart">{tr("تعديل السلة")}</Link><small>{tr("شركة الشحن:")} {carrierName}</small>
    </aside>
  </div>;
}
