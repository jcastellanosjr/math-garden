-- Math Garden database setup — paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.

create table if not exists public.kids (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  avatar     text not null default '🦊',
  color      text not null default '#2a9d8f',
  sort       int  not null default 0,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.puzzles (
  id           uuid primary key,                 -- generated on the iPad
  kid_id       uuid not null references public.kids(id) on delete cascade,
  game         text not null,                    -- 'kakooma_add' (later: kakooma_sub, kakooma_mul, ...)
  mode         text not null,                    -- 'practice' | 'race'
  started_at   timestamptz not null,
  duration_ms  int  not null,
  completed    boolean not null,
  mistakes     int  not null default 0,
  hints        int  not null default 0,
  stars        int  not null default 0,
  settings     jsonb not null,
  settings_sig text not null,
  created_at   timestamptz not null default now()
);
create index if not exists puzzles_kid_time on public.puzzles (kid_id, started_at);

create table if not exists public.attempts (     -- one row per tap
  id          bigint generated always as identity primary key,
  puzzle_id   uuid not null references public.puzzles(id) on delete cascade,
  kid_id      uuid not null references public.kids(id) on delete cascade,
  at          timestamptz not null,
  part        text not null,                     -- 'petal' | 'center'
  part_index  int  not null,
  numbers     int[] not null,
  target      int  not null,
  addends     int[] not null,
  picked      int  not null,
  correct     boolean not null,
  ms          int  not null,                     -- time since previous tap
  error_type  text,
  crosses_ten boolean not null,
  hint_shown  boolean not null default false
);
create index if not exists attempts_kid_time on public.attempts (kid_id, at);

-- ---------- Security ----------
-- Kids' iPads (not signed in) may: read the player list, and ADD puzzle results.
-- Only you (signed in) may change settings, read the detailed history, or delete anything.
alter table public.kids     enable row level security;
alter table public.puzzles  enable row level security;
alter table public.attempts enable row level security;

drop policy if exists kids_read      on public.kids;
drop policy if exists kids_parent    on public.kids;
drop policy if exists puzzles_add    on public.puzzles;
drop policy if exists puzzles_parent on public.puzzles;
drop policy if exists attempts_add   on public.attempts;
drop policy if exists attempts_parent on public.attempts;

create policy kids_read       on public.kids     for select to anon, authenticated using (true);
create policy kids_parent     on public.kids     for all    to authenticated using (true) with check (true);
create policy puzzles_add     on public.puzzles  for insert to anon, authenticated with check (true);
create policy puzzles_parent  on public.puzzles  for all    to authenticated using (true) with check (true);
create policy attempts_add    on public.attempts for insert to anon, authenticated with check (true);
create policy attempts_parent on public.attempts for all    to authenticated using (true) with check (true);

grant select                          on public.kids     to anon;
grant select, insert, update, delete  on public.kids     to authenticated;
grant insert                          on public.puzzles  to anon;
grant select, insert, update, delete  on public.puzzles  to authenticated;
grant insert                          on public.attempts to anon;
grant select, insert, update, delete  on public.attempts to authenticated;

-- Kid home page summary (stars, streak days, today's minutes, race bests) without exposing raw history.
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
                          group by settings_sig) b), '{}'::json)
  );
$$;
revoke all on function public.kid_summary(uuid, text) from public;
grant execute on function public.kid_summary(uuid, text) to anon, authenticated;
