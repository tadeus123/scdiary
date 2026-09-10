-- Drop all Airsup tables. Does not touch diary tables.

drop table if exists public.airsup_china_messages;
drop table if exists public.airsup_china_threads;
drop table if exists public.airsup_china_inquiries;
drop table if exists public.airsup_china_sessions;
drop table if exists public.airsup_china_tokens;
drop table if exists public.airsup_china_companies;

drop function if exists public.airsup_append_call_message cascade;
drop function if exists public.airsup_expire_stale_calls cascade;
drop function if exists public.airsup_hang_up cascade;
drop function if exists public.airsup_match_people cascade;
drop function if exists public.airsup_pickup_call cascade;

drop table if exists public.airsup_messages;
drop table if exists public.airsup_conversations;
drop table if exists public.airsup_gmail_send;
drop table if exists public.airsup_oauth_codes;
drop table if exists public.airsup_plugin_tokens;
drop table if exists public.airsup_oauth_clients;
drop table if exists public.airsup_people;
drop table if exists public.airsup_call_messages;
drop table if exists public.airsup_calls;
drop table if exists public.airsup_knowledge;
drop table if exists public.airsup_network_messages;
drop table if exists public.airsup_network_requests;
drop table if exists public.airsup_endpoints;
drop table if exists public.airsup_profiles;
