-- Airsupdev OAuth tables. Isolated ops MCP auth. Removable with drop.sql.

create table if not exists public.airsupdev_users (
  user_id uuid primary key default gen_random_uuid(),
  google_id text not null unique,
  email text not null,
  display_name text not null default '',
  picture text not null default '',
  locale text not null default '',
  google_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists airsupdev_users_email_lower_idx
  on public.airsupdev_users (lower(email));

create table if not exists public.airsupdev_oauth_clients (
  client_id text primary key,
  client_secret_hash text,
  redirect_uris jsonb not null default '[]'::jsonb,
  client_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.airsupdev_oauth_codes (
  code_hash text primary key,
  client_id text not null references public.airsupdev_oauth_clients (client_id) on delete cascade,
  user_id uuid not null references public.airsupdev_users (user_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.airsupdev_plugin_tokens (
  token_hash text primary key,
  refresh_hash text,
  user_id uuid not null references public.airsupdev_users (user_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists airsupdev_plugin_tokens_user_idx
  on public.airsupdev_plugin_tokens (user_id);

alter table public.airsupdev_users enable row level security;
alter table public.airsupdev_oauth_clients enable row level security;
alter table public.airsupdev_oauth_codes enable row level security;
alter table public.airsupdev_plugin_tokens enable row level security;

revoke all on table public.airsupdev_users from anon, authenticated, public;
revoke all on table public.airsupdev_oauth_clients from anon, authenticated, public;
revoke all on table public.airsupdev_oauth_codes from anon, authenticated, public;
revoke all on table public.airsupdev_plugin_tokens from anon, authenticated, public;

grant all on table public.airsupdev_users to service_role;
grant all on table public.airsupdev_oauth_clients to service_role;
grant all on table public.airsupdev_oauth_codes to service_role;
grant all on table public.airsupdev_plugin_tokens to service_role;
