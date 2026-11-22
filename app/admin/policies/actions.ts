"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { isStorePolicyKey } from "@/lib/store-policies";

const maxLength = 20000;
const minimumPublishedLength = 300;
const fail = (code: string, policy?: string): never => {
  const suffix = policy ? `&policy=${encodeURIComponent(policy)}` : "";
  redirect(`/admin/policies?error=${encodeURIComponent(code)}${suffix}`);
};
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const hasTemporaryMarker = (value: string) =>
  ["[todo]", "{{", "}}", "lorem ipsum", "tbd", "اكتب هنا", "أدخل هنا", "ضع هنا"]
    .some((marker) => value.toLocaleLowerCase().includes(marker.toLocaleLowerCase()));

export async function updateStorePolicy(formData: FormData) {
  const { staff } = await requireStaff(["owner"]);
  const policyKey = text(formData, "policy_key");
  const intent = text(formData, "intent");
  const reason = text(formData, "change_reason");
  const arabicBody = text(formData, "arabic_body");
  const englishBody = text(formData, "english_body");

  if (!isStorePolicyKey(policyKey)) fail("key");
  if (reason.length < 3 || reason.length > 500) fail("reason", policyKey);
  if (arabicBody.length > maxLength || englishBody.length > maxLength) fail("length", policyKey);
  if (!["save", "publish", "unpublish"].includes(intent)) fail("key", policyKey);
  if (intent === "publish") {
    if (formData.get("confirm_review") !== "on") fail("review", policyKey);
    if ([arabicBody, englishBody].some((body) => body.length < minimumPublishedLength || hasTemporaryMarker(body))) {
      fail("incomplete", policyKey);
    }
  }
  if (intent === "unpublish" && formData.get("confirm_unpublish") !== "on") fail("unpublish", policyKey);

  const client = await getDb().connect();
  let errorCode: string | null = null;
  let successCode = "saved";
  try {
    await client.query("begin");
    const before = await client.query(
      `select locale,draft_body,published_body,draft_updated_at,published_at
       from app_private.store_policies where policy_key=$1 order by locale for update`,
      [policyKey],
    );
    if (before.rowCount !== 2) throw new Error("Expected Arabic and English policy rows.");

    if (intent === "unpublish") {
      await client.query(
        `update app_private.store_policies
         set draft_body=case locale when 'ar' then $2 else $3 end,
             draft_updated_by=$4, draft_updated_at=now(),
             published_body=null, published_by=null, published_at=null
         where policy_key=$1`,
        [policyKey, arabicBody, englishBody, staff.user_id],
      );
      successCode = "unpublished";
    } else if (intent === "publish") {
      await client.query(
        `insert into app_private.store_policies
           (policy_key,locale,draft_body,published_body,draft_updated_by,draft_updated_at,published_by,published_at)
         values ($1,'ar',$2,$2,$4,now(),$4,now()),($1,'en',$3,$3,$4,now(),$4,now())
         on conflict (policy_key,locale) do update set
           draft_body=excluded.draft_body, published_body=excluded.published_body,
           draft_updated_by=excluded.draft_updated_by, draft_updated_at=now(),
           published_by=excluded.published_by, published_at=now()`,
        [policyKey, arabicBody, englishBody, staff.user_id],
      );
      successCode = "published";
    } else {
      await client.query(
        `insert into app_private.store_policies(policy_key,locale,draft_body,draft_updated_by,draft_updated_at)
         values ($1,'ar',$2,$4,now()),($1,'en',$3,$4,now())
         on conflict (policy_key,locale) do update set
           draft_body=excluded.draft_body, draft_updated_by=excluded.draft_updated_by, draft_updated_at=now()`,
        [policyKey, arabicBody, englishBody, staff.user_id],
      );
    }

    const after = await client.query(
      `select locale,draft_body,published_body,draft_updated_at,published_at
       from app_private.store_policies where policy_key=$1 order by locale`,
      [policyKey],
    );
    await client.query(
      `insert into app_private.store_policy_audit(policy_key,changed_by,previous_state,next_state,change_reason)
       values($1,$2,$3::jsonb,$4::jsonb,$5)`,
      [policyKey, staff.user_id, JSON.stringify(before.rows), JSON.stringify(after.rows), reason],
    );
    await client.query("commit");
  } catch {
    await client.query("rollback").catch(() => undefined);
    errorCode = "save";
  } finally {
    client.release();
  }

  if (errorCode) fail(errorCode, policyKey);
  revalidatePath("/admin/policies");
  revalidatePath("/admin/settings");
  revalidatePath("/");
  for (const key of ["privacy", "terms", "shipping", "returns"]) revalidatePath(`/policies/${key}`);
  redirect(`/admin/policies?saved=${successCode}&policy=${encodeURIComponent(policyKey)}`);
}
