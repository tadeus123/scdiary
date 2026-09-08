-- Airsup tables. Isolated from diary. Service role only.

create table if not exists public.airsup_people (
  person_id uuid primary key default gen_random_uuid(),
  google_id text unique,
  email text not null default '',
  display_name text not null default '',
  listing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists airsup_people_email_lower_idx
  on public.airsup_people (lower(email))
  where email <> '';

create table if not exists public.airsup_plugin_tokens (
  token_hash text primary key,
  person_id uuid not null references public.airsup_people (person_id),
  refresh_hash text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.airsup_oauth_clients (
  client_id text primary key,
  client_secret_hash text,
  redirect_uris jsonb not null default '[]'::jsonb,
  client_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.airsup_oauth_codes (
  code_hash text primary key,
  client_id text not null,
  person_id uuid not null references public.airsup_people (person_id),
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.airsup_gmail_send (
  id text primary key,
  google_id text not null,
  email text not null,
  refresh_token_enc text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.airsup_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  participant_a uuid not null,
  participant_b uuid not null,
  status text not null default 'open',
  unmatched_from uuid,
  unmatched_text text,
  parked_for uuid,
  parked_text text,
  inflight uuid,
  wake_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint airsup_conversations_status_chk check (status in ('open', 'ended'))
);

create table if not exists public.airsup_messages (
  message_id bigint generated always as identity primary key,
  conversation_id uuid not null references public.airsup_conversations (conversation_id),
  from_person_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists airsup_messages_conv_idx
  on public.airsup_messages (conversation_id, created_at);
create index if not exists airsup_plugin_tokens_person_idx
  on public.airsup_plugin_tokens (person_id);

alter table public.airsup_people enable row level security;
alter table public.airsup_plugin_tokens enable row level security;
alter table public.airsup_oauth_clients enable row level security;
alter table public.airsup_oauth_codes enable row level security;
alter table public.airsup_gmail_send enable row level security;
alter table public.airsup_conversations enable row level security;
alter table public.airsup_messages enable row level security;

revoke all on table public.airsup_people from anon, authenticated, public;
revoke all on table public.airsup_plugin_tokens from anon, authenticated, public;
revoke all on table public.airsup_oauth_clients from anon, authenticated, public;
revoke all on table public.airsup_oauth_codes from anon, authenticated, public;
revoke all on table public.airsup_gmail_send from anon, authenticated, public;
revoke all on table public.airsup_conversations from anon, authenticated, public;
revoke all on table public.airsup_messages from anon, authenticated, public;

grant all on table public.airsup_people to service_role;
grant all on table public.airsup_plugin_tokens to service_role;
grant all on table public.airsup_oauth_clients to service_role;
grant all on table public.airsup_oauth_codes to service_role;
grant all on table public.airsup_gmail_send to service_role;
grant all on table public.airsup_conversations to service_role;
grant all on table public.airsup_messages to service_role;
