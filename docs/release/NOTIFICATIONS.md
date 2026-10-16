# Notifications: what exists, what is verified, what needs credentials

Written 16 Oct 2026 from the code at `de3acbc` plus this effort's commits. SPEC.md Section 15 is the product
rule. Nothing here was run against Expo's push service, APNs or FCM: no EAS project, no Apple or Google
credentials and no Android device exist yet (`docs/BLOCKERS.md` B-2).

**The distinction that matters for the whole beta.** A row in `push_outbox` is *a database fact*: "the
server decided this person should be told". A *delivered push* is a notification shown on a phone. Between
the two are four hand-offs that have never run end to end on a real device: the sender function, Expo's push
service, APNs or FCM, and the phone's own permission. A row with `sent_at` set means **Expo's push service
accepted the message**; it does not mean the phone received or showed it (section 3).

## 1. The path, step by step

```
event (reply, comment, follow, like, prompt, moderation, suggestion)
  -> public.activity row                           triggers on responses / comments / follows / likes, and the
  |                                                moderation + suggestion functions
  -> trigger activity_push -> queue_push_for_activity()
  |     reads notification_prefs (defaults if no row); pause_all; can_see() (blocks)
  -> public.push_outbox row (kind, recipient, video_id / prompt_id / activity_id, due_at)
  |     [tonight_prompt rows: cron job tonight-prompt -> queue_tonight_prompt()]
  -> pg_cron job `send-push`, every minute -> run_push_sender()
  |     does nothing unless Vault has push_function_url + push_function_key, and a due row exists
  -> pg_net POST (Bearer = Vault key) -> Edge Function `send-push` (checks PUSH_SENDER_KEY)
  -> rpc push_due(100): due rows, composed text push_text(), the recipient's push_tokens
  -> HTTPS POST https://exp.host/--/api/v2/push/send        (one message per token)
  -> Expo push service  ->  APNs (iOS) / FCM (Android)  ->  the phone
  -> rpc push_mark(): sent_at set if any ticket is "ok"; attempts +1; last_error
  -> phone: banner / list; tap -> onNotificationTap -> hrefForPush -> expo-router
```

### 1.1 Queueing (all in the database, all covered by pgTAP)

- **Activity rows** are written for video replies, comments, comment replies, follows, likes, "people you
  follow responded", place prompts, moderation notices and suggestion outcomes
  (`supabase/migrations/20261007000100_conversation.sql` and later). Activity is what the in-app Activity
  tab shows; the push is a second, optional consequence of the same row.
- **`queue_push_for_activity()`** (latest definition: `20261009000100_places_suggestions.sql`):
  - Moderation and suggestion kinds (`removed`, `restricted`, `suspended`, `review_outcome`,
    `suggestion_live`, `suggestion_declined`) are queued regardless of `notification_prefs`, including
    Pause all (SPEC.md Section 15: "Always").
  - Everything else is skipped when `pause_all` is on, when the matching preference is off, or when the
    actor is blocked either way (`can_see`). Defaults when a person has no `notification_prefs` row are the
    spec's: video replies, comments, comment replies, new followers, tonight's prompt, place prompts on;
    "people you follow respond" and likes off.
  - `place_prompt` is queued only if the recipient has at least one `push_tokens` row.
  - **Grouping:** comments (and likes) on one response share a `group_key` and are held `due_at = now() + 10
    minutes`; a unique index keeps one pending row per group, and the text is composed at send time from every
    commenter since the previous notification ("A and B commented", "A, B and 2 others").
- **Tonight's prompt:** `queue_tonight_prompt()` runs every 10 minutes (cron `tonight-prompt`) and queues one
  `tonight_prompt` row per account once its own local clock (from `accounts.timezone`, refreshed by the app on
  launch and foreground, DECISIONS 7 Oct) passes 18:30 on the day the global prompt is featured, if tonight
  is on, Pause all is off and the account has a token.
- **Text** is built by `push_text()` and matches SPEC.md Section 15's examples word for word where the spec
  gives one (pgTAP asserts the video reply, comment, tonight, suggestion, removal, restriction and
  review-outcome strings). Two have no spec text and are the implementation's wording: "Your account is
  suspended" and the like line ("X liked your response"; likes are off by default). Product sign-off on those
  two is not recorded.
- **Withdrawal:** deleting a video or the account deletes its *unsent* outbox rows
  (`20261008000100_safety.sql`, `20261012000200_video_deletion_cleanup.sql`).

### 1.2 Sending

- **Scheduler:** `run_push_sender()` is `SECURITY DEFINER`, reads two Vault secrets and posts with `pg_net`.
  The hosted project's Vault is empty and `send-push` is **not deployed there** (BETA-READINESS section 15: a
  moderation `removed` row sits unsent for that reason). Until both exist nothing is sent and nothing is lost;
  rows wait.
