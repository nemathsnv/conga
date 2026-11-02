-- Rollback of 20261102000100_member_gate.sql. Reopens the gap: a signed-in account with no
-- profile can again call every member function. Run as postgres, in one
-- transaction, then:
--   delete from supabase_migrations.schema_migrations where version = '20261102000100';

-- pre_request exactly as it was before the migration (pg_get_functiondef on a local stack built
-- from the earlier migrations). Grants are kept by create or replace.
CREATE OR REPLACE FUNCTION public.pre_request()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_uid is null then return; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) e
     where (case jsonb_typeof(e) when 'string' then e #>> '{}' else e->>'method' end) = 'password'
  ) then
    raise exception 'password_session' using errcode = '42501';
  end if;
  if not public.session_is_current() then
    raise exception 'session_revoked' using errcode = '42501';
  end if;
  if public.suspended_allowed_path(v_path) then return; end if;
  if exists (select 1 from public.accounts a where a.id = v_uid and a.moderation_status = 'suspended') then
    raise exception 'suspended' using errcode = 'P0001', hint = 'This account is suspended.';
  end if;
end;
$function$;

drop function public.pre_member_allowed_path(text);
