-- Math Garden v2 upgrade (word games + adventure). Paste into Supabase → SQL Editor → Run.
-- Safe to run more than once. Existing players, scores and error history are kept.

-- 1) Attempts can now come from word and reading games, not just math.
alter table public.attempts add column if not exists game     text not null default 'kakooma_add';
alter table public.attempts add column if not exists skill    text;   -- e.g. 'vowel_teams', or reading tier
alter table public.attempts add column if not exists item     text;   -- the word / sentence shown
alter table public.attempts add column if not exists response text;   -- what the child spelled or picked
alter table public.attempts add column if not exists answer   text;   -- the correct word / choice
alter table public.attempts alter column numbers     drop not null;
alter table public.attempts alter column target      drop not null;
alter table public.attempts alter column addends     drop not null;
alter table public.attempts alter column picked      drop not null;
alter table public.attempts alter column crosses_ten drop not null;

-- 2) Adventure progress, buddy creature, hats, skills (one row per child).
create table if not exists public.kid_state (
  kid_id     uuid primary key references public.kids(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.kid_state enable row level security;
drop policy if exists kid_state_parent on public.kid_state;
create policy kid_state_parent on public.kid_state for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.kid_state to authenticated;

-- iPads (not signed in) save progress only through this function.
create or replace function public.save_kid_state(p_kid uuid, p_state jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into kid_state (kid_id, state, updated_at)
  select p_kid, p_state, now() where exists (select 1 from kids where id = p_kid)
  on conflict (kid_id) do update set state = excluded.state, updated_at = now();
$$;
revoke all on function public.save_kid_state(uuid, jsonb) from public;
grant execute on function public.save_kid_state(uuid, jsonb) to anon, authenticated;

-- 3) Kid home summary now also returns adventure state.
create or replace function public.kid_summary(p_kid uuid, p_tz text default 'America/New_York')
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'stars',    coalesce((select sum(stars) from puzzles where kid_id = p_kid), 0),
    'puzzles',  (select count(*) from puzzles where kid_id = p_kid and completed),
    'today_ms', coalesce((select sum(duration_ms) from puzzles
                          where kid_id = p_kid
                            and (started_at at time zone p_tz)::date = (now() at time zone p_tz)::date), 0),
    'days',     coalesce((select json_agg(d) from (
                          select distinct to_char(started_at at time zone p_tz, 'YYYY-MM-DD') d
                          from puzzles where kid_id = p_kid and completed
                            and started_at > now() - interval '400 days') x), '[]'::json),
    'bests',    coalesce((select json_object_agg(settings_sig, best) from (
                          select settings_sig, min(duration_ms) best from puzzles
                          where kid_id = p_kid and mode = 'race' and completed
                          group by settings_sig) b), '{}'::json),
    'state',    (select state from kid_state where kid_id = p_kid)
  );
$$;
revoke all on function public.kid_summary(uuid, text) from public;
grant execute on function public.kid_summary(uuid, text) to anon, authenticated;
