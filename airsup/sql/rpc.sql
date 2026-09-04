create unique index if not exists airsup_calls_one_open_pair
  on public.airsup_calls (
    least(caller_endpoint, callee_endpoint),
    greatest(caller_endpoint, callee_endpoint)
  )
  where status in ('ringing', 'live', 'ending');

create or replace function public.airsup_match_people(
  query_embedding extensions.vector,
  match_count integer default 8,
  exclude_endpoint uuid default null
)
returns table(endpoint_id uuid, score double precision)
language sql
stable
as $$
  select k.endpoint_id,
         (1 - (k.embedding <=> query_embedding))::double precision as score
  from public.airsup_knowledge k
  where k.embedding is not null
    and (exclude_endpoint is null or k.endpoint_id <> exclude_endpoint)
  order by k.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 8), 20));
$$;

create or replace function public.airsup_append_call_message(
  p_call_id text,
  p_from uuid,
  p_kind text,
  p_body text
)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update public.airsup_calls
  set last_seq = last_seq + 1, updated_at = now()
  where call_id = p_call_id
  returning last_seq into n;
  if n is null then
    raise exception 'Unknown call_id';
  end if;
  insert into public.airsup_call_messages (call_id, seq, from_endpoint, kind, body)
  values (p_call_id, n, p_from, coalesce(p_kind, 'chat'), coalesce(p_body, ''));
  return n;
end;
$$;

create or replace function public.airsup_pickup_call(p_call_id text, p_endpoint uuid)
returns airsup_calls
language plpgsql
as $$
declare
  row public.airsup_calls;
begin
  update public.airsup_calls
  set status = 'live', updated_at = now()
  where call_id = p_call_id
    and callee_endpoint = p_endpoint
    and status in ('ringing', 'live')
  returning * into row;
  if row.call_id is null then
    select * into row from public.airsup_calls where call_id = p_call_id;
  end if;
  return row;
end;
$$;

create or replace function public.airsup_hang_up(p_call_id text, p_endpoint uuid)
returns airsup_calls
language plpgsql
as $$
declare
  row public.airsup_calls;
begin
  update public.airsup_calls
  set
    caller_hangup = caller_hangup or (caller_endpoint = p_endpoint),
    callee_hangup = callee_hangup or (callee_endpoint = p_endpoint),
    status = case
      when status = 'ended' then 'ended'
      when status = 'ringing' then 'ended'
      when (caller_hangup or caller_endpoint = p_endpoint)
       and (callee_hangup or callee_endpoint = p_endpoint) then 'ended'
      else 'ending'
    end,
    ended_at = case
      when status = 'ended' then ended_at
      when status = 'ringing' then now()
      when (caller_hangup or caller_endpoint = p_endpoint)
       and (callee_hangup or callee_endpoint = p_endpoint) then now()
      else ended_at
    end,
    updated_at = now()
  where call_id = p_call_id
    and (caller_endpoint = p_endpoint or callee_endpoint = p_endpoint)
  returning * into row;
  if row.call_id is null then
    raise exception 'Unknown call_id or not a party';
  end if;
  return row;
end;
$$;

create or replace function public.airsup_expire_stale_calls()
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update public.airsup_calls
  set status = 'ended', ended_at = coalesce(ended_at, now()), updated_at = now()
  where status = 'ringing' and created_at < now() - interval '15 minutes';
  get diagnostics n = row_count;
  update public.airsup_calls
  set status = 'ended', ended_at = coalesce(ended_at, now()), updated_at = now()
  where status = 'ending' and updated_at < now() - interval '10 minutes';
  update public.airsup_calls
  set status = 'ended', ended_at = coalesce(ended_at, now()), updated_at = now()
  where status = 'live' and updated_at < now() - interval '30 minutes';
  return n;
end;
$$;
