# Supabase backend

Postgres, Auth, Storage and Edge Functions for Shortcut. Everything here is reproducible from
`migrations/` on a clean database; nothing is ever edited by hand on the hosted project.

## Layout

| Path | What it is |
|---|---|
| `config.toml` | Project configuration, including Auth providers and the email-code template. Secrets come from `supabase/.env` through `env()`. |
| `migrations/` | Ordered SQL migrations. The schema of record. |
| `seed.sql` | Local development seed only (test invite codes). Never applied to the hosted project. |
| `tests/` | pgTAP tests. `supabase test db` runs them against the local stack. |
| `functions/` | Edge Functions (Deno). `auth-signin-method` backs the E-Linked check; `mux-create-upload`, `mux-upload-status` and `mux-webhook` carry video; `mux-cleanup` deletes and revokes videos at Mux; `send-push` drains the push outbox. |
| `functions/_tests/` | Deno tests for the Mux functions: `mux_test.ts` (no network), `integration_test.ts`, `uploads_integration_test.ts` and `cleanup_integration_test.ts` (local stack only; Mux is stubbed and never contacted). |
| `templates/` | Auth email templates. `sign_in_code.html` carries the 6-digit code and no link; it is used for the confirmation (new account), magic link (returning account) and recovery emails. |
| `.env.example` | Names of the provider secrets the CLI needs. Copy to `.env` (git-ignored). |

## Principles

- The acting user is always `auth.uid()` on the server. No function takes a user id from the app.
- Row Level Security is on for every table. Reads are opened per table; writes only happen inside
  `SECURITY DEFINER` functions, which validate the product rules (18+, beta access, username rules).
- Team-only functions (`team_create_invite`, `team_admit_from_waitlist`, `signin_providers_for_email`)
  are executable by the service role only.
- Storage: the `avatars` bucket is public to read; a person writes only inside `<account id>/`.

## Local development

```bash
supabase start            # starts Postgres, Auth, Storage, Mailpit and the Edge runtime, applies migrations and the seed
supabase test db          # pgTAP tests
supabase db reset         # rebuild the local database from migrations + seed
scripts/create-invite.sh  # create a test invite code
deno test --allow-env supabase/functions/_tests/mux_test.ts   # Mux helpers and webhook signatures
```

The integration tests need the local stack's URL and keys (from `supabase status -o env`) as
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, and refuse any host but
`127.0.0.1` or `localhost`:

```bash
deno test --allow-env --allow-net supabase/functions/_tests/integration_test.ts
deno test --allow-env --allow-net supabase/functions/_tests/uploads_integration_test.ts
deno test --allow-env --allow-net supabase/functions/_tests/cleanup_integration_test.ts
```

## Video uploads

`mux-create-upload` records every Mux upload URL in `video_uploads` against the member it was
minted for (migration `20261012000100_video_uploads.sql`). The member's own session reserves a slot
first (`reserve_video_upload`: suspended, posting-paused and deleted accounts are refused; at most
10 an hour, 30 a day and 3 unused active URLs per account, answered with 429 and `Retry-After`);
the service role then records Mux's upload id (`activate_video_upload`) or gives the slot back when
Mux refused (`fail_video_upload`). `post_response`, `post_reply`, `post_draft` and
`retry_response_upload` claim the upload once, for its owner, before it expires
(`upload_not_found`, `upload_already_used`, `upload_expired`, `upload_cancelled`). Post Review
mints as it opens, so re-recording leaves unused URLs: at the 3-URL cap the oldest abandoned one
(unclaimed, over 15 s old) is cancelled at Mux if Mux reports it `waiting`, and its slot is freed
only once Mux confirms (`begin_upload_cancellation`, `finish_upload_cancellation`). Cancelled URLs
still count towards the hour and the day. `mark_response_live` takes the
asset's Mux `passthrough` and leaves the video unchanged unless it is the author (`owner_mismatch`).

## Deleting videos at Mux (security stage 3)

Deleting, removing or purging a video hides it in the database at once (every read path,
`video_visible`, now also needs a playback id). What has to change at Mux is queued in
`mux_cleanup_jobs` by the same transaction (migration `20261012000200_video_deletion_cleanup.sql`)
and done by the `mux-cleanup` Edge Function:

