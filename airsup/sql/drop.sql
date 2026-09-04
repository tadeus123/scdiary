-- Drop all Airsup tables. Run in the Supabase SQL editor when removing Airsup.

drop function if exists public.airsup_match_people(extensions.vector, integer, uuid);
drop table if exists public.airsup_call_messages;
drop table if exists public.airsup_calls;
drop table if exists public.airsup_knowledge;
drop table if exists public.airsup_network_messages;
drop table if exists public.airsup_network_requests;
drop table if exists public.airsup_endpoints;
drop table if exists public.airsup_profiles;
