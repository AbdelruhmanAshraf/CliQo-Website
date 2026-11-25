import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageEditor } from "../page-editor";
import styles from "../../dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function NewLandingPage() {

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) redirect("/dashboard");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login?next=%2Fdashboard%2Fpages%2Fnew");
  return <main className={styles.page}>
    <section className={styles.content}><PageEditor ownerId={String(claims.claims.sub)} page={null} /></section>
  </main>;
}
