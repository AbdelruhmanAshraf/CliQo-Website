import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getSmartItemQrTarget } from "@/lib/smart-item-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const skuId = new URL(request.url).searchParams.get("sku");
  if (skuId && !uuid.test(skuId)) return new Response("SKU غير صالح", { status: 400 });

  const { rows } = await getDb().query<{
    public_id: string; sku_code: string; family_key: string; face: string; variant: string; design: string;
  }>(`select i.public_id::text, s.sku_code, f.family_key,
      coalesce(s.options ->> 'face', '') as face,
      coalesce(s.options ->> 'variant', '') as variant,
      coalesce(s.options ->> 'design', '') as design
    from public.smart_items i
    join public.product_skus s on s.id = i.sku_id
    join public.product_families f on f.id = s.product_family_id
    where not s.checkout_test and (i.state = 'ready' or (i.state = 'unassigned' and i.production_planned_at is not null))
      and i.owner_user_id is null
      and f.family_key in ('stand', 'coaster', 'pvc-card')
      and ($1::uuid is null or i.sku_id = $1::uuid)
    order by s.sku_code, i.created_at, i.public_id
    limit 501`, [skuId || null]);
  if (rows.length > 500) return new Response("الكشف أكبر من 500 قطعة. صدّر كل SKU منفصلًا بإضافة ?sku=معرف_الصنف.", {
    status: 409, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

  const heading = ["sku_code", "family", "face", "variant", "design", "public_id", "public_url", "qr_svg_filename", "admin_qr_download"];
  const records = rows.map((row) => [
    row.sku_code, row.family_key, row.face, row.variant, row.design, row.public_id,
    `${origin}/s/${row.public_id}`, `${target.preview ? "TEST-" : ""}CLIQO-QR-${row.public_id}.svg`,
    `${origin}/admin/items/${row.public_id}/qr`,
  ]);
  const body = "\uFEFF" + [heading, ...records].map((record) => record.map(csv).join(",")).join("\r\n") + "\r\n";
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${target.preview ? "TEST-" : ""}CLIQO-print-manifest.csv"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
