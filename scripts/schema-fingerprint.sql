-- Schema fingerprint: one line per object the security stages care about, so a hosted project can
-- be compared line for line with a local stack built from the same migrations. Read-only: run it
-- inside a READ ONLY transaction. Each line is "<kind>|<name>|<md5 of its definition>".
--   functions in public (definition, owner, SECURITY DEFINER, volatility, search_path, grants);
--   tables in public (RLS, owner, grants); columns; constraints; indexes; triggers on public tables
--   and on auth.users and auth.identities; policies on public and storage; cron jobs; extensions;
--   schema privileges and default privileges; the authenticator role's settings.
with objects(kind, name, def) as (
  select 'function', p.oid::regprocedure::text,
         concat_ws('|', pg_get_functiondef(p.oid), pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile, p.proconfig::text, p.proacl::text)
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all
  select 'table', c.relname, concat_ws('|', c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner), c.relacl::text)
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
  union all
  select 'column', c.relname || '.' || a.attname,
         concat_ws('|', format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attidentity, a.attgenerated, a.attacl::text)
    from pg_attribute a join pg_class c on c.oid = a.attrelid left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped
  union all
  select 'constraint', c.relname || '.' || k.conname, pg_get_constraintdef(k.oid)
    from pg_constraint k join pg_class c on c.oid = k.conrelid where c.relnamespace = 'public'::regnamespace
  union all
  select 'index', i.indexrelid::regclass::text, pg_get_indexdef(i.indexrelid)
    from pg_index i join pg_class c on c.oid = i.indrelid where c.relnamespace = 'public'::regnamespace
  union all
  select 'trigger', t.tgrelid::regclass::text || '.' || t.tgname, concat_ws('|', pg_get_triggerdef(t.oid), t.tgenabled)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and (c.relnamespace = 'public'::regnamespace or t.tgrelid in ('auth.users'::regclass, 'auth.identities'::regclass))
  union all
  select 'policy', schemaname || '.' || tablename || '.' || policyname, concat_ws('|', permissive, roles::text, cmd, qual, with_check)
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'cron', jobname, concat_ws('|', schedule, command, active, username, database) from cron.job
  union all
  select 'extension', e.extname, concat_ws('|', e.extversion, e.extnamespace::regnamespace::text) from pg_extension e
  union all
  select 'schema', n.nspname, concat_ws('|', pg_get_userbyid(n.nspowner), n.nspacl::text) from pg_namespace n where n.nspname = 'public'
  union all
  select 'default_privileges', pg_get_userbyid(d.defaclrole) || '.' || d.defaclobjtype::text, d.defaclacl::text
    from pg_default_acl d where d.defaclnamespace = 'public'::regnamespace
  union all
  select 'role_setting', 'authenticator', coalesce((select string_agg(x, ',' order by x) from pg_db_role_setting s, unnest(s.setconfig) x
                                                   where s.setrole = 'authenticator'::regrole), '')
)
select kind, name, md5(coalesce(def, '')) as h from objects order by kind, name;
