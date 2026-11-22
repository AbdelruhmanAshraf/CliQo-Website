
import {getCopy} from "@/i18n/server";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { CheckoutError, getCheckoutQuote, parseCheckoutItems } from "@/lib/checkout";
import { getLocale } from "next-intl/server";
import {CardOrderError, createOrResumeCardOrder} from "@/lib/card-orders";
import { createTestOrder } from "@/lib/test-checkout";
import {getPaymobConfig} from "@/lib/paymob";

export const runtime = "nodejs";
const requestKey = /^[a-f0-9]{64}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{7,14}$/;

export async function POST(request: NextRequest) {
  const tr = await getCopy();
  try {
    const raw = await request.text();
    if (raw.length > 64000) return NextResponse.json({ error: tr("بيانات الطلب كبيرة جدًا.") }, { status: 413 });
    const body = JSON.parse(raw);
    const items = parseCheckoutItems(body?.items);
    const requestedMethod = body?.payment_method === "card" ? "card" : body?.payment_method === "cod" || body?.payment_method === undefined ? "cod" : "invalid";
    if (requestedMethod === "invalid") return NextResponse.json({error: tr("اختار طريقة دفع متاحة.")}, {status: 400});
    const key = typeof body?.requestKey === "string" ? body.requestKey.toLowerCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const address = body?.address;
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (!requestKey.test(key) || name.length < 1 || name.length > 140
        || !phonePattern.test(phone) || (email && (!emailPattern.test(email) || email.length > 254))
        || !address || typeof address !== "object" || Array.isArray(address)
        || !["governorate", "city", "street"].every((field) => typeof address[field] === "string")
        || address.governorate.trim().length < 2 || address.governorate.trim().length > 100
        || address.city.trim().length < 2 || address.city.trim().length > 100
        || address.street.trim().length < 3 || address.street.trim().length > 250
        || note.length > 1000) {
      return NextResponse.json({ error: tr("راجع بيانات التواصل والعنوان.") }, { status: 400 });
    }
    const quote = await getCheckoutQuote(items);
    if (quote.testMode) {
      if (body.payment_method !== undefined) {
        return NextResponse.json({error: tr("طلب الاختبار لا يحتاج طريقة دفع.")},{status:400});
      }
      const result = await createTestOrder({
        keyHash: createHash("sha256").update(key).digest("hex"), name, phone, address,
        note: note || null, locale: (await getLocale()) === "en" ? "en" : "ar", items,
        subtotal: quote.subtotalMinor, lines: quote.lines,
      });
      const response = NextResponse.json({reference: result.reference, statusPath: "/orders/" + result.reference},
        {status: result.existing ? 200 : 201, headers: {"Cache-Control":"no-store"}});
      response.cookies.set("cliqo_order_" + result.reference,key,{
        httpOnly:true,sameSite:"lax",secure:request.nextUrl.protocol==="https:",
        path:"/orders/"+result.reference,maxAge:60*60*24*30,
      });
      return response;
    }
    if (!quote.paymentMethods[requestedMethod]) {
      return NextResponse.json({error: tr("طريقة الدفع دي مش متاحة حاليًا.")}, {status: 409});
    }
    if (requestedMethod === "card") {
      const config = getPaymobConfig();
      if (!config) return NextResponse.json({error: tr("الدفع بالبطاقة غير جاهز حاليًا."), retryWithNewOrder: true}, {status: 503});
      const result = await createOrResumeCardOrder({
        requestKey: key, name, phone, email: email || null, address: {
          governorate: address.governorate.trim(), city: address.city.trim(), street: address.street.trim(),
        }, note: note || null, items, quote, locale: (await getLocale()) === "en" ? "en" : "ar", config,
      });
      if (!/^CQ-[0-9]{6,}$/.test(result.reference)) throw new Error("Card order creation returned no reference.");
      const checkoutUrl = new URL(result.checkoutUrl);
      if (checkoutUrl.protocol !== "https:" || !["accept.paymob.com", "oman.paymob.com", "ksa.paymob.com", "uae.paymob.com"].includes(checkoutUrl.hostname)
          || checkoutUrl.pathname !== "/unifiedcheckout/") throw new Error("Unexpected Paymob checkout URL.");
      const response = NextResponse.json({
        reference: result.reference,
        statusPath: "/orders/" + result.reference,
        paymentUrl: checkoutUrl.toString(),
      }, {status: result.existing ? 200 : 201, headers: {"Cache-Control": "no-store"}});
      response.cookies.set("cliqo_order_" + result.reference, key, {
        httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
        path: "/orders/" + result.reference, maxAge: 60 * 60 * 24 * 30,
      });
      return response;
    }
    const keyHash = createHash("sha256").update(key).digest("hex");
    const client = await getDb().connect();
    let orderRows: { created_order_id: string; created_order_reference: string }[];
    try {
      await client.query("begin");
      const locale = await getLocale();
      await client.query("select set_config('cliqo.email_locale',$1,true)", [locale === "en" ? "en" : "ar"]);
      const result = await client.query<{ created_order_id: string; created_order_reference: string }>(
        "select * from app_private.create_cod_order($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)",
        [keyHash, name, phone, email || null, JSON.stringify(address), note || null, JSON.stringify(items)]
      );
      orderRows = result.rows;
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const reference = orderRows[0]?.created_order_reference;
    if (!reference || !/^CQ-[0-9]{6,}$/.test(reference)) throw new Error("Order creation returned no reference.");
    const response = NextResponse.json({ reference, statusPath: "/orders/" + reference }, { status: 201, headers: { "Cache-Control": "no-store" } });
    response.cookies.set("cliqo_order_" + reference, key, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
      path: "/orders/" + reference, maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    if (error instanceof CardOrderError) {
      if (error.code === "provider") return NextResponse.json({error: tr("تعذر بدء الدفع. حدّث المحاولة وجرّب من جديد."), retryWithNewOrder: true}, {status: 502});
      if (error.code === "in-progress") return NextResponse.json({error: tr("طلب الدفع قيد التجهيز. انتظر لحظة ثم أعد المحاولة بنفس الصفحة.")}, {status: 409});
      if (error.code === "already-paid") return NextResponse.json({error: tr("الطلب مدفوع بالفعل. افتح رابط المتابعة.")}, {status: 409});
      if (error.code === "manual-review") return NextResponse.json({error: tr("وصل الدفع بعد انتهاء المهلة ويحتاج مراجعة. لا تعِد الدفع." )}, {status: 409});
      if (error.code === "retry") return NextResponse.json({error: tr("انتهت محاولة الدفع. يمكنك بدء طلب دفع جديد.") , retryWithNewOrder: true}, {status: 409});
      if (error.code === "closed") return NextResponse.json({error: tr("الدفع بالبطاقة غير جاهز حاليًا.")}, {status: 503});
      return NextResponse.json({error: tr("منتج في السلة لم يعد متاحًا. راجع السلة.")}, {status: 409});
    }
    if (error instanceof CheckoutError) return NextResponse.json({ error: tr(error.message) }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: tr("بيانات الطلب غير صالحة.") }, { status: 400 });
    const detail = error instanceof Error ? error.message : "";
    if (detail === "checkout is closed") return NextResponse.json({ error: tr("استقبال الطلبات غير متاح حاليًا.") }, { status: 503 });
    if (detail === "SKU is not approved for sale" || detail === "insufficient stock") {
      return NextResponse.json({ error: tr("منتج في السلة لم يعد متاحًا. راجع السلة.") }, { status: 409 });
    }
    return NextResponse.json({ error: tr("تعذر تسجيل الطلب. جرّب مرة ثانية.") }, { status: 500 });
  }
}
