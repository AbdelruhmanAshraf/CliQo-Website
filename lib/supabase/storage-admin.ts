import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let storageAdmin: SupabaseClient | undefined;

export function getStorageAdmin() {
  if (storageAdmin) return storageAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server storage credentials are missing.");
  storageAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return storageAdmin;
}
