import { readFile } from "node:fs/promises";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import sharp from "sharp";
import { requireStaff } from "@/lib/admin";
import { activationCodeForPrint, activationHash, engravingId } from "@/lib/print-piece-identity";
import { createImagePdf, jpegPage, makeActivationCardSvg } from "@/lib/factory-pdf";
import {
  createSmartItemBackSvg, createSmartItemPrintPng, createSmartItemPrintSvg,
  getPrintTemplate, loadPrintTemplate,
} from "@/lib/qr-print-layout";
import { createSmartItemQrSvg, getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FactoryZipRow = {
  id: string; sku_id: string; public_id: string; family_key: string; sku_code: string;
  display_name: string; face: string; variant: string; design: string;
  token_hash: string | null; print_nonce: string | null; consumed_at: string | null;
};

const noStore = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  await requireStaff(["owner"]);
  const target = getSmartItemQrTarget();
  if (!target || target.preview) return new Response("نطاق الطباعة الإنتاجي غير مضبوط.", { status: 503, headers: noStore });

  const [itemsResult, skuResult] = await Promise.all([
    getDb().query<FactoryZipRow>(`
      select i.id::text,i.sku_id::text,i.public_id::text,f.family_key,s.sku_code,s.display_name,
        coalesce(s.options->>'face','') as face,coalesce(s.options->>'variant','') as variant,
        coalesce(s.options->>'design','') as design,t.token_hash,t.print_nonce::text,t.consumed_at::text
      from public.smart_items i
      join public.product_skus s on s.id=i.sku_id
      join public.product_families f on f.id=s.product_family_id
      left join public.smart_item_activation_tokens t on t.smart_item_id=i.id
      where not s.checkout_test and f.family_key in ('stand','coaster') and s.state <> 'paused'
        and not (s.options @> '{"face":"review","variant":"شفاف"}'::jsonb)
        and i.state='ready' and i.owner_user_id is null and i.order_line_id is null
        and i.manual_handoff_reference is null
      order by f.family_key,s.sku_code,i.public_id`),
    getDb().query<{ family_key: string; sku_count: number }>(`
      select f.family_key,count(*)::int as sku_count from public.product_skus s
      join public.product_families f on f.id=s.product_family_id
      where not s.checkout_test and f.family_key in ('stand','coaster') and s.state <> 'paused'
        and not (s.options @> '{"face":"review","variant":"شفاف"}'::jsonb)
      group by f.family_key`),
  ]);
  const rows = itemsResult.rows;
  const expected = new Map(skuResult.rows.map((row) => [row.family_key, row.sku_count]));
  const stands = rows.filter((row) => row.family_key === "stand");
  const coasters = rows.filter((row) => row.family_key === "coaster");
  if (!stands.length || !coasters.length || stands.length !== expected.get("stand")
      || coasters.length !== expected.get("coaster")
      || new Set(rows.map((row) => row.sku_id)).size !== rows.length) {
    return new Response("يلزم وجود قطعة واحدة جاهزة لكل صنف حالي من الستاند والكوستر.", { status: 409, headers: noStore });
  }

  const missingCodes = rows.filter((row) => row.print_nonce === null || !row.token_hash || row.consumed_at !== null);
  if (missingCodes.length) return new Response("بعض القطع لا تملك كود تفعيل صالحًا.", { status: 409, headers: noStore });

  const arabicFont = await readFile(path.join(process.cwd(), "Fonts", "forma-djr-arabic-deck-medium.otf"));
  const arabicFontBase64 = arabicFont.toString("base64");
  const templateCache = new Map<string, Awaited<ReturnType<typeof loadPrintTemplate>>>();
  const files: Record<string, Uint8Array> = {};
  const pdfPages = [];
  const manifest = [["الرقم", "النوع", "المنتج", "SKU", "ID المحفور", "ID الكامل", "رابط QR/NFC", "كود التفعيل"]];
  const activationLines = ["SKU\tPRODUCT\tSHORT_ID\tPUBLIC_ID\tACTIVATION_CODE"];

  for (const [index, row] of rows.entries()) {
    const activationCode = activationCodeForPrint(row.public_id, Number(row.print_nonce));
    if (row.token_hash !== activationHash(activationCode)) {
      return new Response("كود التفعيل لا يطابق سجل القطعة؛ لم يتم إنشاء الملف.", { status: 409, headers: noStore });
    }
    const template = getPrintTemplate(row.family_key, row.face, row.variant, row.design);
    if (!template) return new Response(`قالب الطباعة غير مربوط للصنف ${row.sku_code}.`, { status: 409, headers: noStore });
    const templateKey = JSON.stringify(template);
    let loaded = templateCache.get(templateKey);
    if (!loaded) { loaded = await loadPrintTemplate(template); templateCache.set(templateKey, loaded); }

    const shortId = engravingId(row.public_id);
    const folder = `${String(index + 1).padStart(2, "0")}-${shortId}`;
    const frontSvg = await createSmartItemPrintSvg(row.public_id, target.origin, row.face, loaded, undefined, shortId);
    const frontPng = await createSmartItemPrintPng(frontSvg, loaded);
    const backSvg = createSmartItemBackSvg(shortId, loaded);
    const backPng = await createSmartItemPrintPng(backSvg, loaded);
    const qrSvg = await createSmartItemQrSvg(row.public_id, target.origin, row.face, template.qr.style === "square" ? "square" : undefined);
    const cardSvg = await makeActivationCardSvg({
      activationCode, shortId, publicId: row.public_id, productName: row.display_name,
      skuCode: row.sku_code, arabicFontBase64,
    });
    const cardPng = await sharp(Buffer.from(cardSvg), { density: 300 }).png().toBuffer();
    const pieceUrl = `${target.origin}/s/${row.public_id}`;
    const dims = {
      widthMm: template.widthMm ?? loaded.width * 25.4 / 300,
      heightMm: template.heightMm ?? loaded.height * 25.4 / 300,
    };

    files[`${folder}/01-front-with-qr.svg`] = strToU8(frontSvg);
    files[`${folder}/01-front-with-qr.png`] = frontPng;
    files[`${folder}/02-back-engrave-id.svg`] = strToU8(backSvg);
    files[`${folder}/02-back-engrave-id.png`] = backPng;
    files[`${folder}/03-qr.svg`] = strToU8(qrSvg);
    files[`${folder}/04-activation-card.svg`] = strToU8(cardSvg);
    files[`${folder}/04-activation-card.png`] = cardPng;
    files[`${folder}/piece-data.txt`] = strToU8([
      `المنتج: ${row.display_name}`,
      `SKU: ${row.sku_code}`,
      `ID المحفور: ${shortId}`,
      `ID الكامل: ${row.public_id}`,
      `رابط QR وNFC: ${pieceUrl}`,
      `كود التفعيل الخاص: ${activationCode}`,
      "بطاقة التفعيل داخل العبوة فقط؛ لا يوضع الكود على المنتج أو QR أو NFC.",
    ].join("\n") + "\n");

    pdfPages.push(await jpegPage(frontPng, dims.widthMm, dims.heightMm));
    pdfPages.push(await jpegPage(backPng, dims.widthMm, dims.heightMm));
    pdfPages.push(await jpegPage(cardPng, 85.6, 54));
    manifest.push([String(index + 1), row.family_key, row.display_name, row.sku_code, shortId, row.public_id, pieceUrl, activationCode]);
    activationLines.push([row.sku_code, row.display_name, shortId, row.public_id, activationCode].join("\t"));
  }

  files["manifest.csv"] = strToU8("\uFEFF" + manifest
    .map((record) => record.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\r\n") + "\r\n");
  files["activation-codes.tsv"] = strToU8(activationLines.join("\r\n") + "\r\n");
  files["README-AR.txt"] = strToU8(
    `ملف المصنع الخاص — ${stands.length} ستاند + ${coasters.length} كوستر.\n` +
    "لكل قطعة: صورة الوجه بالـQR وID، صورة الظهر برقم الحفر، QR منفصل، وبطاقة تفعيل منفصلة.\n" +
    "Factory-Prints.pdf: لكل قطعة صفحات الوجه والظهر وبطاقة التفعيل بمقاس الطباعة.\n" +
    "أكواد التفعيل سرية: اطبع البطاقة وضعها داخل عبوة القطعة المقابلة. لا تحفر الكود ولا تضفه إلى QR أو NFC.\n",
  );
  files["Factory-Prints.pdf"] = createImagePdf(pdfPages);

  const archive = zipSync(files, { level: 6 });
  return new Response(archive, {
    headers: {
      ...noStore,
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="CliQo-Factory-Stands-Coasters.zip"',
      "Content-Length": String(archive.byteLength),
    },
  });
}
