-- New public objects start private. Expose them only with explicit grants,
-- RLS, and policies in the same migration.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove
-- that global grant and Supabase's schema-level client grants. Existing
-- intentional public RPCs retain their explicit grants.
alter default privileges for role postgres
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
