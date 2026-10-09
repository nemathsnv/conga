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
| `functions/` | Edge Functions (Deno). `auth-signin-method` backs the E-Linked check; `mux-create-upload`, `mux-upload-status` and `mux-webhook` carry video; `send-push` drains the push outbox. |
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
