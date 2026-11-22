import { strToU8, zipSync } from "fflate";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { engravingId } from "@/lib/print-piece-identity";
import {
  createPrintArtworkSvg, createSmartItemBackSvg, createSmartItemPrintPng, createSmartItemPrintSvg,
  getPrintTemplate, loadPrintArtwork, loadPrintTemplate,
} from "@/lib/qr-print-layout";
import { createSmartItemQrSvg, getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { getStorageAdmin } from "@/lib/supabase/storage-admin";
import { getCopy } from "@/i18n/server";

export const runtime = "nodejs";

const operations = ["owner", "admin", "operations", "fulfillment"] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

type OrderLine = {
  reference: string; order_state: string; payment_method: string; payment_state: string;
  sku_code: string; name: string; quantity: number; family: string; face: string; variant: string;
  tier: string; business_name: string | null; destination: string | null; brief: string | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  await requireStaff(operations);
  const tr = await getCopy();
  const { orderId } = await params;
  const lineId = new URL(request.url).searchParams.get("line") ?? "";
  const reply = (message: string, status: number) => new Response(tr(message), { status, headers: noStore });
  if (!uuid.test(orderId) || !uuid.test(lineId)) return reply("بند الطلب غير موجود.", 404);

  const db = getDb();
  const { rows: [line] } = await db.query<OrderLine>(`
    select o.order_reference as reference,o.state::text as order_state,o.payment_method::text,o.payment_state::text,
      l.sku_code_snapshot as sku_code,l.product_name_snapshot as name,l.quantity,f.family_key as family,
      l.options_snapshot->>'face' as face,l.options_snapshot->>'variant' as variant,
      coalesce(l.options_snapshot->>'design','T0') as tier,l.design_business_name as business_name,
      l.design_request_url as destination,l.design_brief as brief
    from public.orders o join public.order_lines l on l.order_id=o.id
    join public.product_skus s on s.id=l.sku_id join public.product_families f on f.id=s.product_family_id
    where o.id=$1 and l.id=$2 and f.has_nfc_qr`, [orderId, lineId]);
  if (!line || !["T0", "T1", "T2"].includes(line.tier)) return reply("بند الطلب غير موجود.", 404);
  if (["cancelled", "returned"].includes(line.order_state)) return reply("الطلب خارج دورة التجهيز.", 409);

  const designRequest = line.tier === "T2";
  const isCustom = line.tier !== "T0";
  if (!designRequest && (line.order_state === "new" || (line.payment_method === "card" && line.payment_state !== "paid"))) {
    return reply("أكّد الطلب قبل تنزيل ملفات المصنع.", 409);
  }
  const attachments = isCustom ? (await db.query<{ storage_path: string; original_name: string }>(
    "select storage_path,original_name from public.order_files where order_id=$1 and order_line_id=$2 order by created_at,id",
    [orderId, lineId],
  )).rows : [];
  if (line.tier === "T1" && !attachments.length) return reply("استنى رفع ملف تصميم العميل الأول.", 409);

  const units = designRequest ? [] : (await db.query<{ public_id: string }>(
    "select public_id::text from public.smart_items where order_line_id=$1 and state<>'disabled' order by created_at,id",
    [lineId],
  )).rows;
  if (!designRequest && units.length !== line.quantity) return reply("المخزون لم يخصص كل قطع هذا البند.", 409);

  const target = units.length ? getSmartItemQrTarget() : null;
  if (units.length && !target) return reply("عنوان QR غير مضبوط.", 503);
  const template = getPrintTemplate(line.family, line.face, line.variant, "T0");
  if (line.tier === "T0" && !template) return reply("لم يُربط قالب طباعة بهذا التصميم بعد.", 409);

  const files: Record<string, Uint8Array> = {};
  files["order.txt"] = strToU8([
    `CliQo · ${line.reference}`,
    `SKU: ${line.sku_code}`,
    `المنتج / Product: ${line.name}`,
    `الاستخدام / Use: ${line.face ?? "—"}`,
    `الكمية / Quantity: ${line.quantity}`,
    ...(template?.widthMm && template.heightMm ? [`مقاس القالب / Template size: ${template.widthMm} × ${template.heightMm} mm`] : []),
    `مسار التصميم / Design: ${line.tier}`,
    ...(isCustom ? [
      `النشاط / Business: ${line.business_name ?? "—"}`,
      `الوجهة المطلوبة / Requested destination: ${line.destination ?? "—"}`,
      `تفاصيل التصميم / Brief: ${line.brief ?? "—"}`,
    ] : []),
    ...(designRequest
      ? ["Design brief and originals for preparing a proof. Keep a QR placement in the layout and get the proof approved before printing."]
      : isCustom
        ? ["Original customer artwork and assigned QR files. Confirm the proof, dimensions and QR placement before printing."]
        : ["These are the exact units assigned to this order. Verify the printed ID and QR before handoff."]),
    ...(target?.preview || line.payment_method === "test" ? ["TEST ONLY / ملفات للاختبار"] : []),
  ].join("\n"));

  if (attachments.length) {
    const storage = getStorageAdmin().storage.from("order-designs");
    for (const [index, file] of attachments.entries()) {
      const result = await storage.download(file.storage_path);
      if (result.error || !result.data) return reply("تعذر تنزيل أحد ملفات التصميم. جرّب مرة ثانية.", 502);
      const safeName = file.original_name.replace(/[^\p{L}\p{N}. _()-]/gu, "_").replace(/^\.+/, "").slice(0, 130) || "artwork";
      files[`originals/${index + 1}-${safeName}`] = new Uint8Array(await result.data.arrayBuffer());
    }
  }

  if (target) {
    const manifest = ["id\tprinted_id\tqr_nfc_url"];
    const readyTemplate = !isCustom && template ? await loadPrintTemplate(template) : null;
    const frontArtwork = readyTemplate?.frontFile
      ? await loadPrintArtwork(readyTemplate.frontFile, readyTemplate.widthMm ?? 0, readyTemplate.heightMm ?? 0) : null;
    for (const { public_id: id } of units) {
      const shortId = engravingId(id);
      const qr = await createSmartItemQrSvg(id, target.origin, line.face, template?.qr.style, template?.qr.largerIcon);
      files[`units/${shortId}/qr.svg`] = strToU8(qr);
      if (readyTemplate) {
        const artwork = await createSmartItemPrintSvg(id, target.origin, line.face, readyTemplate, qr, shortId);
        const front = frontArtwork ? createPrintArtworkSvg(frontArtwork) : artwork;
        const back = frontArtwork ? artwork : createSmartItemBackSvg(shortId, readyTemplate);
        const [frontPng, backPng] = await Promise.all([
          createSmartItemPrintPng(front, frontArtwork ?? readyTemplate),
          createSmartItemPrintPng(back, readyTemplate),
        ]);
        files[`units/${shortId}/front.svg`] = strToU8(front);
        files[`units/${shortId}/front.png`] = frontPng;
        files[`units/${shortId}/back.svg`] = strToU8(back);
        files[`units/${shortId}/back.png`] = backPng;
      }
      manifest.push(`${id}\t${shortId}\t${target.origin}/s/${id}`);
    }
    files["units.tsv"] = strToU8(manifest.join("\n"));
  }

  const archive = zipSync(files, { level: 1 });
  const prefix = target?.preview || line.payment_method === "test" ? "TEST-" : "";
  const kind = designRequest ? "design" : "production";
  return new Response(Buffer.from(archive), {
    headers: {
      ...noStore, "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${prefix}CliQo-${line.reference}-${kind}-${lineId.slice(0, 8)}.zip"`,
    },
  });
}
