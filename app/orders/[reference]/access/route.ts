import {NextRequest, NextResponse} from "next/server";
import {getDb} from "@/lib/db";
import {orderAccessTokenExpiry, verifyOrderAccessToken} from "@/lib/order-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, {params}: {params: Promise<{reference: string}>}) {
  const {reference} = await params;
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const expiresAt = orderAccessTokenExpiry(token);
  if (!/^CQ-[0-9]{6,}$/.test(reference) || !expiresAt) {
    return NextResponse.json({error: "Invalid order link."}, {status: 404, headers: {"Cache-Control": "no-store"}});
  }

  try {
    const result = await getDb().query<{tracking_token_hash: string}>(
      "select tracking_token_hash from public.orders where order_reference=$1",
      [reference],
    );
    const order = result.rows[0];
    if (!order || !verifyOrderAccessToken(reference, token, order.tracking_token_hash)) {
      return NextResponse.json({error: "Invalid order link."}, {status: 404, headers: {"Cache-Control": "no-store"}});
    }

    const response = NextResponse.redirect(new URL("/orders/" + encodeURIComponent(reference), request.nextUrl), 302);
    response.cookies.set("cliqo_order_" + reference, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/orders/" + reference,
      maxAge: Math.max(1, expiresAt - Math.floor(Date.now() / 1000)),
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.json({error: "Order tracking is temporarily unavailable."}, {status: 503, headers: {"Cache-Control": "no-store"}});
  }
}
