-- Airsup20 tables. Isolated from diary and airsup. Service role only.

create table if not exists public.airsup20_users (
  user_id uuid primary key default gen_random_uuid(),
  google_id text unique,
  email text not null default '',
  display_name text not null default '',
  picture text not null default '',
  locale text not null default '',
  google_profile jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists airsup20_users_email_lower_idx
  on public.airsup20_users (lower(email))
  where email <> '';

create table if not exists public.airsup20_listings (
  user_id uuid primary key references public.airsup20_users (user_id) on delete cascade,
  body jsonb not null default '{}'::jsonb,
  text_blob text not null default '',
  media jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.airsup20_facts (
  fact_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.airsup20_users (user_id) on delete cascade,
  statement text not null,
  confidence double precision not null default 0.5,
  source text not null default 'inferred',
  visibility text not null default 'endpoint_visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists airsup20_facts_user_idx on public.airsup20_facts (user_id);

create table if not exists public.airsup20_intents (
  intent_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.airsup20_users (user_id) on delete cascade,
  type text not null,
  object text not null,
  status text not null default 'active',
  strength double precision not null default 0.5,
  confidence double precision not null default 0.5,
  time_horizon text not null default '',
  conditions jsonb not null default '[]'::jsonb,
  visibility text not null default 'anonymously_matchable',
  source text not null default 'inferred',
  last_evidence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airsup20_intents_type_chk check (type in ('WANT', 'NEED', 'OFFER', 'OPEN_TO', 'AVOID')),
  constraint airsup20_intents_status_chk check (status in ('latent', 'considering', 'active', 'committed', 'paused', 'done'))
);

create index if not exists airsup20_intents_user_idx on public.airsup20_intents (user_id);
create index if not exists airsup20_intents_object_idx on public.airsup20_intents (object);

create table if not exists public.airsup20_intent_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.airsup20_intents (intent_id) on delete cascade,
  conversation_id uuid,
  message_id bigint,
  evidence_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists airsup20_intent_evidence_intent_idx on public.airsup20_intent_evidence (intent_id);

create table if not exists public.airsup20_raw_events (
  event_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.airsup20_users (user_id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists airsup20_raw_events_user_idx on public.airsup20_raw_events (user_id, created_at desc);

create table if not exists public.airsup20_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references public.airsup20_users (user_id),
  recipient_id uuid not null references public.airsup20_users (user_id),
  goal text not null default '',
  status text not null default 'open',
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint airsup20_conversations_status_chk check (status in ('open', 'ended'))
);

create index if not exists airsup20_conversations_initiator_idx on public.airsup20_conversations (initiator_id, updated_at desc);
create index if not exists airsup20_conversations_recipient_idx on public.airsup20_conversations (recipient_id, updated_at desc);

create table if not exists public.airsup20_messages (
  message_id bigint generated always as identity primary key,
  conversation_id uuid not null references public.airsup20_conversations (conversation_id) on delete cascade,
  from_role text not null,
  from_user_id uuid,
  body text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists airsup20_messages_conv_idx on public.airsup20_messages (conversation_id, created_at);

create table if not exists public.airsup20_inbox_items (
  item_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.airsup20_users (user_id) on delete cascade,
  from_user_id uuid references public.airsup20_users (user_id) on delete set null,
  conversation_id uuid,
  reason text not null default '',
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  constraint airsup20_inbox_status_chk check (status in ('unread', 'seen', 'acted', 'dismissed'))
);

create index if not exists airsup20_inbox_user_idx on public.airsup20_inbox_items (user_id, created_at desc);

create table if not exists public.airsup20_oauth_clients (
  client_id text primary key,
  client_secret_hash text,
  redirect_uris jsonb not null default '[]'::jsonb,
  client_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.airsup20_oauth_codes (
  code_hash text primary key,
  client_id text not null,
  user_id uuid not null references public.airsup20_users (user_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.airsup20_plugin_tokens (
  token_hash text primary key,
  user_id uuid not null references public.airsup20_users (user_id) on delete cascade,
  refresh_hash text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists airsup20_plugin_tokens_user_idx on public.airsup20_plugin_tokens (user_id);

create table if not exists public.airsup20_traces (
  trace_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.airsup20_users (user_id) on delete set null,
  tool_name text not null default '',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms double precision,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists airsup20_traces_user_idx on public.airsup20_traces (user_id, started_at desc);

create table if not exists public.airsup20_spans (
  span_id uuid primary key default gen_random_uuid(),
  trace_id uuid not null references public.airsup20_traces (trace_id) on delete cascade,
  parent_span_id uuid,
  name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms double precision,
  meta jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists airsup20_spans_trace_idx on public.airsup20_spans (trace_id, started_at);

alter table public.airsup20_users enable row level security;
alter table public.airsup20_listings enable row level security;
alter table public.airsup20_facts enable row level security;
alter table public.airsup20_intents enable row level security;
alter table public.airsup20_intent_evidence enable row level security;
alter table public.airsup20_raw_events enable row level security;
alter table public.airsup20_conversations enable row level security;
alter table public.airsup20_messages enable row level security;
alter table public.airsup20_inbox_items enable row level security;
alter table public.airsup20_oauth_clients enable row level security;
alter table public.airsup20_oauth_codes enable row level security;
alter table public.airsup20_plugin_tokens enable row level security;
alter table public.airsup20_traces enable row level security;
alter table public.airsup20_spans enable row level security;

revoke all on table public.airsup20_users from anon, authenticated, public;
revoke all on table public.airsup20_listings from anon, authenticated, public;
revoke all on table public.airsup20_facts from anon, authenticated, public;
revoke all on table public.airsup20_intents from anon, authenticated, public;
revoke all on table public.airsup20_intent_evidence from anon, authenticated, public;
revoke all on table public.airsup20_raw_events from anon, authenticated, public;
revoke all on table public.airsup20_conversations from anon, authenticated, public;
revoke all on table public.airsup20_messages from anon, authenticated, public;
revoke all on table public.airsup20_inbox_items from anon, authenticated, public;
revoke all on table public.airsup20_oauth_clients from anon, authenticated, public;
revoke all on table public.airsup20_oauth_codes from anon, authenticated, public;
revoke all on table public.airsup20_plugin_tokens from anon, authenticated, public;
revoke all on table public.airsup20_traces from anon, authenticated, public;
revoke all on table public.airsup20_spans from anon, authenticated, public;

grant all on table public.airsup20_users to service_role;
grant all on table public.airsup20_listings to service_role;
grant all on table public.airsup20_facts to service_role;
grant all on table public.airsup20_intents to service_role;
grant all on table public.airsup20_intent_evidence to service_role;
grant all on table public.airsup20_raw_events to service_role;
grant all on table public.airsup20_conversations to service_role;
grant all on table public.airsup20_messages to service_role;
grant all on table public.airsup20_inbox_items to service_role;
grant all on table public.airsup20_oauth_clients to service_role;
grant all on table public.airsup20_oauth_codes to service_role;
grant all on table public.airsup20_plugin_tokens to service_role;
grant all on table public.airsup20_traces to service_role;
grant all on table public.airsup20_spans to service_role;

grant usage, select on all sequences in schema public to service_role;
