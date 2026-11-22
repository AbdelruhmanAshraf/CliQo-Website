import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const testCheckoutCookie = "cliqo-test-checkout";
export const testCheckoutLifetime = 4 * 60 * 60;
const sessionPattern = /^(\d{10})\.([A-Za-z0-9_-]{43})$/;

export function testCheckoutEnabled() {
  return process.env.CLIQO_ENABLE_TEST_CHECKOUT === "true"
    && (process.env.CLIQO_ORDER_ACCESS_SECRET?.length ?? 0) >= 32;
}

function signature(expiration: number) {
  return createHmac("sha256", process.env.CLIQO_ORDER_ACCESS_SECRET ?? "")
    .update(`cliqo-private-test-checkout:v1:${expiration}`).digest("base64url");
}

export function createTestCheckoutCookie() {
  if (!testCheckoutEnabled()) throw new Error("Test checkout is disabled");
  const expiration = Math.floor(Date.now() / 1000) + testCheckoutLifetime;
  return `${expiration}.${signature(expiration)}`;
}

export async function hasTestCheckoutSession() {
  const store = await cookies();
  if (!testCheckoutEnabled()) return false;
  const match = store.get(testCheckoutCookie)?.value.match(sessionPattern);
  if (!match) return false;
  const expiration = Number(match[1]);
  if (expiration <= Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature(expiration)));
}
