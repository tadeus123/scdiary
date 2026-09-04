-- Isolated Airsup table. Applied to the tademehl.com Supabase project.
-- Server access is via SUPABASE_SERVICE_ROLE_KEY only.

create table if not exists public.airsup_profiles (
  google_id text primary key,
  email text not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.airsup_profiles enable row level security;

revoke all on table public.airsup_profiles from anon, authenticated, public;
grant all on table public.airsup_profiles to service_role;

comment on table public.airsup_profiles is 'Airsup onboarding profiles. Isolated. Drop with airsup/sql/drop.sql.';
