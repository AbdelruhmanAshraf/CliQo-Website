import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function vcardValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.test(id)) return new Response("غير متاح", { status: 404 });
  const { rows } = await getDb().query<{
    display_name: string; contact_name: string; contact_phone: string;
    contact_email: string; contact_website: string;
  }>(`select p.display_name, p.contact_name, p.contact_phone, p.contact_email, p.contact_website
      from public.smart_items i
      join public.product_skus s on s.id = i.sku_id
      join public.merchant_pages p on p.id = i.landing_page_id and p.owner_user_id = i.owner_user_id
      where i.public_id = $1::uuid and i.state = 'claimed' and i.owner_user_id is not null
        and s.options ->> 'face' = 'all-in-one' and p.is_published and p.show_save_contact
        and (p.contact_phone <> '' or p.contact_email <> '')
      limit 1`, [id]);
  const page = rows[0];
  if (!page) return new Response("غير متاح", { status: 404 });
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vcardValue(page.contact_name || page.display_name)}`];
  if (page.display_name) lines.push(`ORG:${vcardValue(page.display_name)}`);
  if (page.contact_phone) lines.push(`TEL;TYPE=WORK:${vcardValue(page.contact_phone)}`);
  if (page.contact_email) lines.push(`EMAIL;TYPE=INTERNET:${vcardValue(page.contact_email)}`);
  if (page.contact_website) lines.push(`URL:${vcardValue(page.contact_website)}`);
  lines.push("END:VCARD");
  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cliqo-contact.vcf"',
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
