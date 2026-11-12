-- Phase 7 corrections (Nemat, 9 Oct 2026).
-- The account-linked analytics identifier is pseudonymous, not anonymous: a random id that
-- never appears next to an email, name or username, but one the team could join back to an
-- account through public.accounts. The column keeps its name; the documentation changes.
comment on column public.accounts.analytics_id is 'Pseudonymous id on analytics events (SPEC.md Section 21): random, never the account id, joinable to the account only through this table.';
comment on table public.analytics_events is 'Product events (SPEC.md Section 21), keyed by the pseudonymous anon_id. Team-only; no email, name or username ever lands here.';
comment on column public.analytics_events.anon_id is 'accounts.analytics_id (pseudonymous), or a random per-request id for web visitors.';
