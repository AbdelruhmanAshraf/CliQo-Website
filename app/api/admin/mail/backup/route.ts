import { requireStaff } from "@/lib/admin";
import { connectMailbox, escapeMboxSource, isMailboxKey, mboxSeparator } from "@/lib/admin-mail";
import type { ImapFlow } from "imapflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireStaff(["owner"]);
  const box = new URL(request.url).searchParams.get("box");
  if (!isMailboxKey(box)) return Response.json({ error: "Invalid mailbox." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  let client: ImapFlow | null = null;
  let mailboxLock: { release: () => void } | null = null;
  try {
    client = await connectMailbox(box);
    mailboxLock = await client.getMailboxLock("INBOX", { readOnly: true });
  } catch {
    await client?.logout().catch(() => undefined);
    return Response.json({ error: "تعذر بدء النسخة الاحتياطية." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const message of client!.fetch("1:*", { uid: true, source: true, envelope: true, internalDate: true }, { uid: true })) {
          if (!message.source) continue;
          controller.enqueue(mboxSeparator(message));
          controller.enqueue(escapeMboxSource(message.source));
          controller.enqueue(Buffer.from("\r\n\r\n", "ascii"));
        }
        controller.close();
      } catch {
        controller.error(new Error("Mailbox backup stream failed."));
      } finally {
        mailboxLock?.release();
        await client!.logout().catch(() => undefined);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/mbox; charset=binary",
      "Content-Disposition": `attachment; filename="cliqo-${box}-inbox-${new Date().toISOString().slice(0, 10)}.mbox"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
