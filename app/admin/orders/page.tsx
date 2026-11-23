import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { testCheckoutEnabled } from "@/lib/test-checkout-session";
import {getDb} from "@/lib/db";
import { AdminShell } from "../admin-shell";
import { OrdersWorkspace } from "./orders-workspace";
import type { OrderRow, OrderStatus, LineStatus } from "../data";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("الطلبات | CliQo Ops") };
}
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const operations = ["owner", "admin", "operations", "fulfillment"];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; testError?: string; view?: string }> }) {
  const { supabase, staff } = await requireStaff();
  const params = await searchParams;
  const tr = await getCopy();
  const q = (params.q ?? '').trim().slice(0, 80).toLowerCase();
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const db = getDb();
  const archived = params.view === "archive";
  const canArchive = staff.role === "owner" || staff.role === "admin";
  const match = "where (archived_at is not null) = $2 and ($1 = '' or position($1 in lower(coalesce(order_reference,'') || ' ' || coalesce(customer_name_snapshot,'') || ' ' || coalesce(phone_snapshot,''))) > 0)";
  const countResult = await db.query<{total: number}>(`select count(*)::int as total from public.orders ${match}`, [q, archived]);
  const total = countResult.rows[0]?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const idResult = await db.query<{id: string}>(`select id from public.orders ${match} order by created_at desc,id desc limit $3 offset $4`, [q, archived, PAGE_SIZE, (current-1)*PAGE_SIZE]);
  const selectedIds = idResult.rows.map(row=>row.id);
  const { data: orders, error } = selectedIds.length ? await supabase.from("orders")
    .select("id,order_reference,customer_name_snapshot,phone_snapshot,shipping_address,created_at,payment_method,payment_state,total_minor,state")
    .in("id", selectedIds) : { data: [], error: null };
  if (error) throw new Error("تعذر تحميل الطلبات.");
  const position = new Map(selectedIds.map((id,index)=>[id,index]));
  const ordered = [...(orders ?? [])].sort((a,b)=>(position.get(a.id) ?? 0)-(position.get(b.id) ?? 0));
  const ids = ordered.map((order) => order.id);
  const attemptsResult = ids.length ? await getDb().query<{order_id: string; status: string}>(
    "select distinct on(order_id) order_id,status from app_private.payment_attempts " +
    "where order_id=any($1::uuid[]) order by order_id,attempt_number desc", [ids],
  ) : {rows: [] as {order_id: string; status: string}[]};
  const paymentAttemptByOrder = new Map(attemptsResult.rows.map((attempt) => [attempt.order_id, attempt.status]));
  const canEdit = !archived && operations.includes(staff.role);
  const designerNumber = (process.env.CLIQO_DESIGNER_WHATSAPP ?? "").replace(/[+()\s-]/g, "");
  const [linesResult, notesResult, assignedResult] = ids.length ? await Promise.all([
    supabase.from("order_lines").select("id,order_id,product_name_snapshot,options_snapshot,quantity,state,design_business_name,design_request_url,design_brief").in("order_id", ids),
    supabase.from("order_notes").select("id,order_id,body,created_at").in("order_id", ids).order("created_at", { ascending: true }),
    canEdit ? db.query<{ line_id: string; quantity: number; public_ids: string[] }>(
      `select i.order_line_id as line_id,count(*)::int as quantity,array_agg(i.public_id::text order by i.created_at,i.id) as public_ids
       from public.smart_items i join public.order_lines l on l.id=i.order_line_id
       where l.order_id=any($1::uuid[]) and i.state<>'disabled' group by i.order_line_id`, [ids],
    ) : { rows: [] },
  ]) : [{ data: [], error: null }, { data: [], error: null }, { rows: [] }];
  const assigned = new Map(assignedResult.rows.map(row => [row.line_id, row]));
  if (linesResult.error || notesResult.error) throw new Error("تعذر تحميل تفاصيل الطلبات.");
  const lineIds = (linesResult.data ?? []).filter((line) => ["T1", "T2"].includes((line.options_snapshot as Record<string, string>)?.design ?? "")).map((line) => line.id);
  const orderFiles = new Map<string, { name: string; url: string }[]>();
  if (lineIds.length && canEdit) {
    const { data: files, error: filesError } = await supabase.from("order_files")
      .select("order_line_id,storage_path,original_name").in("order_line_id", lineIds).order("created_at", { ascending: true });
    if (filesError) throw new Error("تعذر تحميل ملفات التصميم.");
    const signedFiles = await Promise.all((files ?? []).map(async (file) => {
      const { data: signed } = await supabase.storage.from("order-designs").createSignedUrl(file.storage_path, 300);
      return { ...file, url: signed?.signedUrl };
    }));
    for (const file of signedFiles) {
      if (!file.order_line_id || !file.url) continue;
      orderFiles.set(file.order_line_id, [...(orderFiles.get(file.order_line_id) ?? []), { name: file.original_name, url: file.url }]);
    }
  }
  const rows: OrderRow[] = ordered.map((order) => {
    const address = order.shipping_address as Record<string, unknown>;
    return {
      id: order.id, reference: order.order_reference, customer: order.customer_name_snapshot,
      phone: order.phone_snapshot, city: String(address.city ?? address.governorate ?? "—"),
      createdAt: order.created_at, payment: order.payment_method, paymentState: order.payment_state,
      paymentAttempt: paymentAttemptByOrder.get(order.id) ?? null,
      totalMinor: order.total_minor, status: order.state as OrderStatus,
      lines: (linesResult.data ?? []).filter((line) => line.order_id === order.id).map((line) => ({
        id: line.id, name: line.product_name_snapshot,
        option: Object.values(line.options_snapshot ?? {}).join(" · ") || "—",
        qty: line.quantity, status: line.state as LineStatus, stockUnits: assigned.get(line.id)?.quantity ?? 0,
        testItemIds: order.payment_method === "test" ? assigned.get(line.id)?.public_ids : undefined,
        ...(["T1", "T2"].includes((line.options_snapshot as Record<string, string>)?.design ?? "") ? {
          design: {
            tier: (line.options_snapshot as Record<string, string>).design as "T1" | "T2",
            businessName: line.design_business_name ?? "—",
            destinationUrl: line.design_request_url,
            brief: line.design_brief,
            files: orderFiles.get(line.id) ?? [],
          },
        } : {}),
      })),
      notes: (notesResult.data ?? []).filter((note) => note.order_id === order.id).map((note) => ({ id: note.id, body: note.body, createdAt: note.created_at })),
    };
  });
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}>{!archived && staff.role === "owner" && testCheckoutEnabled() && <section className="test-store-control">
    <div><h2>{tr("متجر الاختبار الخاص")}</h2><p>{tr("اعمل طلب تجربة بمخزون منفصل، وبعدها تابعه من لوحة الطلبات.")}</p>
      {params.testError && <p role="alert">{tr("تعذر فتح متجر الاختبار. راجع إن البيع العام مقفول وحاول تاني.")}</p>}
    </div>
    <form action="/cliqo-control/orders/test-store" method="post">
      <button className="save-note" type="submit">{tr("افتح المتجر للتجربة")}</button>
  </form>
  </section>}<OrdersWorkspace key={archived ? "archive" : "board"} orders={rows} canEdit={canEdit} archived={archived} canArchive={canArchive} canDelete={staff.role === "owner"} designerNumber={canEdit && /^[1-9][0-9]{7,14}$/.test(designerNumber) ? designerNumber : null} initialQuery={q} currentPage={current} totalPages={pages} totalMatches={total} /></AdminShell>;
}
