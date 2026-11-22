import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { createPrintArtworkSvg, createSmartItemPrintSvg, getPrintTemplate, loadPrintArtwork, loadPrintTemplate } from "@/lib/qr-print-layout";
import { activationCodeForPrint, activationHash, engravingId } from "@/lib/print-piece-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  if (!uuid.test(publicId)) notFound();
  await requireStaff(["owner"]);
  const target = getSmartItemQrTarget();
  if (!target) return new Response("عنوان QR غير مضبوط.", { status: 503 });
  const { rows } = await getDb().query<{
    face: string; variant: string; design: string; family: string; token_hash: string | null; print_nonce: string | null;
  }>(`
    select coalesce(s.options->>'face','') as face,coalesce(s.options->>'variant','') as variant,
      coalesce(s.options->>'design','') as design,f.family_key as family,
      t.token_hash,t.print_nonce
    from public.smart_items i join public.product_skus s on s.id=i.sku_id
    join public.product_families f on f.id=s.product_family_id
    left join public.smart_item_activation_tokens t on t.smart_item_id=i.id
    where i.public_id=$1 and i.state <> 'disabled'`, [publicId]);
  const item = rows[0];
  if (!item) notFound();
  const template = getPrintTemplate(item.family, item.face, item.variant, item.design);
  if (!template) return new Response("لم يُربط قالب طباعة بهذا التصميم بعد.", { status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (item.print_nonce !== null) {
    const activationCode = activationCodeForPrint(publicId, Number(item.print_nonce));
    if (item.token_hash !== activationHash(activationCode)) return new Response("كود القطعة غير مطابق لسجل التفعيل. راجع سجل المخزون قبل الطباعة.", { status: 409 });
  }
  const params = new URL(request.url).searchParams;
  const front = params.get("side") === "front";
  if (front && !template.frontFile) notFound();
  const svg = front && template.frontFile
    ? createPrintArtworkSvg(await loadPrintArtwork(template.frontFile, template.widthMm ?? 0, template.heightMm ?? 0))
    : await createSmartItemPrintSvg(publicId, target.origin, item.face, await loadPrintTemplate(template), undefined, engravingId(publicId));
  return new Response(svg, { headers: {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Content-Disposition": `${params.get("preview") === "1" ? "inline" : "attachment"}; filename="${target.preview ? "TEST-" : ""}CLIQO-PRINT-${publicId}${front ? "-FRONT" : ""}.svg"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
