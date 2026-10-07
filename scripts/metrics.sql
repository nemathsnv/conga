-- Beta metrics as proposed in SPEC.md Section 21, over public.analytics_events.
-- Run with the service role (psql, or supabase db query). Weeks start on Monday (UTC).
-- Nothing here joins back to a person: anon_id is the anonymous id on the account.

-- Weekly responders: people who published at least one response or reply in the week.
select date_trunc('week', received_at)::date as week, count(distinct anon_id) as weekly_responders
from public.analytics_events
where name = 'video_published' and props->>'kind' in ('response', 'reply')
group by 1 order by 1;

-- Response rate per prompt: responders ÷ people who watched at least one response to that prompt.
with watched as (
  select props->>'prompt_id' as prompt_id, anon_id from public.analytics_events where name = 'response_viewed' group by 1, 2
), responded as (
  select props->>'prompt_id' as prompt_id, anon_id from public.analytics_events where name = 'record_completed' and props->>'kind' = 'response' group by 1, 2
)
select w.prompt_id,
       count(distinct w.anon_id) as watchers,
       count(distinct r.anon_id) as responders,
       round(count(distinct r.anon_id)::numeric / nullif(count(distinct w.anon_id), 0), 3) as response_rate
from watched w left join responded r on r.prompt_id = w.prompt_id and r.anon_id = w.anon_id
group by 1 order by watchers desc;

-- Reply rate: share of responses that get at least one video reply (from the product tables).
select round(count(*) filter (where exists (select 1 from public.responses x where x.root_response_id = r.id and x.kind = 'reply' and x.status = 'live'))::numeric / nullif(count(*), 0), 3) as reply_rate
from public.responses r where r.kind = 'response' and r.status = 'live';

-- Day-7 return: share of new members active again 7 days after joining.
with joined as (
  select anon_id, min(received_at) as joined_at from public.analytics_events where name = 'signup_completed' group by 1
)
select date_trunc('week', joined_at)::date as cohort_week,
       count(*) as new_members,
       count(*) filter (where exists (select 1 from public.analytics_events e where e.anon_id = j.anon_id and e.received_at >= j.joined_at + interval '7 days' and e.received_at < j.joined_at + interval '8 days')) as returned_day_7,
       round(count(*) filter (where exists (select 1 from public.analytics_events e where e.anon_id = j.anon_id and e.received_at >= j.joined_at + interval '7 days' and e.received_at < j.joined_at + interval '8 days'))::numeric / nullif(count(*), 0), 3) as day_7_return
from joined j
where joined_at < now() - interval '8 days'
group by 1 order by 1;
