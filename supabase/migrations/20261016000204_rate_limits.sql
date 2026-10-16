-- Abuse limits (16 Oct), R1 to R3: lookups anyone could repeat without limit.
--
--   R1 Invite codes. invite_preview is callable without an account, and check_invite /
--      redeem_invite by any signed-in person. Team codes are SC- plus 3 characters (32,768) and
--      personal codes NAME- plus 4 (about a million per first name), so codes could be enumerated:
--      a way round the closed beta, and the inviter's name and photo for each code found.
--   R2 auth-signin-method (E-Linked): anyone with the public key could ask, for any number of
--      addresses, whether an account exists and with which provider.
--   R3 the web player's event beacon wrote an analytics row per request.
--
-- One small fixed-window counter, used by all three. Thresholds live in rate_limit_rules and can be
-- changed with one update, no migration (docs/release/SECURITY.md lists them). Client keys are the
-- caller's IP address (or account) hashed with a per-database secret salt; no address is stored.
-- Over a limit, each path answers with something it already answers, so the app shows no new
-- state: an invite lookup answers 'not_found' (W-Invalid, the same inline error as an unknown code),
-- the sign-in method lookup answers no providers (the email code is sent as for a new address; the
-- access token hook still refuses it for an Apple or Google account, which shows E-Code).

create table public.rate_limit_rules (
  rule text primary key,
  max_hits integer not null check (max_hits > 0),
  window_seconds integer not null check (window_seconds between 1 and 86400),
  note text not null
);
alter table public.rate_limit_rules enable row level security;
revoke all on public.rate_limit_rules from anon, authenticated;

insert into public.rate_limit_rules (rule, max_hits, window_seconds, note) values
  ('invite_client',  10,  900, 'failed invite lookups (not found, expired, used) per client (IP, and account when signed in)'),
  ('invite_stem',    100, 3600, 'failed invite lookups per code stem (the part before the dash: SC, PUTU, ...), all clients together'),
  ('signin_address', 5,   900, 'auth-signin-method lookups per email address'),
  ('signin_client',  30,  900, 'auth-signin-method lookups per client IP'),
  ('web_event',      60,  3600, 'web player analytics events per client IP');

create table public.rate_limit_counters (
  rule text not null references public.rate_limit_rules (rule) on delete cascade,
  key_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (rule, key_hash, window_start)
);
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

