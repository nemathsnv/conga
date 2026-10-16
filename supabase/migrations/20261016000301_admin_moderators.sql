-- The moderation web admin (Edge Function `admin`; decided 8 Oct: required before the first outside
-- tester, SPEC.md Section 17 "Moderator tools"). This migration adds only what the admin needs
-- on top of the mod_* functions that already exist; it does not create a second moderation
-- backend. Every action the admin takes is one of the existing mod_* calls, logged as before.
--
--   moderators   who may use the admin: one row per account, service role only (no app access)
--   mod_whoami   the check the admin makes on EVERY request: is this account an active moderator
--   read functions for what the queues do not show: a report's reporter and context, a video or
--                comment as a moderator sees it, an account and its content, a username lookup
--   mod_add_moderator / mod_deactivate_moderator / mod_list_moderators  (scripts/moderate.sh)
--
-- Everything here is executable by the service role only, like the mod_* functions. No member can
-- read the table, learn who the moderators are, or call any of these.

-- ---------------------------------------------------------------------------
-- moderators
-- ---------------------------------------------------------------------------
create table public.moderators (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  active boolean not null default true,
  added_at timestamptz not null default now(),
  added_by text not null check (btrim(added_by) <> '')
);
comment on table public.moderators is 'Accounts that may use the moderation admin (Edge Function admin). Written and read by the service role only; membership is checked on every admin request (mod_whoami).';
alter table public.moderators enable row level security;
-- No policy: RLS denies every member. The explicit revoke also removes the table privileges.
revoke all on table public.moderators from public, anon, authenticated;
grant select, insert, update, delete on table public.moderators to service_role;

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------

-- Grants moderator access (or turns it back on). The account must exist; moderators sign in to
-- the admin with an email code like any account, so it needs an email sign-in.
create or replace function public.mod_add_moderator(p_account uuid, p_added_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.moderators%rowtype;
begin
  if p_added_by is null or btrim(p_added_by) = '' then raise exception 'moderator_required' using errcode = 'P0001'; end if;
  if p_account is null or not exists (select 1 from public.accounts where id = p_account) then
    raise exception 'account_not_found' using errcode = 'P0001';
  end if;
  insert into public.moderators (account_id, active, added_by) values (p_account, true, btrim(p_added_by))
  on conflict (account_id) do update set active = true, added_by = excluded.added_by, added_at = now()
  returning * into m;
  return jsonb_build_object('account_id', m.account_id, 'active', m.active, 'added_at', m.added_at, 'added_by', m.added_by,
                            'username', (select username from public.profiles where id = m.account_id));
end;
$$;

-- Turns moderator access off at once (the row stays, so who was a moderator is not lost).
create or replace function public.mod_deactivate_moderator(p_account uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.moderators set active = false where account_id = p_account;
  return found;
end;
$$;

create or replace function public.mod_list_moderators()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id', m.account_id, 'active', m.active, 'added_at', m.added_at, 'added_by', m.added_by,
    'username', p.username, 'name', p.name) order by m.added_at), '[]'::jsonb)
  from public.moderators m left join public.profiles p on p.id = m.account_id;
$$;

-- The admin's membership check, made on every request with the account id from the verified
-- token. Null unless the account is an active moderator whose own account is in good standing:
-- not suspended, not deleted. The identity is the text the mod_* functions record as p_moderator.
create or replace function public.mod_whoami(p_account uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.account_id, 'username', p.username, 'name', p.name,
    'identity', coalesce('@' || p.username, 'account') || ' (' || m.account_id || ')')
  from public.moderators m
  join public.accounts a on a.id = m.account_id
  left join public.profiles p on p.id = m.account_id
  where m.account_id = p_account
    and m.active
    and a.moderation_status <> 'suspended'
    and a.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Read functions
-- ---------------------------------------------------------------------------

