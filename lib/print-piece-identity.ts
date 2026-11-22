import "server-only";
import { createHash, createHmac } from "node:crypto";

export function engravingId(publicId: string) {
  return publicId.replaceAll("-", "").slice(0, 12).toUpperCase();
}

export function activationCodeForPrint(publicId: string, nonce = 0) {
  return activationCodeForPrintAttempt(publicId, nonce);
}

export function activationCodeForPrintAttempt(publicId: string, nonce: number) {
  const secret = process.env.CLIQO_ACTIVATION_MASTER_KEY;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("مفتاح أكواد التفعيل للدفعات غير مضبوط.");
  const digest = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`cliqo-activation:v2:${publicId}:${nonce}`)
    .digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function legacyActivationCodeForPrint(publicId: string) {
  const secret = process.env.CLIQO_ACTIVATION_MASTER_KEY;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("مفتاح أكواد التفعيل للدفعات غير مضبوط.");
  return createHmac("sha256", Buffer.from(secret, "hex")).update(`cliqo-activation:${publicId}`).digest("hex").slice(0, 16);
}

export function activationHash(code: string) {
  return createHash("sha256").update(code).digest("hex");
}
