
import {getCopy} from "@/i18n/server";
import {randomUUID} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStorageAdmin } from "@/lib/supabase/storage-admin";
import {isOrderAccessCookieValid} from "@/lib/order-access";

export const runtime = "nodejs";
const referencePattern = /^CQ-[0-9]{6,}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxBytes = 5 * 1024 * 1024;
const types = [
  { mime: "image/jpeg", ext: "jpg", test: (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  { mime: "image/png", ext: "png", test: (bytes: Uint8Array) => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a },
  { mime: "image/webp", ext: "webp", test: (bytes: Uint8Array) => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (bytes: Uint8Array) => String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-" },
];

export async function POST(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const tr = await getCopy();
  const { reference } = await params;
  if (!referencePattern.test(reference)) return NextResponse.json({ error: tr("رابط الطلب غير صالح.") }, { status: 400 });
  const accessCookie = request.cookies.get("cliqo_order_" + reference)?.value ?? "";
  if (!accessCookie) return NextResponse.json({ error: tr("افتح رابط متابعة الطلب الأصلي لرفع الملف.") }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes + 128 * 1024) return NextResponse.json({ error: tr("حجم الملف أكبر من ٥ ميجابايت.") }, { status: 413 });

  try {
    const form = await request.formData();
    const orderLineId = String(form.get("orderLineId") ?? "").toLowerCase();
    const file = form.get("file");
    if (!uuidPattern.test(orderLineId) || !(file instanceof File) || file.size < 1 || file.size > maxBytes) {
      return NextResponse.json({ error: tr("اختار ملفًا صالحًا لا يتجاوز ٥ ميجابايت.") }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileType = types.find((type) => type.test(bytes));
    if (!fileType) return NextResponse.json({ error: tr("الملف يجب أن يكون JPG أو PNG أو WebP أو PDF.") }, { status: 415 });

    const { rows } = await getDb().query<{
      order_id: string; line_id: string; order_state: string; line_state: string;
      design_tier: string | null; tracking_token_hash: string;
    }>(
      "select o.id as order_id,l.id as line_id,o.state as order_state,l.state as line_state," +
      "l.options_snapshot->>'design' as design_tier,o.tracking_token_hash " +
      "from public.orders o join public.order_lines l on l.order_id=o.id " +
      "where o.order_reference=$1 and l.id=$2",
      [reference, orderLineId],
    );
    const orderLine = rows[0];
    if (!orderLine) return NextResponse.json({ error: tr("الطلب أو البند غير موجود.") }, { status: 404 });
    if (!isOrderAccessCookieValid(reference, accessCookie, orderLine.tracking_token_hash)) {
      return NextResponse.json({error: tr("افتح رابط متابعة الطلب الأصلي لرفع الملف.")}, {status: 401});
    }
    if (!(["T1", "T2"].includes(orderLine.design_tier ?? ""))) return NextResponse.json({ error: tr("هذا البند لا يحتاج ملف تصميم.") }, { status: 400 });
    if (["cancelled", "returned", "shipped", "delivered"].includes(orderLine.order_state)
        || orderLine.line_state !== "awaiting_design") {
      return NextResponse.json({ error: tr("انتهت فترة استلام ملفات التصميم لهذا الطلب.") }, { status: 409 });
    }
    const existing = await getDb().query<{ count: string }>(
      "select count(*)::text as count from public.order_files where order_line_id=$1", [orderLineId],
    );
    if (Number(existing.rows[0]?.count ?? 0) >= 3) return NextResponse.json({ error: tr("وصل البند للحد الأقصى من الملفات.") }, { status: 409 });

    const baseName = file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 220) || "design-file";
    const storagePath = `${orderLine.order_id}/${orderLine.line_id}/${randomUUID()}.${fileType.ext}`;
    const storage = getStorageAdmin().storage.from("order-designs");
    const upload = await storage.upload(storagePath, bytes, { contentType: fileType.mime, upsert: false });
    if (upload.error) return NextResponse.json({ error: tr("تعذر رفع الملف. جرّب مرة أخرى.") }, { status: 502 });
    try {
      const db = await getDb().connect();
      try {
        await db.query("begin");
        // Serialize uploads for this line and re-check the deadline after the file transfer.
        const { rows: [current] } = await db.query<{ order_state: string; line_state: string }>(
          "select o.state as order_state,l.state as line_state from public.orders o " +
          "join public.order_lines l on l.order_id=o.id where o.id=$1 and l.id=$2 for update of o,l",
          [orderLine.order_id, orderLineId],
        );
        const count = await db.query<{ count: number }>(
          "select count(*)::int as count from public.order_files where order_line_id=$1", [orderLineId],
        );
        const closed = !current || current.line_state !== "awaiting_design"
          || ["cancelled", "returned", "shipped", "delivered"].includes(current.order_state);
        const full = (count.rows[0]?.count ?? 0) >= 3;
        if (closed || full) {
          await db.query("rollback");
          await storage.remove([storagePath]).catch(() => undefined);
          return NextResponse.json({ error: tr(closed
            ? "انتهت فترة استلام ملفات التصميم لهذا الطلب."
            : "وصل البند للحد الأقصى من الملفات.") }, { status: 409 });
        }
        await db.query(
          "insert into public.order_files(order_id,order_line_id,storage_path,original_name,mime_type,byte_size) values($1,$2,$3,$4,$5,$6)",
          [orderLine.order_id, orderLineId, storagePath, baseName, fileType.mime, file.size],
        );
        await db.query("commit");
      } catch (error) {
        await db.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        db.release();
      }
    } catch {
      await storage.remove([storagePath]).catch(() => undefined);
      return NextResponse.json({ error: tr("تعذر حفظ بيانات الملف. جرّب مرة أخرى.") }, { status: 500 });
    }
    return NextResponse.json({ ok: true, fileName: baseName }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: tr("تعذر معالجة الملف. جرّب مرة أخرى.") }, { status: 500 });
  }
}
