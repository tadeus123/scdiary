-- Additive: outreach / manual domain↔email allowlist for Airsup China claims.
-- Safe to run on existing installs. Does not alter live company rows.

create table if not exists public.airsup_china_domain_allows (
  allow_id uuid primary key default gen_random_uuid(),
  domain text not null,
  contact_email text not null,
  source text not null default 'outreach',
  note text not null default '',
  claim_opened_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint airsup_china_domain_allows_source_chk check (source in ('outreach', 'manual', 'site'))
);

create unique index if not exists airsup_china_domain_allows_pair_idx
  on public.airsup_china_domain_allows (lower(domain), lower(contact_email));

create index if not exists airsup_china_domain_allows_domain_idx
  on public.airsup_china_domain_allows (lower(domain));

alter table public.airsup_china_domain_allows enable row level security;
revoke all on table public.airsup_china_domain_allows from anon, authenticated, public;
grant all on table public.airsup_china_domain_allows to service_role;

-- Allow claim purpose on existing token table (idempotent).
alter table public.airsup_china_tokens drop constraint if exists airsup_china_tokens_purpose_chk;
alter table public.airsup_china_tokens
  add constraint airsup_china_tokens_purpose_chk
  check (purpose in ('verify', 'login', 'claim'));
