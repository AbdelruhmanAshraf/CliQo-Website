"use client";
import { useCopy } from '@/i18n/client';


import {skuLabel} from "@/i18n/catalog";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useCart } from "../cart-provider";

type Quote = {
  lines: { skuId: string; name: string; quantity: number; lineTotalMinor: number; designTier?: string; businessName?: string }[];
  subtotalMinor: number; shippingMinor: number; totalMinor: number; carrierName: string;
  testMode: boolean; paymentMethods: {cod: boolean; card: boolean}; cardMode: "test" | "live" | null;
};
type PaymentMethod = "cod" | "card";
type Suggestion={skuId:string;slug:string;name:string;priceEgp:number;available:number;image:string;choices:string[];optionValues:Record<string,string>};


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

export function CheckoutForm({ carrierName,suggestions,testMode }: { carrierName: string;suggestions:Suggestion[];testMode:boolean }) {
  const tr = useCopy();
  const money = (minor: number) => tr.money(minor / 100);

  const { items, ready, clearCart, addItem } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const fingerprint = items.map((item) => JSON.stringify([item.skuId, item.quantity, item.customDesign ?? null])).sort().join("|");
  const suggested=suggestions.find(item=>!items.some(line=>line.skuId===item.skuId||line.slug===item.slug));

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
            ...(item.customDesign ? { business_name: item.customDesign.businessName, destination_url: item.customDesign.destinationUrl, design_brief: item.customDesign.brief } : {}),
          })) }),
        });
        const result = await response.json();
        if (!active) return;
        if (!response.ok) { setQuote(null); setError(result.error ?? "تعذر مراجعة السلة."); return; }
        const checkedQuote = result as Quote;
        setError(""); setQuote(checkedQuote);
        setPaymentMethod(checkedQuote.testMode || checkedQuote.paymentMethods.cod ? "cod" : "card");
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
          requestKey: attemptKey(`${fingerprint}|${quote.testMode ? "test" : paymentMethod}`),
          ...(quote.testMode ? {} : {payment_method: paymentMethod}),
          items: items.map((item) => ({
            sku_id: item.skuId, quantity: item.quantity,
            ...(item.customDesign ? { business_name: item.customDesign.businessName, destination_url: item.customDesign.destinationUrl, design_brief: item.customDesign.brief } : {}),
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
      if (!response.ok) {
        if (result.retryWithNewOrder) window.sessionStorage.removeItem("cliqo-checkout-attempt");
        setError(result.error ?? "تعذر تسجيل الطلب."); return;
      }
      if (!quote.testMode && paymentMethod === "card" && typeof result.paymentUrl !== "string") {
        setError("رابط الدفع غير متاح. جرّب مرة ثانية."); return;
      }
      if (!quote.testMode && paymentMethod === "card") {
        window.location.assign(result.paymentUrl);
      } else {
        clearCart();
        window.sessionStorage.removeItem("cliqo-checkout-attempt");
        window.location.assign(result.statusPath);
      }
    } catch { setError("تعذر الاتصال. جرّب مرة ثانية؛ نفس المحاولة مش هتعمل طلبًا مكررًا."); }
    finally { setBusy(false); }
  }

  return <div className="checkout-grid">
    <form className="checkout-form" onSubmit={submit}>
      <h2>{tr("بياناتك والتوصيل")}</h2>
      <div className="checkout-fields">
        <label>{tr("الاسم بالكامل")}<input name="name" required maxLength={140} autoComplete="name" /></label>
        <label>{tr("رقم الموبايل")}<input name="phone" type="tel" required autoComplete="tel" dir="ltr" placeholder={tr("010... أو +20...")} /></label>
        {!testMode && <label>{tr("البريد الإلكتروني")} <small>{tr("اختياري")}</small><input name="email" type="email" maxLength={254} autoComplete="email" dir="ltr" /></label>}
        <label>{tr("المحافظة")}<input name="governorate" required minLength={2} maxLength={100} /></label>
        <label>{tr("المدينة / المنطقة")}<input name="city" required minLength={2} maxLength={100} /></label>
        <label className="full">{tr("الشارع والعنوان التفصيلي")}<input name="street" required minLength={3} maxLength={250} autoComplete="street-address" /></label>
        <label className="full">{tr("ملاحظات التوصيل")} <small>{tr("اختياري")}</small><textarea name="note" maxLength={1000} /></label>
      </div>
      {testMode ? <p className="checkout-test-notice">{tr("طلب تجربة بدون دفع أو شحن فعلي. الإدارة هتأكد الطلب يدويًا.")}</p>
        : <fieldset className="checkout-payment"><legend>{tr("طريقة الدفع")}</legend>
        {quote?.paymentMethods.cod && <label><input type="radio" name="payment_method" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} /> {tr("الدفع عند الاستلام")}</label>}
        {quote?.paymentMethods.card && <label><input type="radio" name="payment_method" value="card" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> {tr("بطاقة")}</label>}
        {paymentMethod === "card" ? <><p>{tr("هتنتقل لصفحة دفع آمنة. تأكيد الدفع يصل من البوابة، مش من صفحة الرجوع.")}</p>{quote?.cardMode === "test" && <p role="status">{tr("بيئة اختبار Sandbox. لا تستخدم بيانات دفع حقيقية.")}</p>}</> : <p>{tr("هنراجع الطلب قبل التجهيز. الدفع عند الاستلام لا يعني إن الطلب مدفوع.")}</p>}
      </fieldset>}
      {error && <p className="checkout-error" role="alert">{tr(error)}</p>}
      <button className="button button-primary" type="submit" disabled={!quote || busy}>{busy ? tr("بنجهّز الطلب…") : testMode ? tr("سجّل طلب الاختبار") : paymentMethod === "card" ? tr("تابع للدفع بالبطاقة") : tr("تأكيد الطلب والدفع عند الاستلام")} <span>←</span></button>
    </form>
    <aside className="checkout-summary"><h2>{tr("ملخص طلبك")}</h2>
      {quote ? <>{quote.lines.map((line, index) => <div key={`${line.skuId}-${index}`}><span>{skuLabel(tr, items.find((item) => item.skuId === line.skuId)?.slug ?? "", {}, line.name)} × {line.quantity}{line.designTier && <small>{tr("تصميم")} {line.designTier} · {line.businessName}</small>}</span><b>{money(line.lineTotalMinor)}</b></div>)}
        <div><span>{tr("المنتجات")}</span><b>{money(quote.subtotalMinor)}</b></div>
        {!testMode && <div><span>{tr("الشحن ·")} {quote.carrierName}</span><b>{money(quote.shippingMinor)}</b></div>}
        <div className="checkout-total"><span>{tr(testMode ? "الإجمالي التجريبي" : "الإجمالي")}</span><b>{money(quote.totalMinor)}</b></div></>
        : <p>{tr("بنراجع الأسعار والتوافر…")}</p>}
      {suggested&&<section className="checkout-suggestion"><img src={suggested.image} alt="" width={92} height={92}/><div><strong>{tr('ممكن تضيف كمان')} {suggested.name}</strong><small>{tr('متاح الآن')} · {money(suggested.priceEgp*100)}</small><button type="button" onClick={()=>addItem({skuId:suggested.skuId,slug:suggested.slug,name:suggested.name,unitPriceEgp:suggested.priceEgp,choices:suggested.choices,optionValues:suggested.optionValues})}>{tr('أضف للطلب')}</button></div></section>}
      <Link href="/cart">{tr("تعديل السلة")}</Link>{!testMode && <small>{tr("شركة الشحن:")} {carrierName}</small>}
    </aside>
  </div>;
}
