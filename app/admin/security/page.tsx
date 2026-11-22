import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next-path";
import { OwnerMfaGate } from "./security-gate";

export default async function OwnerSecurityPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) redirect("/login?next=%2Fcliqo-control%2Forders");
  const { data: staff } = await supabase.from("staff_members").select("user_id,role,is_active")
    .eq("user_id", auth.claims.sub).eq("is_active", true).maybeSingle();
  if (!staff) notFound();
  const { next } = await searchParams;
  return <OwnerMfaGate next={safeNextPath(next ?? "/cliqo-control/orders")} />;
}
