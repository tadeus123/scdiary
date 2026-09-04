-- Isolated Airsup tables. Applied to the tademehl.com Supabase project.
-- Server access is via SUPABASE_SERVICE_ROLE_KEY only.

create table if not exists public.airsup_profiles (
  google_id text primary key,
  email text not null,
  display_name text not null default '',
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.airsup_profiles enable row level security;

revoke all on table public.airsup_profiles from anon, authenticated, public;
grant all on table public.airsup_profiles to service_role;

create table if not exists public.airsup_endpoints (
  endpoint_id uuid primary key default gen_random_uuid(),
  google_id text not null unique,
  display_name text not null default '',
  endpoint_email text not null,
  help_with text not null default '',
  need_help_with text not null default '',
  desired_person text not null default '',
  active boolean not null default true,
  contactable boolean not null default true,
  share_help boolean not null default true,
  share_need boolean not null default true,
  share_desired_person boolean not null default true,
  match_card jsonb not null default '{}'::jsonb,
  card_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.airsup_endpoints enable row level security;

revoke all on table public.airsup_endpoints from anon, authenticated, public;
grant all on table public.airsup_endpoints to service_role;