| Event | At Mux |
|---|---|
| An author deletes or abandons a video, or replaces a draft or an upload | The asset is deleted (or the upload cancelled, if Mux has no asset yet) |
| A moderator removes a video | Public playback is deleted now; the asset is deleted 30 days after the case closes (the removal, or the review decision; a pending review keeps it) |
| A moderator restores it (or a review reverses it) | A new public playback id, while the asset is kept |
| An account is deleted / restored by signing in | Playback off for all its videos / back on |
| The purge (day 30) | Every asset of the account is deleted; a removed video keeps its retention |
| A ready event for an upload no video took, or for a deleted video | The asset is deleted (an unused URL only once it has expired) |
| The daily sweep finds an asset nothing uses | Deleted if the ledger proves whose it is; otherwise listed for review, never touched |

Before any change the worker reads the object at Mux and checks that its passthrough and upload id
are the recorded owner's; when a deletion is leased the database re-checks, under row locks, that
no live, processing or draft video uses the asset and no retention applies. One job per asset runs
at a time; failures retry after 1, 2, 4 … minutes (at most 6 hours), ten attempts, then `failed`.
The purge makes tombstones of videos and comments that other people's replies point at, anonymises
the account's moderation records (deleted 90 days later by `prune_moderation_records`) and records
an account it cannot remove in `account_purge_failures` without stopping the others.

The worker runs like `send-push`: pg_cron every minute (and a sweep daily) through pg_net, with two
Vault secrets and one function secret. Until they exist nothing is called and jobs wait.

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/mux-cleanup', 'mux_cleanup_url');
select vault.create_secret('<a long random string>', 'mux_cleanup_key');
```

```bash
supabase secrets set MUX_CLEANUP_KEY=<the same random string>
supabase functions deploy mux-cleanup --no-verify-jwt
```

What the queue is doing, and retrying a failed job (service role, SQL editor):

```sql
select public.mux_cleanup_overview();      -- counts, due, stuck, failed, review, purge failures
select public.mux_cleanup_retry('<job id>');
```

Email codes sent locally land in Mailpit at http://127.0.0.1:54324.

## Email sign-in

Six-digit codes, valid for an hour, at most one email per address every 60 seconds; Confirm email
is on, so a new account gets no session until its code is entered. Auth's email provider also
serves password sign-up and sign-in, which the app never uses; migration
`20261010000300_auth_hardening.sql` closes them: no password is stored (trigger on `auth.users`),
the custom access token hook (`[auth.hook.custom_access_token]`) issues no token for a password
session and none for an email code on an account that uses Apple or Google, and `pre_request`
refuses any token from a password session.

```bash
node scripts/auth-integration.mjs   # local stack only: sign-up, sign-in, refresh, the attacks above (~2.5 min)
```

## Hosted project

```bash
supabase link --project-ref <ref>
supabase db push --dry-run          # check the pending migrations first
supabase db push                    # apply migrations
supabase config diff --project-ref <ref>   # read-only; must show only the intended Auth changes
supabase config push                # only after the diff, and after the migrations (the token hook must exist)
supabase functions deploy auth-signin-method
LINKED=1 scripts/create-invite.sh   # create a real invite code
```

`config.toml` ends with a `[remotes.hosted]` block for `picvoavfxnajfjkqawju`: it keeps Apple and
Google off there and repeats that project's own db and storage values, so a push changes Auth only.
Never push without reading the diff.

## Push notifications (phase 4)

Activity rows queue deliveries in `push_outbox` according to each person's `notification_prefs`.
A pg_cron job (`send-push`, every minute) calls the `send-push` Edge Function through pg_net, which
sends through Expo's push service and marks each row. A second job (`tonight-prompt`, every 10
minutes) queues "Tonight: …" at about 18:30 in each account's timezone.

The sender needs two Vault secrets and one function secret, set once per environment and never
stored in a table the app can read:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_function_url');
select vault.create_secret('<a long random string>', 'push_function_key');
```

```bash
supabase secrets set PUSH_SENDER_KEY=<the same random string>
supabase functions deploy send-push --no-verify-jwt
```

Locally the URL is `http://supabase_edge_runtime_shortcut:8081/functions/v1/send-push` from inside
the database container, and `PUSH_SENDER_KEY` goes in `supabase/functions/.env`. Until the secrets
exist the sender does nothing; nothing is lost, rows wait in the outbox. Real delivery also needs
an EAS project id in the app (Expo push tokens) and APNs and FCM credentials on that project.

Provider credentials (Apple client id and secret, Google client ids and secret) are entered in
`supabase/.env` and pushed with `supabase config push`. They never go into the app.
