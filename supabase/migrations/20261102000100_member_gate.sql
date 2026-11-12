-- Closed-beta member gate (access-control audit, 2 Nov 2026; BETA-READINESS section 50's open
-- decision "pre_request checks the session, not a profile or beta access").
--
-- The gap: email sign-up is open (SPEC.md Section 13: the identity is created at sign-in, before
-- the invite step), so anyone with an inbox gets an authenticated session without an invite. The
-- read functions are SECURITY DEFINER and check only auth.uid(), so that session read everything a
-- member reads. Reproduced on an isolated stack in all four pre-member states (signed in only, age
-- confirmed, waitlisted, invite redeemed without a profile), each identical to a member:
--   home_feed, following_feed, open_prompts, get_prompt, prompt_responses, get_response, get_video,
--   reply_room (playback ids, names, captions, counts); comments_list (comment text, which the web
--   never shows, SPEC.md Section 16); get_profile, profile_responses, profile_replies, follow_list,
--   follow_suggestions (bios, follow graph); search, discover, places_screen, place_page; and the
--   direct reads of places, topics and app_config. follow_place, block_user, register_push_token
--   and track_events also wrote rows.
-- The app itself never calls these before Home (lib/onboarding.ts resolveStep), so only a
-- hand-made request reached them.
--
-- The fix, deny by default: pre_request refuses every API request from a signed-in account that
-- has no profile, except the onboarding calls the app makes before Home. The profile is the member
-- test because create_profile is where the closed beta is enforced: it refuses without the 18+
-- answer and, while invite_required is on, without beta access (an invite or waitlist admission).
-- The refusal reuses 'profile_required', which mux-create-upload already answers with 403.
--
-- Unchanged: anon requests (invite_preview, web_video, web_prompt, the web player and its Edge
-- function), the service role and every Edge function's own checks, Storage (avatar writes
-- already need a profile, avatar_write_allowed), the suspension and session checks, and every
-- function body, grant and policy. No row changes.

-- What the app calls before Home (app/src/lib/api.ts and analytics.ts), deleting the account and
-- removing a push token, which any signed-in person may do, and the two web player functions, which
-- anyone may call without signing in (SPEC.md Section 16).
create or replace function public.pre_member_allowed_path(p_path text)
returns boolean language sql immutable as $$
  select p_path in ('/rpc/get_onboarding_state', '/rpc/confirm_age', '/rpc/check_invite', '/rpc/invite_preview',
                    '/rpc/redeem_invite', '/rpc/join_waitlist', '/rpc/username_status', '/rpc/username_suggestions',
                    '/rpc/create_profile', '/rpc/track_events', '/rpc/delete_account', '/rpc/remove_push_token',
                    '/rpc/web_video', '/rpc/web_prompt');
$$;
revoke execute on function public.pre_member_allowed_path(text) from public, anon, authenticated;

-- Same as 20261016000202_session_lifecycle.sql except the member check at the end.
create or replace function public.pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  if not public.pre_member_allowed_path(v_path) and not public.has_profile(v_uid) then
    raise exception 'profile_required' using errcode = '42501', hint = 'Finish onboarding first.';
  end if;
end;
$$;
