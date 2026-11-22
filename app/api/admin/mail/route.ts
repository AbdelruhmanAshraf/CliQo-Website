import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { getInbox, getMessage, isMailboxKey, sendMailboxMessage } from "@/lib/admin-mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireStaff(["owner"]);
  const url = new URL(request.url);
  const box = url.searchParams.get("box");
  if (!isMailboxKey(box)) return NextResponse.json({ error: "Invalid mailbox." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  try {
    const uid = url.searchParams.get("uid");
    if (uid !== null) {
      if (!/^\d{1,12}$/.test(uid)) return NextResponse.json({ error: "Invalid message." }, { status: 400, headers: { "Cache-Control": "no-store" } });
      const message = await getMessage(box, Number(uid));
      return message
        ? NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } })
        : NextResponse.json({ error: "Message not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const inbox = await getInbox(box);
    return NextResponse.json(inbox, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذر تحميل البريد حاليًا." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  await requireStaff(["owner"]);
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const box = typeof input.box === "string" ? input.box : null;
  const to = typeof input.to === "string" ? input.to.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!isMailboxKey(box) || to.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)
    || !subject || subject.length > 180 || /[\r\n]/.test(subject) || !text || text.length > 30_000) {
    return NextResponse.json({ error: "راجع عنوان المستلم والموضوع ونص الرسالة." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await sendMailboxMessage(box, to, subject, text);
    return NextResponse.json({ ok: true, messageId: result.messageId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذر إرسال الرسالة. راجع الاتصال وحاول مرة أخرى." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
