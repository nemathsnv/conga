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
| `functions/` | Edge Functions (Deno). `auth-signin-method` backs the E-Linked check. |
| `templates/` | Auth email templates. `magic_link.html` carries the 6-digit code. |
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

## Hosted project

```bash
supabase link --project-ref <ref>
supabase db push                    # apply migrations
supabase config push                # push config.toml (Auth providers, templates); needs supabase/.env
supabase functions deploy auth-signin-method
LINKED=1 scripts/create-invite.sh   # create a real invite code
```

Provider credentials (Apple client id and secret, Google client ids and secret) are entered in
`supabase/.env` and pushed with `supabase config push`. They never go into the app.