- **`supabase/functions/send-push/index.ts`:** `POST` only; `Authorization: Bearer <PUSH_SENDER_KEY>`;
  calls `push_due(100)`; for each row: no text or no token -> marks it done with `no_text` / `no_tokens`
  (so moderation notices to a person with no token are closed, not retried); otherwise posts one message per
  token (`sound: default`, body, data `{kind, video_id, prompt_id, activity_id}`) to Expo; a ticket with
  `DeviceNotRegistered` drops that token; `push_mark(ok)` where ok means at least one ticket was `ok`.
  `EXPO_ACCESS_TOKEN` is sent if set (needed once "enhanced push security" is turned on for the Expo project).
- **Retry:** a failed row stays due and is retried by the next minute's run, at most 5 attempts in total,
  then it is left with its `last_error` and never sent.

## 2. On the phone

| Concern | What the code does | Where |
| --- | --- | --- |
| Never ask on first launch | No permission request exists outside N-Prime. | `src/lib/notifications.ts` |
| First ask | Home, right after the first public video; shown when the server's `notification_ask` is `never` and the moment is `first_post`. | `src/lib/notificationAsk.ts`, `src/app/(tabs)/index.tsx` |
| Second ask | After "Not now" the server marks a second ask due when the first reply or comment arrives (DECISIONS 7 Oct); the tab layout shows N-Prime at the next safe foreground moment. After that, Settings only. | `src/app/(tabs)/_layout.tsx` |
| Permission off | Settings -> Notifications opens the same N-Prime sheet; its button opens the phone's settings. | `src/app/notifications/prime.tsx` (`mode=settings`) |
| Token registration | After the person accepts, and on every launch into Home: if the permission is granted and `extra.eas.projectId` exists, `getExpoPushTokenAsync({projectId})` then RPC `register_push_token`. **Without `EAS_PROJECT_ID` it logs once and registers nothing.** The founder build never registers (no push entitlement). | `registerTokenIfAllowed` |
| Foreground display | Banner, list and sound on. | `setNotificationHandler` |
| Opening | Tap routes by `data.kind`: `video_reply` -> `/reply/<video_id>`; `comment` and `comment_reply` -> `/comments/<video_id>`; `tonight_prompt`, `place_prompt`, `followed_responded` -> `/player/<prompt_id>`; **everything else** (follow, like, removed, restricted, suspended, review outcome, suggestion outcomes) -> the Activity tab. Missing ids fall back to Activity or Home. An analytics event `push_opened` records the first path segment. | `hrefForPush`, `src/app/_layout.tsx` |
| Token cleanup | Account deletion removes the account's tokens (database). The app has an RPC `remove_push_token` but never calls it. | see gaps |

### 2.1 Gaps found while tracing (none fixed here: `app/src` is not this role's)

1. **Opening from a killed app.** The tap listener is registered in an effect that runs only after sign-in
   state is known (`step === 'home'`). `getLastNotificationResponseAsync` / `useLastNotificationResponse` is
   never used, so a tap that launches a *terminated* app can be dropped and land on Home. This is the
   standard cold-start trap; it needs a device test and probably a small fix (Agent B/C).
2. **Sign-out leaves the token on the account.** `remove_push_token` is never called, so after sign-out the
   phone keeps receiving the previous account's pushes until another account registers the same token
   (`register_push_token` re-points it). Relevant to shared phones and to testing with two accounts on one
   device.
3. **`sent_at` is "accepted by Expo", not "delivered".** `send-push` never fetches Expo receipts
   (`/--/api/v2/push/getReceipts`). Errors that only appear in receipts (APNs or FCM rejection,
   `DeviceNotRegistered` for stale tokens, `MessageRateExceeded`) are invisible, and dead tokens are not
   pruned by that route. Expo recommends reading receipts about 15 minutes after sending. Proposal for Agent D
   or whoever owns `supabase/functions`: store ticket ids, add a receipts pass, drop tokens on
   `DeviceNotRegistered`. Until then, treat a manual device check as the only proof of delivery.
4. **No Android notification channel or icon.** `setNotificationChannelAsync` is not used, so Android shows the
   fallback channel; the `expo-notifications` config plugin is applied only implicitly (no `icon`, `color`).
   The small icon will be the launcher glyph, which Android renders as a white square. It needs the brand
   icon (DECISIONS 9 Oct) and a monochrome asset.
5. **`aps-environment` is `development`** in a local prebuild (verified 16 Oct). EAS store and TestFlight
   builds are signed with a distribution profile whose APNs environment is production; confirm in the first
   TestFlight build with `codesign -d --entitlements :- Shortcut.app`. If it is not `production`, set
   `['expo-notifications', { mode: 'production' }]` for the production profile.

## 3. What is verified, and how

