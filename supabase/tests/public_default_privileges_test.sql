BEGIN;
SELECT plan(13);

-- Probe objects are rolled back; assert default grants for app migrations.
SET LOCAL ROLE postgres;
CREATE TABLE public.cliqo_default_acl_table_probe (id integer);
CREATE SEQUENCE public.cliqo_default_acl_sequence_probe;
CREATE FUNCTION public.cliqo_default_acl_function_probe()
RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;

SELECT ok(
  NOT has_table_privilege('anon', 'public.cliqo_default_acl_table_probe', 'select,insert,update,delete'),
  'new public tables are not granted to anon'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.cliqo_default_acl_table_probe', 'select,insert,update,delete'),
  'new public tables are not granted to authenticated'
);
SELECT ok(
  NOT has_sequence_privilege('anon', 'public.cliqo_default_acl_sequence_probe', 'usage,select,update'),
  'new public sequences are not granted to anon'
);
SELECT ok(
  NOT has_sequence_privilege('authenticated', 'public.cliqo_default_acl_sequence_probe', 'usage,select,update'),
  'new public sequences are not granted to authenticated'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.cliqo_default_acl_function_probe()', 'execute'),
  'new public functions are not executable by anon'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.cliqo_default_acl_function_probe()', 'execute'),
  'new public functions are not executable by authenticated'
);
SELECT ok(
  has_function_privilege('service_role', 'public.cliqo_default_acl_function_probe()', 'execute'),
  'server-side service_role retains function execution'
);
SELECT ok(
  has_function_privilege('anon', 'public.resolve_stand(text)', 'execute'),
  'public item resolution retains its explicit anon grant'
);
SELECT ok(
  has_function_privilege('anon', 'public.track_smart_item_click(text,uuid)', 'execute'),
  'public page clicks retain their explicit anon grant'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_stand_activation(text,text)', 'execute'),
  'activation claim remains unavailable to anon'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.claim_stand_activation(text,text)', 'execute'),
  'authenticated customers can claim their own items'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.save_merchant_page(uuid,text,text,text,text,boolean,jsonb)', 'execute'),
  'page editing remains unavailable to anon'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.save_merchant_page(uuid,text,text,text,text,boolean,jsonb)', 'execute'),
  'authenticated customers can manage their pages'
);

SELECT * FROM finish();
ROLLBACK;
