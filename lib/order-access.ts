import "server-only";

import {createHash, createHmac, timingSafeEqual} from "node:crypto";

const tokenPattern = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})$/;
const orderAccessLifetimeSeconds = 30 * 24 * 60 * 60;

function secret() {
  const value = process.env.CLIQO_ORDER_ACCESS_SECRET ?? "";
  return value.length >= 32 ? value : null;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(reference: string, trackingHash: string, expiresAt: number, key: string) {
  return createHmac("sha256", key)
    .update("cliqo-order-access:v1\n" + reference + "\n" + trackingHash + "\n" + expiresAt)
    .digest("base64url");
}

export function createOrderAccessToken(reference: string, trackingHash: string) {
  const key = secret();
  if (!key || !/^CQ-[0-9]{6,}$/.test(reference) || !/^[a-f0-9]{64}$/i.test(trackingHash)) {
    throw new Error("Order access token is not configured.");
  }
  const expiresAt = Math.floor(Date.now() / 1000) + orderAccessLifetimeSeconds;
  return "v1." + expiresAt + "." + signature(reference, trackingHash, expiresAt, key);
}

export function orderAccessTokenExpiry(token: string) {
  const match = token.match(tokenPattern);
  return match ? Number(match[1]) : null;
}

export function verifyOrderAccessToken(reference: string, token: string, trackingHash: string) {
  const key = secret();
  const match = token.match(tokenPattern);
  if (!key || !match || !/^CQ-[0-9]{6,}$/.test(reference) || !/^[a-f0-9]{64}$/i.test(trackingHash)) return false;
  const expiresAt = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + orderAccessLifetimeSeconds + 60) return false;
  return safeEqual(match[2], signature(reference, trackingHash, expiresAt, key));
}

export function isOrderAccessCookieValid(reference: string, cookie: string, trackingHash: string) {
  if (/^[a-f0-9]{64}$/i.test(cookie)) {
    const actualHash = createHash("sha256").update(cookie).digest("hex");
    return safeEqual(actualHash, trackingHash.toLowerCase());
  }
  return verifyOrderAccessToken(reference, cookie, trackingHash);
}
