
import {getCopy} from "@/i18n/server";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { CheckoutError, getCheckoutQuote, parseCheckoutItems } from "@/lib/checkout";

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
    await getCheckoutQuote(items);
    const keyHash = createHash("sha256").update(key).digest("hex");
    const { rows } = await getDb().query<{ created_order_id: string; created_order_reference: string }>(
      "select * from app_private.create_cod_order($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)",
      [keyHash, name, phone, email || null, JSON.stringify(address), note || null, JSON.stringify(items)]
    );
    const reference = rows[0]?.created_order_reference;
    if (!reference || !/^CQ-[0-9]{6,}$/.test(reference)) throw new Error("Order creation returned no reference.");
    const response = NextResponse.json({ reference, statusPath: "/orders/" + reference }, { status: 201, headers: { "Cache-Control": "no-store" } });
    response.cookies.set("cliqo_order_" + reference, key, {
      httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
      path: "/orders/" + reference, maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
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