-- What a moderator knows about an account in one line. Never the email.
create or replace function public.mod_account_summary(p_account uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'name', p.name, 'username', p.username,
    'moderation_status', a.moderation_status, 'restricted_until', a.restricted_until,
    'deleted_at', a.deleted_at, 'joined_at', a.created_at, 'has_profile', p.id is not null)
  from public.accounts a left join public.profiles p on p.id = a.id
  where a.id = p_account;
$$;

-- A report with its reporter (moderators see who reported; members never do) and the other
-- reports on the same target. The target itself is read with mod_video_detail,
-- mod_comment_detail or mod_account_overview, by its kind.
create or replace function public.mod_report_detail(p_report uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.target_kind, 'target_id', r.target_id, 'reason', r.reason, 'created_at', r.created_at,
    'status', r.status, 'closed_at', r.closed_at, 'closed_by', r.closed_by, 'action_id', r.action_id,
    'reporter', case when r.reporter_id is null then null else public.mod_account_summary(r.reporter_id) end,
    'others', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'reason', o.reason, 'created_at', o.created_at, 'status', o.status) order by o.created_at)
                          from public.reports o where o.target_kind = r.target_kind and o.target_id = r.target_id and o.id <> r.id), '[]'::jsonb))
  from public.reports r where r.id = p_report;
$$;

-- A video (response or video reply) as a moderator sees it. playback_id is given only while
-- the video is live: a removed, deleted or draft video has no public playback, and the admin
-- says so. holds_response_slot: a primary response still occupying its prompt for its author.
create or replace function public.mod_video_detail(p_video uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'status', r.status, 'caption', r.caption, 'duration_ms', r.duration_ms,
    'created_at', r.created_at, 'live_at', r.live_at, 'deleted_at', r.deleted_at,
    'author', case when r.author_id is null then null else public.mod_account_summary(r.author_id) end,
    'prompt', (select jsonb_build_object('id', p.id, 'text', p.text) from public.prompts p where p.id = r.prompt_id),
    'root_response_id', r.root_response_id, 'reply_to_id', r.reply_to_id,
    'playback_public', r.status = 'live' and r.mux_playback_id is not null,
    'playback_id', case when r.status = 'live' then r.mux_playback_id end,
    'has_asset', r.mux_asset_id is not null,
    'restorable', public.mux_video_restorable(r),
    'holds_response_slot', r.kind = 'response' and r.status in ('processing', 'live', 'removed'),
    'removal', (select jsonb_build_object('action_id', m.id, 'reason', m.reason, 'note', m.note, 'moderator', m.moderator, 'created_at', m.created_at,
                                          'review', (select jsonb_build_object('requested_at', rq.created_at, 'outcome', rq.outcome) from public.review_requests rq where rq.action_id = m.id))
                  from public.moderation_actions m where m.id = r.removed_action_id),
    'open_reports', (select count(*) from public.reports x where x.target_kind = 'video' and x.target_id = r.id and x.status = 'open'),
    'all_reports', (select count(*) from public.reports x where x.target_kind = 'video' and x.target_id = r.id),
    'like_count', public.like_count(r.id))
  from public.responses r where r.id = p_video;
$$;

-- A comment as a moderator sees it: its text, whoever removed it and why.
create or replace function public.mod_comment_detail(p_comment uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'body', c.body, 'created_at', c.created_at, 'deleted_at', c.deleted_at,
    'removed_by_moderation', c.removed_action_id is not null,
    'author', case when c.author_id is null then null else public.mod_account_summary(c.author_id) end,
    'response', (select jsonb_build_object('id', v.id, 'kind', v.kind, 'status', v.status, 'prompt', (select p.text from public.prompts p where p.id = v.prompt_id))
                   from public.responses v where v.id = c.response_id),
    'parent_id', c.parent_id,
    'removal', (select jsonb_build_object('action_id', m.id, 'reason', m.reason, 'note', m.note, 'moderator', m.moderator, 'created_at', m.created_at,
                                          'review', (select jsonb_build_object('requested_at', rq.created_at, 'outcome', rq.outcome) from public.review_requests rq where rq.action_id = m.id))
                  from public.moderation_actions m where m.id = c.removed_action_id),
    'open_reports', (select count(*) from public.reports x where x.target_kind = 'comment' and x.target_id = c.id and x.status = 'open'),
    'all_reports', (select count(*) from public.reports x where x.target_kind = 'comment' and x.target_id = c.id))
  from public.comments c where c.id = p_comment;
