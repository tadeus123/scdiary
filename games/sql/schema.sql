-- Games high score. Isolated from diary and airsup. Service role only.

create table if not exists public.games_highscore (
  id integer primary key default 1 check (id = 1),
  score integer not null default 0,
  wpm numeric not null default 0,
  mistakes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.games_highscore (id, score, wpm, mistakes)
values (1, 0, 0, 0)
on conflict (id) do nothing;

alter table public.games_highscore enable row level security;

revoke all on table public.games_highscore from anon, authenticated, public;
grant all on table public.games_highscore to service_role;
