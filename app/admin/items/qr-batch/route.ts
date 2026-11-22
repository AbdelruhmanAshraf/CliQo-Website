import { strToU8, zipSync } from "fflate";
import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { createSmartItemQrSvg, getSmartItemQrTarget } from "@/lib/smart-item-qr";
import { createPrintArtworkSvg, createSmartItemPrintSvg, createSmartItemPrintPng, createSmartItemBackSvg, getPrintTemplate, loadPrintArtwork, loadPrintTemplate, type LoadedPrintArtwork, type LoadedPrintTemplate } from "@/lib/qr-print-layout";
import { activationCodeForPrint, activationHash, engravingId } from "@/lib/print-piece-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const batchSize = 200;

function csv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  await requireStaff(["owner"]);
  const target = getSmartItemQrTarget();
  if (!target) return new Response("اضبط NEXT_PUBLIC_SITE_URL على نطاق الموقع أو عنوان التجربة المحلية.", {
    status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
  const origin = target.origin;
  const params = new URL(request.url).searchParams;
  const skuId = params.get("sku");
  const after = params.get("after");
  const batchId = params.get("batch");
  if ((skuId && !uuid.test(skuId)) || (after && !uuid.test(after)) || (batchId && !uuid.test(batchId))
    || (batchId && (skuId || after))) return new Response("معرف أو فلاتر غير صالحة", { status: 400 });

  const { rows } = await getDb().query<{
    public_id: string; sku_code: string; family_key: string; face: string; variant: string; design: string; state: string;
    token_hash: string | null; print_nonce: string | null;
  }>(`select i.public_id::text, i.state, s.sku_code, f.family_key, t.token_hash,
      t.print_nonce,
      coalesce(s.options ->> 'face', '') as face,
      coalesce(s.options ->> 'variant', '') as variant,
      coalesce(s.options ->> 'design', '') as design
    from public.smart_items i
    join public.product_skus s on s.id = i.sku_id
    join public.product_families f on f.id = s.product_family_id
    left join public.smart_item_activation_tokens t on t.smart_item_id=i.id
    where not s.checkout_test and (($3::uuid is not null and i.production_batch_id=$3::uuid) or
      ($3::uuid is null and (i.state = 'ready' or (i.state = 'unassigned' and i.production_planned_at is not null))
      and i.owner_user_id is null))
      and f.family_key in ('stand', 'coaster', 'pvc-card')
      and ($1::uuid is null or i.sku_id = $1::uuid)
      and ($2::uuid is null or i.public_id > $2::uuid)
    order by i.public_id
    limit 201`, [skuId || null, after || null, batchId || null]);
  if (batchId && (rows.length > 50 || rows.some((row) => row.state === "disabled"))) {
    return new Response("تحتوي الدفعة على قطع موقوفة أو تجاوزت حد التصدير. راجع سجل القطع قبل الطباعة.", { status: 409 });
  }
  const selected = rows.slice(0, batchSize);
  if (!selected.length) return new Response("لا توجد قطع جاهزة في هذه الدفعة.", {
    status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

  const files: Record<string, Uint8Array> = {};
  const hasTwoSidedCardArtwork = selected.some((row) => {
    const template = getPrintTemplate(row.family_key, row.face, row.variant, row.design);
    return row.family_key === "pvc-card" && Boolean(template?.frontFile);
  });
  const hasPrintTemplate = selected.some((row) => Boolean(getPrintTemplate(row.family_key, row.face, row.variant, row.design)));
  const manifest = [["رقم القطعة القصير", "كود الصنف", "العائلة", "الاستخدام", "النسخة", "التصميم", "المعرف الكامل", "رابط QR وNFC", "معرف الدفعة", "حالة القطعة"]];
  const loadedTemplates = new Map<string, LoadedPrintTemplate>();
  const loadedArtworks = new Map<string, LoadedPrintArtwork>();
  for (const [index, row] of selected.entries()) {
    const shortId = engravingId(row.public_id);
    if (row.print_nonce !== null) {
      const candidate = activationCodeForPrint(row.public_id, Number(row.print_nonce));
      if (row.token_hash !== activationHash(candidate)) return new Response("كود التفعيل لا يطابق سجل القطعة. راجع المخزون قبل الطباعة.", { status: 409 });
    }
    const folder = `${String(index + 1).padStart(2, "0")}-${shortId}`;
    const filename = `${target.preview ? "TEST-" : ""}CLIQO-QR-${row.public_id}.svg`;
    const template = getPrintTemplate(row.family_key, row.face, row.variant, row.design);
    if (!batchId) files[`qr/${filename}`] = strToU8(await createSmartItemQrSvg(row.public_id, origin, row.face,
      template?.qr.style));
    let printFilename = "";
    let pngFilename = "";
    if (batchId && !template) return new Response("قالب الدفعة غير موجود. لم يتم تصدير دفعة ناقصة.", { status: 409 });
    if (template) {
      const templateKey = JSON.stringify(template);
      let loaded = loadedTemplates.get(templateKey);
      if (!loaded) { loaded = await loadPrintTemplate(template); loadedTemplates.set(templateKey, loaded); }
      printFilename = `${target.preview ? "TEST-" : ""}CLIQO-PRINT-${row.public_id}.svg`;
      const svg = await createSmartItemPrintSvg(row.public_id, origin, row.face, loaded, undefined, shortId);
      if (!batchId) files[`print/${printFilename}`] = strToU8(svg);
      if (batchId) {
        if (template.frontFile) {
          const artworkKey = JSON.stringify([template.frontFile, template.widthMm, template.heightMm]);
          let front = loadedArtworks.get(artworkKey);
          if (!front) {
            front = await loadPrintArtwork(template.frontFile, template.widthMm ?? 0, template.heightMm ?? 0);
            loadedArtworks.set(artworkKey, front);
          }
          const frontSvg = createPrintArtworkSvg(front);
          files[`${folder}/الوجه.svg`] = strToU8(frontSvg);
          files[`${folder}/الوجه.png`] = await createSmartItemPrintPng(frontSvg, front);
          files[`${folder}/الظهر-QR-ID.svg`] = strToU8(svg);
          files[`${folder}/الظهر-QR-ID.png`] = await createSmartItemPrintPng(svg, loaded);
        } else {
          files[`${folder}/الوجه.svg`] = strToU8(svg);
          files[`${folder}/الوجه.png`] = await createSmartItemPrintPng(svg, loaded);
          files[`${folder}/الظهر-حفر-ID.svg`] = strToU8(createSmartItemBackSvg(shortId, loaded));
        }
      }
    }
    const publicUrl = `${origin}/s/${row.public_id}`;
    if (batchId) files[`${folder}/بيانات-القطعة.txt`] = strToU8(
      `رقم القطعة: ${shortId}\nالمعرف الكامل: ${row.public_id}\nرابط QR وNFC: ${publicUrl}\n\nهذا ملف المصنع. كود التفعيل الخاص لا يظهر هنا؛ يظهر للمالك بعد تسجيل استلام القطعة.\n`);
    manifest.push([shortId, row.sku_code, row.family_key, row.face, row.variant, row.design, row.public_id,
      publicUrl, batchId ?? "", row.state]);
  }
  files["manifest.csv"] = strToU8("\uFEFF" + manifest.map((record) => record.map(csv).join(",")).join("\r\n") + "\r\n");
  const nextAfter = rows.length > batchSize ? selected[selected.length - 1].public_id : null;
  if (nextAfter) {
    const next = new URL(`${origin}/admin/items/qr-batch`);
    if (skuId) next.searchParams.set("sku", skuId);
    next.searchParams.set("after", nextAfter);
    files["NEXT-BATCH.txt"] = strToU8(`More ready items exist. Download the next batch while signed in as owner:\n${next}\n`);
  }
  const sideInstructions = hasTwoSidedCardArtwork
    ? "للكروت: الوجه.png/svg هو التصميم الأمامي، والظهر-QR-ID.png/svg هو التصميم الخلفي وفيه QR ورقم القطعة القصير.\n"
    : hasPrintTemplate
      ? "كل فولدر في الدفعة يمثل قطعة واحدة: الوجه للطباعة، والظهر-حفر-ID يحتوي الرقم القصير للحفر.\n"
      : "ملفات qr تحتوي QR مستقل لكل قطعة، وملف manifest.csv يربط كل QR بمعرفه ورابطه. قالب التصميم الكامل غير مربوط لهذا الصنف بعد.\n";
  const codeInstructions = "QR وNFC يستخدمان رابط CliQo نفسه. كود التفعيل الخاص لا يدخل ملفات المصنع، ويظهر للمالك بعد تسجيل استلام القطع.\n";
  files["README.txt"] = strToU8(`${target.preview ? "تجربة محلية فقط؛ لا تطبع هذه الأكواد للبيع.\n" : ""}عدد القطع: ${selected.length}\nمعرف الدفعة: ${batchId ?? "تصدير عام للصنف"}\n${sideInstructions}${codeInstructions}ملف manifest.csv يربط كل قطعة ورابطها. راجع التصميم وافحص عينة فعلية بالهاتف قبل الإنتاج.\n`);
  const zip = zipSync(files, { level: 6 });
  return new Response(Buffer.from(zip), { headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${target.preview ? "TEST-" : ""}CLIQO-${batchId ?? "QR-print-batch"}.zip"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    ...(nextAfter ? { "X-Cliqo-Next-After": nextAfter } : {}),
  } });
}
