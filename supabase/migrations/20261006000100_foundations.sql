-- Phase 2 foundations (SPEC.md Sections 9, 13, 14).
-- Identity-level state lives in accounts; a profile exists only after the 18+ step
-- and beta access. Every write goes through a SECURITY DEFINER function that derives
-- the acting user from auth.uid(). Row Level Security is on for every table.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_config: one row of server settings (SPEC.md Section 14: invite_required,
-- invites per member, invite validity). Readable by signed-in users, written
-- only by the team (service role).
-- ---------------------------------------------------------------------------

create table public.app_config (
  id boolean primary key default true check (id),
  invite_required boolean not null default true,
  invites_per_member integer not null default 5 check (invites_per_member >= 0),
  invite_valid_days integer not null default 7 check (invite_valid_days > 0),
  updated_at timestamptz not null default now()
);

comment on table public.app_config is 'Single-row server settings. invite_required is the closed-beta switch (SPEC.md Section 14).';

insert into public.app_config default values;

create trigger app_config_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

alter table public.app_config enable row level security;

create policy "app_config: signed-in users can read"
  on public.app_config for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- beta_cohorts: an invite carries a cohort; the cohort maps to starting places
-- (SPEC.md Section 11). The place mapping itself arrives with phase 6.
-- ---------------------------------------------------------------------------

create table public.beta_cohorts (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.beta_cohorts is 'Closed-beta cohorts. The Canggu beta is the first (SPEC.md Section 1).';

insert into public.beta_cohorts (id, name) values ('canggu', 'Canggu');

alter table public.beta_cohorts enable row level security;

create policy "beta_cohorts: signed-in users can read"
  on public.beta_cohorts for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- accounts: one row per sign-in identity, created when the auth user is
-- created. Holds state that exists before (and without) a profile.
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  age_confirmed_at timestamptz,
  beta_cohort text references public.beta_cohorts (id)
);

comment on table public.accounts is 'Identity-level state (SPEC.md Section 13 "Account records"). The profile is a separate row created later.';
comment on column public.accounts.age_confirmed_at is 'Set by confirm_age() when the person answers Yes on A-Age.';
comment on column public.accounts.beta_cohort is 'Set when an invite is redeemed or the person is admitted from the waitlist.';

alter table public.accounts enable row level security;

create policy "accounts: read your own"
  on public.accounts for select
  to authenticated
  using (id = (select auth.uid()));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- invites: single-use readable codes (SPEC.md Section 14).
-- ---------------------------------------------------------------------------

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{2,8}$'),
  cohort text not null references public.beta_cohorts (id),
  inviter_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_by uuid references public.accounts (id) on delete set null,
  redeemed_at timestamptz,
  cancelled_at timestamptz,
  constraint invites_redeemed_pair check ((redeemed_by is null) = (redeemed_at is null))
);

comment on table public.invites is 'Closed-beta invite codes. inviter_id null means a team-created code.';

-- One redeemed invite per account.
create unique index invites_redeemed_by_key on public.invites (redeemed_by) where redeemed_by is not null;
create index invites_inviter_idx on public.invites (inviter_id);

alter table public.invites enable row level security;

create policy "invites: read the ones you sent or redeemed"
  on public.invites for select
  to authenticated
  using (inviter_id = (select auth.uid()) or redeemed_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- waitlist: identity plus a waitlist entry, no profile (SPEC.md Section 13/14).
-- ---------------------------------------------------------------------------

create table public.waitlist (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  admitted_at timestamptz,
  admitted_cohort text references public.beta_cohorts (id),
  constraint waitlist_admitted_pair check ((admitted_at is null) = (admitted_cohort is null))
);

comment on table public.waitlist is 'People waiting for beta access. The team admits by hand (team_admit_from_waitlist).';

alter table public.waitlist enable row level security;

create policy "waitlist: read your own entry"
  on public.waitlist for select
  to authenticated
  using (account_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles: a person's face, name and videos (SPEC.md Section 9).
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references public.accounts (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  username text not null unique check (username ~ '^[a-z0-9._]{3,24}$'),
  bio text check (bio is null or char_length(bio) <= 150),
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile. Never carries location. Limits: name 40, username 3-24 [a-z0-9._], bio 150.';
comment on column public.profiles.photo_path is 'Object path inside the avatars bucket: <account id>/<file>.';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: signed-in users can read"
  on public.profiles for select
  to authenticated
  using (true);
