-- Drop Airsup20 tables. Run only when removing the slice.

drop table if exists public.airsup20_spans cascade;
drop table if exists public.airsup20_traces cascade;
drop table if exists public.airsup20_plugin_tokens cascade;
drop table if exists public.airsup20_oauth_codes cascade;
drop table if exists public.airsup20_oauth_clients cascade;
drop table if exists public.airsup20_inbox_items cascade;
drop table if exists public.airsup20_messages cascade;
drop table if exists public.airsup20_conversations cascade;
drop table if exists public.airsup20_raw_events cascade;
drop table if exists public.airsup20_intent_evidence cascade;
drop table if exists public.airsup20_intents cascade;
drop table if exists public.airsup20_facts cascade;
drop table if exists public.airsup20_listings cascade;
drop table if exists public.airsup20_users cascade;
