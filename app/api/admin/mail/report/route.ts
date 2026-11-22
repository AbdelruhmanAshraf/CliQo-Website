import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { getMailboxStats, mailboxes, type MailboxKey } from "@/lib/admin-mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await requireStaff(["owner"]);
  try {
    const generatedAt = new Date().toISOString();
    const rows = await Promise.all((Object.keys(mailboxes) as MailboxKey[]).map(async (key) => ({
      key,
      email: mailboxes[key].email,
      ...(await getMailboxStats(key)),
    })));
    const csv = [
      "mailbox,email,messages,unread,storage_bytes,generated_at",
      ...rows.map((row) => [row.key, row.email, row.messages, row.unread, row.bytes, generatedAt].join(",")),
    ].join("\r\n");
    return new Response(`\uFEFF${csv}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cliqo-mail-report-${generatedAt.slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "تعذر إنشاء التقرير حاليًا." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
