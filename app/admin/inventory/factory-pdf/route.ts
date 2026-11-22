import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { requireStaff } from "@/lib/admin";
import { activationCodeForPrint, activationHash, engravingId } from "@/lib/print-piece-identity";
import { createImagePdf, jpegPage, makeActivationCardSvg } from "@/lib/factory-pdf";
import { createSmartItemBackSvg, createSmartItemPrintPng, createSmartItemPrintSvg, getPrintTemplate, loadPrintTemplate } from "@/lib/qr-print-layout";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FactoryRow = {
  public_id: string; family_key: string; sku_code: string; display_name: string;
  face: string; variant: string; design: string; token_hash: string | null;
  print_nonce: string | null; consumed_at: string | null;
};

export async function GET() {
  await requireStaff(["owner", "admin"]);
  const target = getSmartItemQrTarget();
  if (!target || target.preview) return new Response("نطاق الطباعة الإنتاجي غير مضبوط.", { status: 503 });

  const { rows } = await getDb().query<FactoryRow>(`
    with available as (
      select i.public_id::text, i.sku_id, f.family_key, s.sku_code, s.display_name,
        coalesce(s.options->>'face','') as face, coalesce(s.options->>'variant','') as variant,
        coalesce(s.options->>'design','') as design, t.token_hash, t.print_nonce, t.consumed_at,
        row_number() over(partition by i.sku_id order by i.created_at, i.public_id) as unit_rank
      from public.smart_items i
      join public.product_skus s on s.id=i.sku_id
      join public.product_families f on f.id=s.product_family_id
      left join public.smart_item_activation_tokens t on t.smart_item_id=i.id
      where not s.checkout_test and f.family_key in ('stand','coaster') and s.state <> 'paused'
        and not (s.options @> '{"face":"review","variant":"شفاف"}'::jsonb)
        and i.state='ready' and i.owner_user_id is null and i.order_line_id is null
        and i.manual_handoff_reference is null
    )
    select public_id,family_key,sku_code,display_name,face,variant,design,token_hash,print_nonce,consumed_at
    from available where unit_rank=1 order by family_key,sku_code,public_id`);

  const expected = await getDb().query<{ family_key: string; count: number }>(`
    select f.family_key,count(*)::int as count from public.product_skus s
    join public.product_families f on f.id=s.product_family_id
    where not s.checkout_test and f.family_key in ('stand','coaster') and s.state <> 'paused'
        and not (s.options @> '{"face":"review","variant":"شفاف"}'::jsonb) group by f.family_key`);
  const expectedCounts = new Map(expected.rows.map((row) => [row.family_key, row.count]));

  const standCount = rows.filter((row) => row.family_key === "stand").length;
  const coasterCount = rows.filter((row) => row.family_key === "coaster").length;
  if (!standCount || !coasterCount || standCount !== expectedCounts.get("stand") || coasterCount !== expectedCounts.get("coaster")) {
    return new Response("لا توجد قطعة جاهزة لكل تصميم. راجع سجل المخزون قبل تنزيل ملف المصنع.", { status: 409 });
  }
  const missingCodes = rows.filter((row) => row.print_nonce === null || !row.token_hash || row.consumed_at !== null);
  if (missingCodes.length) return new Response("بعض القطع ليس لها كود تفعيل صالح محفوظ؛ راجع استلام المخزون قبل تنزيل ملف المصنع.", { status: 409 });

  const arabicFont = await readFile(path.join(process.cwd(), "Fonts", "forma-djr-arabic-deck-medium.otf"));
  const arabicFontBase64 = arabicFont.toString("base64");
  const templateCache = new Map<string, Awaited<ReturnType<typeof loadPrintTemplate>>>();
  const pages = [];
  for (const row of rows) {
    const activationCode = activationCodeForPrint(row.public_id, Number(row.print_nonce));
    if (row.token_hash !== activationHash(activationCode)) return new Response("كود التفعيل لا يطابق سجل القطعة؛ لم يتم إنشاء الملف.", { status: 409 });
    const template = getPrintTemplate(row.family_key, row.face, row.variant, row.design);
    if (!template) return new Response(`قالب الطباعة غير مربوط للصنف ${row.sku_code}.`, { status: 409 });
    const templateKey = JSON.stringify(template);
    let loaded = templateCache.get(templateKey);
    if (!loaded) { loaded = await loadPrintTemplate(template); templateCache.set(templateKey, loaded); }
    const shortId = engravingId(row.public_id);
    const productSvg = await createSmartItemPrintSvg(row.public_id, target.origin, row.face, loaded, undefined, shortId);
    const productPng = await createSmartItemPrintPng(productSvg, loaded);
    const backSvg = createSmartItemBackSvg(shortId, loaded);
    const backPng = await createSmartItemPrintPng(backSvg, loaded);
    const widthMm = template.widthMm ?? loaded.width * 25.4 / 300;
    const heightMm = template.heightMm ?? loaded.height * 25.4 / 300;
    pages.push(await jpegPage(productPng, widthMm, heightMm));
    pages.push(await jpegPage(backPng, widthMm, heightMm));
    const cardSvg = await makeActivationCardSvg({ activationCode, shortId, publicId: row.public_id, productName: row.display_name, skuCode: row.sku_code, arabicFontBase64 });
    const cardPng = await sharp(Buffer.from(cardSvg), { density: 300 }).png().toBuffer();
    pages.push(await jpegPage(cardPng, 85.6, 54));
  }

  const pdf = createImagePdf(pages);
  return new Response(pdf, { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": 'attachment; filename="CliQo-Factory-Stands-Coasters.pdf"',
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
