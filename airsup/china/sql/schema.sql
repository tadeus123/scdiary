-- Airsup China company endpoints. Isolated from people Airsup and diary.
-- Drop with airsup/china/sql/drop.sql. Does not touch airsup_people or diary tables.

create table if not exists public.airsup_china_companies (
  company_id uuid primary key default gen_random_uuid(),
  domain text not null,
  website text not null default '',
  company_name text not null default '',
  company_name_en text not null default '',
  city text not null default '',
  contact_name text not null default '',
  contact_email text not null default '',
  locale text not null default 'zh',
  niche text not null default 'cnc',
  status text not null default 'pending',
  source text not null default 'web',
  profile jsonb not null default '{}'::jsonb,
  context text not null default '',
  goal text not null default '',
  actions jsonb not null default '[]'::jsonb,
  verified_at timestamptz,
  live_at timestamptz,
  last_email_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airsup_china_companies_status_chk check (status in ('pending', 'verified', 'live')),
  constraint airsup_china_companies_locale_chk check (locale in ('zh', 'en'))
);

create unique index if not exists airsup_china_companies_domain_idx
  on public.airsup_china_companies (lower(domain));

create index if not exists airsup_china_companies_status_idx
  on public.airsup_china_companies (status);

create table if not exists public.airsup_china_tokens (
  token_hash text primary key,
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  email text not null,
  purpose text not null default 'verify',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint airsup_china_tokens_purpose_chk check (purpose in ('verify', 'login'))
);

create table if not exists public.airsup_china_sessions (
  session_hash text primary key,
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.airsup_china_inquiries (
  inquiry_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  caller_person_id uuid,
  message text not null default '',
  reply text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists airsup_china_inquiries_company_idx
  on public.airsup_china_inquiries (company_id, created_at desc);

alter table public.airsup_china_inquiries
  add column if not exists conversation_id uuid;

create table if not exists public.airsup_china_threads (
  conversation_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  caller_person_id uuid,
  status text not null default 'open',
  rfq jsonb not null default '{}'::jsonb,
  notify_reasons jsonb not null default '[]'::jsonb,
  emailed_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airsup_china_threads_status_chk check (status in ('open', 'ended'))
);

create index if not exists airsup_china_threads_caller_idx
  on public.airsup_china_threads (caller_person_id, status);

create index if not exists airsup_china_threads_company_idx
  on public.airsup_china_threads (company_id, updated_at desc);

create table if not exists public.airsup_china_messages (
  message_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.airsup_china_threads (conversation_id) on delete cascade,
  role text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  constraint airsup_china_messages_role_chk check (role in ('buyer', 'factory'))
);

create index if not exists airsup_china_messages_thread_idx
  on public.airsup_china_messages (conversation_id, created_at);

alter table public.airsup_china_companies enable row level security;
alter table public.airsup_china_tokens enable row level security;
alter table public.airsup_china_sessions enable row level security;
alter table public.airsup_china_inquiries enable row level security;
alter table public.airsup_china_threads enable row level security;
alter table public.airsup_china_messages enable row level security;

revoke all on table public.airsup_china_companies from anon, authenticated, public;
revoke all on table public.airsup_china_tokens from anon, authenticated, public;
revoke all on table public.airsup_china_sessions from anon, authenticated, public;
revoke all on table public.airsup_china_inquiries from anon, authenticated, public;
revoke all on table public.airsup_china_threads from anon, authenticated, public;
revoke all on table public.airsup_china_messages from anon, authenticated, public;

grant all on table public.airsup_china_companies to service_role;
grant all on table public.airsup_china_tokens to service_role;
grant all on table public.airsup_china_sessions to service_role;
grant all on table public.airsup_china_inquiries to service_role;
grant all on table public.airsup_china_threads to service_role;
grant all on table public.airsup_china_messages to service_role;
