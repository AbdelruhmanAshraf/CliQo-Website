import { getCopy } from '@/i18n/server';
import { requireStaff } from "@/lib/admin";
import { AdminShell } from "../admin-shell";
import { OrdersWorkspace } from "./orders-workspace";
import type { OrderRow, OrderStatus, LineStatus } from "../data";

export async function generateMetadata() {
  const tr = await getCopy();
  return { title: tr("الطلبات | CliQo Ops") };
}
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { supabase, staff } = await requireStaff();
  const { data: orders, error } = await supabase.from("orders")
    .select("id,order_reference,customer_name_snapshot,phone_snapshot,shipping_address,created_at,payment_method,payment_state,total_minor,state")
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("تعذر تحميل الطلبات.");
  const ids = (orders ?? []).map((order) => order.id);
  const [linesResult, notesResult] = ids.length ? await Promise.all([
    supabase.from("order_lines").select("id,order_id,product_name_snapshot,options_snapshot,quantity,state,design_business_name,design_request_url").in("order_id", ids),
    supabase.from("order_notes").select("id,order_id,body,created_at").in("order_id", ids).order("created_at", { ascending: true }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (linesResult.error || notesResult.error) throw new Error("تعذر تحميل تفاصيل الطلبات.");
  const lineIds = (linesResult.data ?? []).filter((line) => ["T1", "T2"].includes((line.options_snapshot as Record<string, string>)?.design ?? "")).map((line) => line.id);
  const orderFiles = new Map<string, { name: string; url: string }[]>();
  if (lineIds.length && ["owner", "admin", "operations", "fulfillment"].includes(staff.role)) {
    const { data: files, error: filesError } = await supabase.from("order_files")
      .select("order_line_id,storage_path,original_name").in("order_line_id", lineIds).order("created_at", { ascending: true });
    if (filesError) throw new Error("تعذر تحميل ملفات التصميم.");
    await Promise.all((files ?? []).map(async (file) => {
      const { data: signed } = await supabase.storage.from("order-designs").createSignedUrl(file.storage_path, 300);
      if (!signed?.signedUrl || !file.order_line_id) return;
      orderFiles.set(file.order_line_id, [...(orderFiles.get(file.order_line_id) ?? []), { name: file.original_name, url: signed.signedUrl }]);
    }));
  }
  const rows: OrderRow[] = (orders ?? []).map((order) => {
    const address = order.shipping_address as Record<string, unknown>;
    return {
      id: order.id, reference: order.order_reference, customer: order.customer_name_snapshot,
      phone: order.phone_snapshot, city: String(address.city ?? address.governorate ?? "—"),
      createdAt: order.created_at, payment: order.payment_method, paymentState: order.payment_state,
      totalMinor: order.total_minor, status: order.state as OrderStatus,
      lines: (linesResult.data ?? []).filter((line) => line.order_id === order.id).map((line) => ({
        id: line.id, name: line.product_name_snapshot,
        option: Object.values(line.options_snapshot ?? {}).join(" · ") || "—",
        qty: line.quantity, status: line.state as LineStatus,
        ...(["T1", "T2"].includes((line.options_snapshot as Record<string, string>)?.design ?? "") ? {
          design: {
            tier: (line.options_snapshot as Record<string, string>).design,
            businessName: line.design_business_name ?? "—",
            destinationUrl: line.design_request_url ?? "—",
            files: orderFiles.get(line.id) ?? [],
          },
        } : {}),
      })),
      notes: (notesResult.data ?? []).filter((note) => note.order_id === order.id).map((note) => ({ id: note.id, body: note.body, createdAt: note.created_at })),
    };
  });
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}><OrdersWorkspace orders={rows} canEdit={staff.role !== "support"} /></AdminShell>;
}
