import assert from "node:assert/strict";
import test from "node:test";
import { activationCodeForPrint, activationHash, legacyActivationCodeForPrint } from "../lib/print-piece-identity";

test("new engraving codes are six numeric digits and reproduce from the stored nonce", () => {
  process.env.CLIQO_ACTIVATION_MASTER_KEY = "a".repeat(64);
  const publicId = "6c1f30e2-6387-4eb3-b0e4-10d871ccf1b2";
  const code = activationCodeForPrint(publicId, 14);
  assert.match(code, /^\d{6}$/);
  assert.equal(activationCodeForPrint(publicId, 14), code);
  assert.match(activationHash(code), /^[a-f0-9]{64}$/);
  assert.match(legacyActivationCodeForPrint(publicId), /^[a-f0-9]{16}$/);
});
