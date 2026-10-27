
import {getCopy} from "@/i18n/server";
import { NextResponse } from "next/server";
import { CheckoutError, getCheckoutQuote, parseCheckoutItems } from "@/lib/checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const tr = await getCopy();
  try {
    const raw = await request.text();
    if (raw.length > 64000) return NextResponse.json({ error: tr("السلة كبيرة جدًا.") }, { status: 413 });
    const items = parseCheckoutItems(JSON.parse(raw)?.items);
    const quote = await getCheckoutQuote(items);
    return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: tr(error.message) }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: tr("بيانات السلة غير صالحة.") }, { status: 400 });
    return NextResponse.json({ error: tr("تعذر مراجعة السلة حاليًا.") }, { status: 500 });
  }
}