$$;

-- Find accounts by username (exact or beginning) or by account id. At most 10, never the email.
create or replace function public.mod_account_lookup(p_query text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
  v_id uuid;
begin
  q := regexp_replace(q, '^@', '');
  if q = '' or char_length(q) > 80 then return '[]'::jsonb; end if;
  if q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := q::uuid;
    return coalesce((select jsonb_build_array(public.mod_account_summary(a.id)) from public.accounts a where a.id = v_id), '[]'::jsonb);
  end if;
  return coalesce((
    select jsonb_agg(public.mod_account_summary(x.id) order by (x.username = q) desc, x.username)
      from (select p.id, p.username from public.profiles p
             where p.username = q or p.username like replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
             order by (p.username = q) desc, p.username limit 10) x
  ), '[]'::jsonb);
end;
$$;

-- An account and what it has made, newest first, so a moderator can find the content to inspect.
-- The moderation log is mod_account_log.
create or replace function public.mod_account_overview(p_account uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'account', public.mod_account_summary(a.id),
    'is_moderator', exists (select 1 from public.moderators m where m.account_id = a.id and m.active),
    'open_reports_about_account', (select count(*) from public.reports x where x.target_kind = 'profile' and x.target_id = a.id and x.status = 'open'),
    'videos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'kind', v.kind, 'status', v.status, 'caption', v.caption, 'created_at', v.created_at,
                                                          'prompt', (select p.text from public.prompts p where p.id = v.prompt_id)) order by v.created_at desc)
                          from (select * from public.responses where author_id = a.id and status <> 'draft' order by created_at desc limit 30) v), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at, 'deleted_at', c.deleted_at, 'response_id', c.response_id) order by c.created_at desc)
                            from (select * from public.comments where author_id = a.id order by created_at desc limit 30) c), '[]'::jsonb))
  from public.accounts a where a.id = p_account;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service role only
-- ---------------------------------------------------------------------------
revoke execute on function public.mod_add_moderator(uuid, text) from public, anon, authenticated;
revoke execute on function public.mod_deactivate_moderator(uuid) from public, anon, authenticated;
revoke execute on function public.mod_list_moderators() from public, anon, authenticated;
revoke execute on function public.mod_whoami(uuid) from public, anon, authenticated;
revoke execute on function public.mod_account_summary(uuid) from public, anon, authenticated;
revoke execute on function public.mod_report_detail(uuid) from public, anon, authenticated;
revoke execute on function public.mod_video_detail(uuid) from public, anon, authenticated;
revoke execute on function public.mod_comment_detail(uuid) from public, anon, authenticated;
revoke execute on function public.mod_account_lookup(text) from public, anon, authenticated;
revoke execute on function public.mod_account_overview(uuid) from public, anon, authenticated;
grant execute on function public.mod_add_moderator(uuid, text) to service_role;
grant execute on function public.mod_deactivate_moderator(uuid) to service_role;
grant execute on function public.mod_list_moderators() to service_role;
grant execute on function public.mod_whoami(uuid) to service_role;
grant execute on function public.mod_account_summary(uuid) to service_role;
grant execute on function public.mod_report_detail(uuid) to service_role;
grant execute on function public.mod_video_detail(uuid) to service_role;
grant execute on function public.mod_comment_detail(uuid) to service_role;
grant execute on function public.mod_account_lookup(text) to service_role;
grant execute on function public.mod_account_overview(uuid) to service_role;

notify pgrst, 'reload schema';
