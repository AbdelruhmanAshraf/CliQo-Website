import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  if (!uuid.test(id) || !uuid.test(linkId)) return new Response("الرابط غير متاح.", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("track_smart_item_click", { p_public_id: id, p_link_id: linkId });
  if (error || typeof data !== "string") return new Response("الرابط غير متاح.", { status: 404 });
  try {
    const destination = new URL(data);
    if (destination.protocol !== "https:") return new Response("الرابط غير متاح.", { status: 404 });
    return new Response(null, {
      status: 307,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return new Response("الرابط غير متاح.", { status: 404 });
  }
}
