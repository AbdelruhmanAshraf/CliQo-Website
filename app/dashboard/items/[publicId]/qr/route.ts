import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildSmartItemQr } from "@/lib/smart-item-qr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext<"/dashboard/items/[publicId]/qr">) {
  const { publicId } = await context.params;
  if (!uuid.test(publicId)) notFound();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/dashboard/items/${publicId}`)}`);

  // RLS limits this lookup to the signed-in item's owner.
  const { data: item, error } = await supabase.from("smart_items")
    .select("public_id")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error || !item) notFound();

  return buildSmartItemQr(item.public_id);
}
