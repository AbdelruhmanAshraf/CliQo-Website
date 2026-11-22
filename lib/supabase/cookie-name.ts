// Keep the auth cookie stable across the public API hostname and Docker's internal Kong hostname.
export const SUPABASE_AUTH_COOKIE_NAME = "sb-cliqo-auth-token";
