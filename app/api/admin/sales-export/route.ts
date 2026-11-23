import { requireStaff } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { createXlsxWorkbook, type WorkbookCell } from "@/lib/xlsx";
import { orderStatusLabels, paymentStateLabels } from "@/app/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateFilter = "( $1::int is null or created_at >= current_date - ($1::int - 1) )";
const amount = (minor: number) => Math.round(minor) / 100;

export async function GET(request: Request) {
  await requireStaff(["owner"]);
  const key = new URL(request.url).searchParams.get("period") ?? "30d";
  const days = key === "7d" ? 7 : key === "90d" ? 90 : key === "all" ? null : 30;
  const period = days === null ? "كل الوقت" : "آخر " + days + " يوم";
  const db = getDb();
  const [ordersResult, lineResult, spendResult, totalsResult] = await Promise.all([
    db.query<{
      id: string; reference: string; customer: string; phone: string; city: string;
      created_at: string; payment_method: string; payment_state: string; state: string;
      subtotal_minor: number; shipping_minor: number; discount_minor: number; total_minor: number;
    }>(
      "select o.id::text,o.order_reference as reference,o.customer_name_snapshot as customer,o.phone_snapshot as phone," +
      "coalesce(o.shipping_address->>'city',o.shipping_address->>'governorate','—') as city,o.created_at::text," +
      "o.payment_method::text,o.payment_state::text,o.state::text,o.subtotal_minor,o.shipping_minor,o.discount_minor,o.total_minor " +
      "from public.orders o where o.payment_method<>'test' and " + dateFilter.replaceAll("created_at", "o.created_at") +
      " order by o.created_at desc,o.order_reference", [days]),
    db.query<{
      reference: string; created_at: string; sku: string; product: string; options: Record<string, string>;
      quantity: number; unit_price_minor: number; line_total_minor: number;
    }>(
      "select o.order_reference as reference,o.created_at::text,l.sku_code_snapshot as sku,l.product_name_snapshot as product," +
      "l.options_snapshot as options,l.quantity,l.unit_price_minor,l.line_total_minor from public.order_lines l " +
      "join public.orders o on o.id=l.order_id where o.payment_method<>'test' and " +
      dateFilter.replaceAll("created_at", "o.created_at") +
      " order by o.created_at desc,o.order_reference,l.created_at", [days]),
    db.query<{ spend_date: string; channel: string; campaign: string; amount_minor: number; note: string }>(
      "select spend_date::text,channel,campaign,amount_minor,note from app_private.admin_ad_spend " +
      "where $1::int is null or spend_date >= current_date - ($1::int - 1) order by spend_date desc,created_at desc", [days]),
    db.query<{
      collected: string; awaiting: string; returned_value: string; cancelled: number; returned_count: number;
    }>(
      "select coalesce(sum(total_minor) filter(where payment_state in ('paid','cod_collected','cod_settled') and state not in ('cancelled','returned')),0)::text as collected," +
      "coalesce(sum(total_minor) filter(where payment_state='cod_to_collect' and state not in ('cancelled','returned')),0)::text as awaiting," +
      "coalesce(sum(total_minor) filter(where state='returned' or payment_state='refunded'),0)::text as returned_value," +
      "count(*) filter(where state='cancelled')::int as cancelled," +
      "count(*) filter(where state='returned' or payment_state='refunded')::int as returned_count " +
      "from public.orders where payment_method<>'test' and " + dateFilter, [days]),
  ]);
  const spendTotal = spendResult.rows.reduce((sum, row) => sum + row.amount_minor, 0);
  const totals = totalsResult.rows[0];
  const collected = Number(totals?.collected ?? 0);
  const labels: WorkbookCell[][] = [
    ["CliQo | تقرير المبيعات"],
    ["الفترة", period],
    ["المبيعات المحصلة · ج.م", amount(collected)],
    ["COD بانتظار التحصيل · ج.م", amount(Number(totals?.awaiting ?? 0))],
    ["قيمة الطلبات المرتجعة/المستردة · ج.م", amount(Number(totals?.returned_value ?? 0))],
    ["عدد الطلبات الملغاة", Number(totals?.cancelled ?? 0)],
    ["عدد الطلبات المرتجعة/المستردة", Number(totals?.returned_count ?? 0)],
    ["مصروف الإعلانات المسجل يدويًا · ج.م", amount(spendTotal)],
    ["التحصيل بعد الإعلان · ج.م (ليس صافي ربح)", amount(collected - spendTotal)],
    ["ملاحظة", "لا يتضمن تكلفة التصنيع أو الشحن أو العمولات أو قيمة الاسترداد الجزئي."],
  ];
  const orderRows: WorkbookCell[][] = [[
    "رقم الطلب", "تاريخ الطلب", "العميل", "الهاتف", "المدينة", "الحالة", "طريقة الدفع", "حالة الدفع",
    "المنتجات · ج.م", "التوصيل · ج.م", "الخصم · ج.م", "الإجمالي · ج.م",
  ], ...ordersResult.rows.map((row) => [
    row.reference,row.created_at,row.customer,row.phone,row.city,
    orderStatusLabels[row.state as keyof typeof orderStatusLabels] ?? row.state,row.payment_method,
    paymentStateLabels[row.payment_state] ?? row.payment_state,amount(row.subtotal_minor),
    amount(row.shipping_minor),amount(row.discount_minor),amount(row.total_minor),
  ])];
  const lineRows: WorkbookCell[][] = [[
    "رقم الطلب","تاريخ الطلب","SKU","المنتج","الاختيارات","الكمية","سعر الوحدة · ج.م","إجمالي السطر · ج.م",
  ], ...lineResult.rows.map((row) => [
    row.reference,row.created_at,row.sku,row.product,Object.values(row.options ?? {}).join(" · "),
    row.quantity,amount(row.unit_price_minor),amount(row.line_total_minor),
  ])];
  const spendRows: WorkbookCell[][] = [[
    "التاريخ","القناة","الحملة","المبلغ · ج.م","ملاحظة",
  ], ...spendResult.rows.map((row) => [row.spend_date,row.channel,row.campaign,amount(row.amount_minor),row.note])];
  const workbook = createXlsxWorkbook([
    { name: "ملخص", rows: labels },
    { name: "الطلبات", rows: orderRows },
    { name: "بنود الطلبات", rows: lineRows },
    { name: "الإعلانات", rows: spendRows },
  ]);
  const fileDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const filename = "CliQo-sales-" + key + "-" + fileDate + ".xlsx";
  return new Response(Buffer.from(workbook), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="' + filename + '"',
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  } });
}
