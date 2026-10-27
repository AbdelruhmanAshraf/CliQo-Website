import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "owner" | "admin" | "operations" | "fulfillment" | "support";

export async function requireStaff(allowed?: readonly StaffRole[]) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError || !auth?.claims?.sub) redirect("/login?next=%2Fadmin%2Forders");

  const { data: staff, error } = await supabase
    .from("staff_members")
    .select("user_id, display_name, role, is_active")
    .eq("user_id", auth.claims.sub)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("تعذر التحقق من صلاحيات لوحة التشغيل.");
  if (!staff || (allowed && !allowed.includes(staff.role as StaffRole))) notFound();
  return { supabase, staff: staff as { user_id: string; display_name: string; role: StaffRole; is_active: boolean } };
}
