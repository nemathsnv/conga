-- One sign-in method per account, no merging (SPEC.md Sections 13 and 18).
-- Supabase links a new OAuth identity to an existing account with the same verified
-- email automatically. This trigger refuses a second provider on any account, so the
-- rule holds on the server whichever button is tapped. The app turns the error into
-- the E-Linked state for the provider that already exists.

create or replace function public.refuse_second_signin_method()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing text;
begin
  select provider into v_existing
    from auth.identities
   where user_id = new.user_id and provider <> new.provider
   limit 1;
  if v_existing is not null then
    raise exception 'signin_method_conflict:%', v_existing using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refuse_second_signin_method
  before insert on auth.identities
  for each row execute function public.refuse_second_signin_method();

-- invite_preview: what an invite link shows before sign-in (W-Link): who invited you and
-- which place the cohort starts with. Callable without a session; it reveals only what the
-- link's sender already shared, and nothing for unknown codes.
create or replace function public.invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lookup jsonb := public.invite_lookup(p_code);
  v_cohort_name text;
begin
  if v_lookup->>'status' <> 'valid' then
    return jsonb_build_object('status', v_lookup->>'status');
  end if;
  select name into v_cohort_name from public.beta_cohorts where id = v_lookup->>'cohort';
  return jsonb_build_object(
    'status', 'valid',
    'inviter_name', v_lookup->'inviter_name',
    'inviter_photo_path', v_lookup->'inviter_photo_path',
    'cohort_name', v_cohort_name
  );
end;
$$;

revoke execute on function public.invite_preview(text) from public, anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
