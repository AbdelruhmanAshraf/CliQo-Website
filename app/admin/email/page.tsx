import { requireStaff } from "@/lib/admin";
import { getCopy } from "@/i18n/server";
import { AdminShell } from "../admin-shell";
import { AdminEmailWorkspace } from "./workspace";
import "./email.css";

export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const tr = await getCopy();
  const { staff } = await requireStaff(["owner"]);
  return <AdminShell staffName={staff.display_name} staffRole={staff.role}>
    <section className="ops-content admin-mail-page">
      <div className="ops-heading"><div><p className="ops-eyebrow">{tr("Operational email")}</p><h1>{tr("Mailboxes")}</h1><p>{tr("Read and send from the three addresses. Download backups and reports to your device.")}</p></div></div>
      <AdminEmailWorkspace />
    </section>
  </AdminShell>;
}
