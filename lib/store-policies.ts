import "server-only";
import { getDb } from "@/lib/db";
import type { Locale } from "@/i18n/config";

export const STORE_POLICIES = [
  { key: "privacy", title: "سياسة الخصوصية" },
  { key: "terms", title: "شروط البيع والاستخدام" },
  { key: "shipping", title: "سياسة الشحن والتوصيل" },
  { key: "returns", title: "سياسة الاستبدال والاسترجاع" },
] as const;

export type StorePolicyKey = (typeof STORE_POLICIES)[number]["key"];

export function isStorePolicyKey(value: string): value is StorePolicyKey {
  return STORE_POLICIES.some((policy) => policy.key === value);
}

export async function getPublishedPolicyKeys(locale: Locale): Promise<StorePolicyKey[]> {
  try {
    const result = await getDb().query<{ policy_key: StorePolicyKey }>(
      `select policy_key
       from app_private.store_policies
       where locale=$1 and published_body is not null
       order by policy_key`,
      [locale],
    );
    const published = new Set(result.rows.map((row) => row.policy_key));
    return published.size === STORE_POLICIES.length
      ? STORE_POLICIES.map((policy) => policy.key)
      : [];
  } catch {
    return [];
  }
}
