import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prepareTestCheckoutInventory } from "@/lib/test-checkout";
import { createTestCheckoutCookie, testCheckoutCookie, testCheckoutEnabled, testCheckoutLifetime } from "@/lib/test-checkout-session";
import { CheckoutError } from "@/lib/checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.url).origin;
  if (request.headers.get("origin") !== origin) return new Response(null, { status: 403 });
  const secure = origin.startsWith("https:");
  const options = { path: "/", sameSite: "lax", httpOnly: true, secure } as const;
  const form = await request.formData();
  if (form.get("mode") === "exit") {
    const response = NextResponse.redirect(new URL("/products",origin),303);
    response.cookies.set(testCheckoutCookie,"",{...options,maxAge:0});
    return response;
  }

  if (!testCheckoutEnabled()) return new Response(null,{status:404});
  const { staff } = await requireStaff(["owner"]);
  try {
    await prepareTestCheckoutInventory(staff.user_id);
    const response = NextResponse.redirect(new URL("/products",origin),303);
    response.cookies.set(testCheckoutCookie,createTestCheckoutCookie(),{...options,maxAge:testCheckoutLifetime});
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL(`/cliqo-control/orders?testError=${error instanceof CheckoutError ? "closed" : "stock"}`,origin),303);
  }
}
