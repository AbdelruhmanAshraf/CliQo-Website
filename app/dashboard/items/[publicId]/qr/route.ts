import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPrintTemplate } from "@/lib/qr-print-layout";
import { buildSmartItemQr } from "@/lib/smart-item-qr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: RouteContext<"/dashboard/items/[publicId]/qr">) {
  const { publicId } = await context.params;
  if (!uuid.test(publicId)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/dashboard/items/${publicId}`)}`);

  // RLS limits this lookup to the signed-in item's owner.
  const { data: item, error } = await supabase.from("smart_items")
    .select("public_id,product_skus(options,product_families(family_key))")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error || !item) notFound();

  const sku = item.product_skus as unknown as {
    options?: Record<string, string>; product_families?: { family_key: string } | null;
  } | null;
  const face = sku?.options?.face ?? "all-in-one";
  const template = getPrintTemplate(sku?.product_families?.family_key ?? "", face,
    sku?.options?.variant ?? "", sku?.options?.design ?? "");
  return buildSmartItemQr(item.public_id, face, new URL(request.url).searchParams.get("preview") === "1",
    template?.qr.style);
}
