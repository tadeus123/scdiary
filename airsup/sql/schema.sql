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

create table if not exists public.airsup_network_requests (
  request_id text primary key,
  conversation_id text not null,
  originating_endpoint uuid not null,
  target_endpoint uuid not null,
  request text not null default '',
  answer text not null default '',
  status text not null default 'waiting',
  response_sent_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airsup_network_requests_status_chk check (status in ('waiting', 'answered'))
);

create table if not exists public.airsup_network_messages (
  message_id text primary key,
  gmail_message_id text unique,
  request_id text not null,
  conversation_id text not null,
  message_type text not null,
  from_endpoint uuid not null,
  to_endpoint uuid not null,
  in_reply_to text,
  subject text not null default '',
  body text not null default '',
  channel text not null,
  already_processed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint airsup_network_messages_type_chk check (message_type in ('REQUEST', 'RESPONSE')),
  constraint airsup_network_messages_channel_chk check (channel in ('request_worker', 'response_worker', 'outbound'))
);

create index if not exists airsup_network_requests_origin_idx on public.airsup_network_requests (originating_endpoint, status);
create index if not exists airsup_network_requests_target_idx on public.airsup_network_requests (target_endpoint, status);
create index if not exists airsup_network_messages_request_idx on public.airsup_network_messages (request_id);

alter table public.airsup_network_requests enable row level security;
alter table public.airsup_network_messages enable row level security;

revoke all on table public.airsup_network_requests from anon, authenticated, public;
revoke all on table public.airsup_network_messages from anon, authenticated, public;
grant all on table public.airsup_network_requests to service_role;
grant all on table public.airsup_network_messages to service_role;