-- The salt for the key hashes: random per database, never readable through the API.
create table public.rate_limit_salt (
  id boolean primary key default true check (id),
  salt text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
alter table public.rate_limit_salt enable row level security;
revoke all on public.rate_limit_salt from anon, authenticated;
insert into public.rate_limit_salt default values;

create or replace function public.rate_limit_key(p_raw text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.hmac(coalesce(p_raw, ''), (select salt from public.rate_limit_salt), 'sha256'), 'hex');
$$;

-- The current window's start for a rule.
create or replace function public.rate_limit_window(p_rule text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select to_timestamp(floor(extract(epoch from now()) / r.window_seconds) * r.window_seconds)
    from public.rate_limit_rules r where r.rule = p_rule;
$$;

-- True when the key has used up the rule's hits in the current window (reads only).
create or replace function public.rate_limit_exceeded(p_rule text, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.hits >= r.max_hits
                     from public.rate_limit_rules r
                     join public.rate_limit_counters c on c.rule = r.rule
                    where r.rule = p_rule and c.key_hash = public.rate_limit_key(p_key)
                      and c.window_start = public.rate_limit_window(p_rule)), false);
$$;

-- Counts one hit.
create or replace function public.rate_limit_add(p_rule text, p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.rate_limit_counters (rule, key_hash, window_start, hits)
  values (p_rule, public.rate_limit_key(p_key), public.rate_limit_window(p_rule), 1)
  on conflict (rule, key_hash, window_start) do update set hits = public.rate_limit_counters.hits + 1;
$$;

-- Checks and counts in one step: true when this hit is allowed.
create or replace function public.rate_limit_take(p_rule text, p_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.rate_limit_exceeded(p_rule, p_key) then return false; end if;
  perform public.rate_limit_add(p_rule, p_key);
  return true;
end;
$$;

-- The caller's address as PostgREST passes it on (request.headers). The platform's edge sets these
-- headers; a value the client sent itself can only move it into another bucket of the same
-- size, and the per-stem limit bounds what many addresses together can try.
create or replace function public.request_client_ip()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(h->>'cf-connecting-ip'), ''),
    nullif(btrim(h->>'x-real-ip'), ''),
    nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown')
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb as h) x;
$$;

-- Old windows go (daily).
create or replace function public.prune_rate_limit_counters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.rate_limit_counters where window_start < now() - interval '2 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- R1. invite_lookup is what invite_preview, check_invite and redeem_invite all ask. Its body moves
-- to invite_lookup_unlimited unchanged; the new invite_lookup limits failed lookups per client and
-- per code stem, and answers 'not_found' while either is used up.
-- ---------------------------------------------------------------------------
alter function public.invite_lookup(text) rename to invite_lookup_unlimited;

create or replace function public.invite_lookup(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.normalise_invite_code(p_code);
  v_stem text := 'stem:' || split_part(public.normalise_invite_code(p_code), '-', 1);
  v_ip text := 'ip:' || public.request_client_ip();
  v_acct text := case when auth.uid() is null then null else 'acct:' || auth.uid()::text end;
  v_result jsonb;
begin
  if public.rate_limit_exceeded('invite_client', v_ip)
     or (v_acct is not null and public.rate_limit_exceeded('invite_client', v_acct))
     or public.rate_limit_exceeded('invite_stem', v_stem) then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_result := public.invite_lookup_unlimited(v_code);
  if v_result->>'status' in ('not_found', 'expired', 'used') then
    perform public.rate_limit_add('invite_client', v_ip);
    if v_acct is not null then perform public.rate_limit_add('invite_client', v_acct); end if;
    perform public.rate_limit_add('invite_stem', v_stem);
  end if;
  return v_result;
end;
$$;

-- They now write a counter, so they cannot be STABLE (the app calls them with POST).
alter function public.invite_preview(text) volatile;
alter function public.check_invite(text) volatile;

-- ---------------------------------------------------------------------------
-- R2. For auth-signin-method (service role): the providers, or none while the address or the
-- client has used up its lookups. Every call counts, whatever the answer.
-- ---------------------------------------------------------------------------
create or replace function public.signin_providers_limited(p_email text, p_client text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address_ok boolean := public.rate_limit_take('signin_address', 'email:' || lower(btrim(coalesce(p_email, ''))));
  v_client_ok boolean := public.rate_limit_take('signin_client', 'ip:' || coalesce(nullif(btrim(p_client), ''), 'unknown'));
begin
  if not (v_address_ok and v_client_ok) then return '{}'; end if;
  return public.signin_providers_for_email(p_email);
end;
$$;

-- R3. For the web function (service role): true when this event may be recorded.
create or replace function public.web_event_allowed(p_client text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.rate_limit_take('web_event', 'ip:' || coalesce(nullif(btrim(p_client), ''), 'unknown'));
$$;

revoke execute on function public.rate_limit_key(text) from public, anon, authenticated;
revoke execute on function public.rate_limit_window(text) from public, anon, authenticated;
revoke execute on function public.rate_limit_exceeded(text, text) from public, anon, authenticated;
revoke execute on function public.rate_limit_add(text, text) from public, anon, authenticated;
revoke execute on function public.rate_limit_take(text, text) from public, anon, authenticated;
revoke execute on function public.request_client_ip() from public, anon, authenticated;
revoke execute on function public.prune_rate_limit_counters() from public, anon, authenticated;
revoke execute on function public.invite_lookup_unlimited(text) from public, anon, authenticated;
revoke execute on function public.invite_lookup(text) from public, anon, authenticated;
revoke execute on function public.signin_providers_limited(text, text) from public, anon, authenticated;
revoke execute on function public.web_event_allowed(text) from public, anon, authenticated;
grant execute on function public.signin_providers_limited(text, text) to service_role;
grant execute on function public.web_event_allowed(text) to service_role;

select cron.schedule('prune-rate-limit-counters', '50 3 * * *', 'select public.prune_rate_limit_counters()');