| Layer | Verified | How | Not verified |
| --- | --- | --- | --- |
| Queue rules, defaults, Pause all, blocks, grouping, text | **Yes, locally** | pgTAP `supabase/tests/0003_conversation.sql` (99 assertions in that file; push assertions at lines 63-224), `0004_safety.sql`, `0005_places_suggestions.sql`. Run with `supabase test db` against a local stack (not re-run by this role; no Docker started). | The 18:30 trigger across a real timezone and DST change. |
| N-Prime timing | **Yes, as a pure rule** | Jest `src/__tests__/notificationAsk.test.ts` (`shouldAsk`, `hasReplyOrComment`). Included in the 246/246 run of 16 Oct. | The sheet, the OS prompt and the second ask on a device. |
| `hrefForPush` routing | **No test exists** | none | every route, cold start, warm start |
| `send-push` function | Reviewed, **no automated test** | none in `supabase/functions/_tests` | auth check, Expo call, token drop, retry |
| Cron wiring | **Yes on hosted (read-only)** | `send-push` and `tonight-prompt` jobs active and succeeding, doing nothing without Vault secrets | with secrets present |
| Expo push service, APNs, FCM | **No** | needs EAS project, APNs key, FCM credentials | everything |
| Delivery to a phone | **No** | needs a build with the push entitlement (paid Apple team) and/or an Android build with FCM | everything |

## 4. Credential steps, exactly, in order (none was run; each needs Nemat)

Prerequisites: an Expo account (free), a paid Apple Developer Program team for iOS push, a Google/Firebase
account for Android push.

1. **Expo project id** (`BLOCKERS.md` B-2/B-4). In `app/`: `npx eas-cli login`, then `npx eas-cli init`
   (creates the project on Nemat's Expo account and prints the project id). Put it in `app/.env` as
   `EAS_PROJECT_ID=<uuid>` for local builds and add it as an EAS environment variable for the `preview` and
   `production` environments. `app.config.ts` already turns it into `extra.eas.projectId`. Check:
   `EXPO_NO_DOTENV=1 EAS_PROJECT_ID=<uuid> npx expo config --type public` shows `extra.eas.projectId`.
2. **APNs key (iOS).** developer.apple.com -> Certificates, Identifiers & Profiles -> Keys -> `+` -> enable
   Apple Push Notifications service -> download the `.p8` once (it cannot be downloaded again; keep it out of
   git, `*.p8` is ignored) and note the Key ID and the Team ID. Upload it to the Expo project:
   `npx eas-cli credentials` -> iOS -> Push Notifications (or let the first `eas build` offer to create and
   store one). The App ID `app.shortcut` must have the Push Notifications capability enabled (EAS enables it
   from the entitlement during the first build).
3. **FCM (Android).** Firebase console -> create a project -> add an Android app with package
   `app.shortcut` -> download `google-services.json` (git-ignored; supply it to EAS as a file environment
   variable named `GOOGLE_SERVICES_JSON`, which `app.config.ts` reads). Project settings -> Service accounts ->
   generate a new private key (FCM HTTP v1) -> upload that JSON to the Expo project:
   `npx eas-cli credentials` -> Android -> Google Service Account -> FCM V1 key. Without `google-services.json`
   in the build `getExpoPushTokenAsync` fails on Android.
4. **Supabase hosted project** (`picvoavfxnajfjkqawju`; each step needs Nemat's approval, none was run):
   - Choose a long random string `S`.
   - In the SQL editor (or `supabase db query --linked`): `select vault.create_secret('https://picvoavfxnajfjkqawju.supabase.co/functions/v1/send-push', 'push_function_url');` and `select vault.create_secret('<S>', 'push_function_key');`
   - `supabase secrets set PUSH_SENDER_KEY=<S> --project-ref picvoavfxnajfjkqawju`
   - Optional: `supabase secrets set EXPO_ACCESS_TOKEN=<token>` if enhanced push security is enabled.
   - `supabase functions deploy send-push --no-verify-jwt --project-ref picvoavfxnajfjkqawju` (by name only,
     never `--prune`; the function authenticates with `PUSH_SENDER_KEY`).
5. **A build that can hold the capability** (not the founder build): a preview build signed by the paid team
   for iOS (`IOS.md`), a preview APK with `GOOGLE_SERVICES_JSON` for Android (`ANDROID.md`).
6. **Device check** (the B-2 check, `BLOCKERS.md`): with two accounts on two phones: A accepts N-Prime; B
   replies to A's response with a video; A's phone shows "<B> replied to your response with a video" within
   about a minute; tapping it opens the reply; the `push_outbox` row has `sent_at` set. Then Pause all (no new
   push), three comments within 10 minutes (one notification), a moderation notice, tonight's prompt at 18:30
   local, and the killed-app tap (gap 1). Record each outcome in `docs/BETA-READINESS.md`.

## 5. Quick diagnostics (read-only, for whoever runs step 6)

```sql
-- queued, not yet accepted by Expo
select id, kind, recipient_id, due_at, attempts, last_error from public.push_outbox where sent_at is null order by id;
-- accepted by Expo (still not proof of delivery)
select id, kind, sent_at from public.push_outbox where sent_at is not null order by id desc limit 20;
-- does the person have a token at all?
select platform, updated_at from public.push_tokens where account_id = '<uuid>';
-- did the cron job run?
select jobid, status, start_time, return_message from cron.job_run_details order by start_time desc limit 10;
```

`last_error` of `no_tokens` means the person never registered a token (permission off, no project id, founder
build) and the row was closed without any push attempt.
