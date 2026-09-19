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
  niche text not null default 'other', -- primary category slug from airsup/china/manufacturing-categories.js
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

create index if not exists airsup_china_companies_niche_idx
  on public.airsup_china_companies (niche);

create table if not exists public.airsup_china_tokens (
  token_hash text primary key,
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  email text not null,
  purpose text not null default 'verify',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint airsup_china_tokens_purpose_chk check (purpose in ('verify', 'login', 'claim'))
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

create table if not exists public.airsup_china_domain_allows (
  allow_id uuid primary key default gen_random_uuid(),
  domain text not null,
  contact_email text not null,
  source text not null default 'outreach',
  note text not null default '',
  claim_opened_at timestamptz,
  bounced_at timestamptz,
  bounce_type text,
  bounce_detail text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint airsup_china_domain_allows_source_chk check (source in ('outreach', 'manual', 'site'))
);

create unique index if not exists airsup_china_domain_allows_pair_idx
  on public.airsup_china_domain_allows (lower(domain), lower(contact_email));

create index if not exists airsup_china_domain_allows_domain_idx
  on public.airsup_china_domain_allows (lower(domain));

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
alter table public.airsup_china_domain_allows enable row level security;

revoke all on table public.airsup_china_companies from anon, authenticated, public;
revoke all on table public.airsup_china_tokens from anon, authenticated, public;
revoke all on table public.airsup_china_sessions from anon, authenticated, public;
revoke all on table public.airsup_china_inquiries from anon, authenticated, public;
revoke all on table public.airsup_china_threads from anon, authenticated, public;
revoke all on table public.airsup_china_messages from anon, authenticated, public;
revoke all on table public.airsup_china_domain_allows from anon, authenticated, public;

grant all on table public.airsup_china_companies to service_role;
grant all on table public.airsup_china_tokens to service_role;
grant all on table public.airsup_china_sessions to service_role;
grant all on table public.airsup_china_inquiries to service_role;
grant all on table public.airsup_china_threads to service_role;
grant all on table public.airsup_china_messages to service_role;
grant all on table public.airsup_china_domain_allows to service_role;

create table if not exists public.airsup_china_sources (
  source_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  source_type text not null default 'profile_backfill',
  source_reference text not null default '',
  visibility text not null default 'ops',
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint airsup_china_sources_visibility_chk check (visibility in ('buyer', 'ops', 'private'))
);

create index if not exists airsup_china_sources_company_idx
  on public.airsup_china_sources (company_id, created_at desc);

create table if not exists public.airsup_china_facts (
  fact_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  fact_type text not null,
  fact_key text not null,
  value text not null default '',
  unit text not null default '',
  source_id uuid references public.airsup_china_sources (source_id) on delete set null,
  source_type text not null default 'profile_backfill',
  source_reference text not null default '',
  confidence numeric not null default 0.55,
  supplier_confirmed boolean not null default false,
  visibility text not null default 'ops',
  first_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  constraint airsup_china_facts_visibility_chk check (visibility in ('buyer', 'ops', 'private'))
);

create unique index if not exists airsup_china_facts_current_idx
  on public.airsup_china_facts (company_id, fact_type, fact_key)
  where valid_until is null;

create index if not exists airsup_china_facts_company_idx
  on public.airsup_china_facts (company_id, fact_type);

create table if not exists public.airsup_china_funnel_events (
  event_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  event text not null,
  detail text not null default '',
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists airsup_china_funnel_events_company_idx
  on public.airsup_china_funnel_events (company_id, at desc);

alter table public.airsup_china_sources enable row level security;
alter table public.airsup_china_facts enable row level security;
alter table public.airsup_china_funnel_events enable row level security;

revoke all on table public.airsup_china_sources from anon, authenticated, public;
revoke all on table public.airsup_china_facts from anon, authenticated, public;
revoke all on table public.airsup_china_funnel_events from anon, authenticated, public;

grant all on table public.airsup_china_sources to service_role;
grant all on table public.airsup_china_facts to service_role;
grant all on table public.airsup_china_funnel_events to service_role;

-- Gap demand + project outcome flywheel
create table if not exists public.airsup_china_gap_demands (
  demand_id uuid primary key default gen_random_uuid(),
  query text not null default '',
  need_summary text not null default '',
  budget text not null default '',
  qty text not null default '',
  process_hint text not null default '',
  caller_person_id uuid,
  conversation_id uuid,
  status text not null default 'open',
  matched_company_id uuid references public.airsup_china_companies (company_id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airsup_china_gap_demands_status_chk check (status in ('open', 'outreach', 'filled', 'closed'))
);

create index if not exists airsup_china_gap_demands_status_idx
  on public.airsup_china_gap_demands (status, created_at desc);

create table if not exists public.airsup_china_gap_outreach (
  outreach_id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.airsup_china_gap_demands (demand_id) on delete cascade,
  company_id uuid references public.airsup_china_companies (company_id) on delete set null,
  domain text not null default '',
  email text not null default '',
  claim_link text not null default '',
  draft_text text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists airsup_china_gap_outreach_demand_idx
  on public.airsup_china_gap_outreach (demand_id, created_at desc);

create table if not exists public.airsup_china_projects (
  project_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  demand_id uuid references public.airsup_china_gap_demands (demand_id) on delete set null,
  conversation_id uuid,
  inquiry_id uuid,
  status text not null default 'open',
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airsup_china_projects_status_chk check (status in ('open', 'quoted', 'accepted', 'delayed', 'shipped', 'paid', 'closed'))
);

create unique index if not exists airsup_china_projects_conversation_idx
  on public.airsup_china_projects (conversation_id)
  where conversation_id is not null;

create index if not exists airsup_china_projects_company_idx
  on public.airsup_china_projects (company_id, updated_at desc);

create table if not exists public.airsup_china_project_events (
  event_id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.airsup_china_projects (project_id) on delete cascade,
  company_id uuid not null references public.airsup_china_companies (company_id) on delete cascade,
  event text not null,
  detail text not null default '',
  evidence text not null default '',
  promote_to_endpoint boolean not null default false,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint airsup_china_project_events_event_chk check (event in ('quoted', 'accepted', 'delayed', 'shipped', 'paid', 'note', 'cancelled'))
);

create index if not exists airsup_china_project_events_project_idx
  on public.airsup_china_project_events (project_id, created_at asc);

alter table public.airsup_china_gap_demands enable row level security;
alter table public.airsup_china_gap_outreach enable row level security;
alter table public.airsup_china_projects enable row level security;
alter table public.airsup_china_project_events enable row level security;

revoke all on table public.airsup_china_gap_demands from anon, authenticated, public;
revoke all on table public.airsup_china_gap_outreach from anon, authenticated, public;
revoke all on table public.airsup_china_projects from anon, authenticated, public;
revoke all on table public.airsup_china_project_events from anon, authenticated, public;

grant all on table public.airsup_china_gap_demands to service_role;
grant all on table public.airsup_china_gap_outreach to service_role;
grant all on table public.airsup_china_projects to service_role;
grant all on table public.airsup_china_project_events to service_role;
