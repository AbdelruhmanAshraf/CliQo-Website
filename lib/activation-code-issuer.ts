import "server-only";
import type { PoolClient } from "pg";
import { activationCodeForPrintAttempt, activationHash } from "./print-piece-identity";

export async function issueActivationCode(client: PoolClient, publicId: string) {
  for (let nonce = 0; nonce < 1_000_000; nonce += 1) {
    const code = activationCodeForPrintAttempt(publicId, nonce);
    const tokenHash = activationHash(code);
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`cliqo-activation:${tokenHash}`]);
    const existing = await client.query<{ used: boolean }>(
      "select exists(select 1 from public.smart_item_activation_tokens where token_hash=$1) as used",
      [tokenHash],
    );
    if (!existing.rows[0]?.used) return { code, tokenHash, nonce };
  }
  throw new Error("تعذر إصدار كود تفعيل فريد للقطعة.");
}
