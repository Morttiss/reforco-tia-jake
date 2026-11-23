-- Count every POST attempt (including malformed submissions) and cap the
-- counter so a single abusive IP cannot overflow the smallint column.
create or replace function public.consume_pre_matricula_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_attempt_count smallint;
begin
  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then
    return false;
  end if;

  insert into private.pre_matricula_rate_limits as current_limit
    (ip_hash, window_started_at, attempt_count)
  values (p_ip_hash, now(), 1)
  on conflict (ip_hash) do update
    set attempt_count = case
          when current_limit.window_started_at <= now() - interval '15 minutes' then 1
          else least(current_limit.attempt_count::integer + 1, 4)::smallint
        end,
        window_started_at = case
          when current_limit.window_started_at <= now() - interval '15 minutes' then now()
          else current_limit.window_started_at
        end
  returning attempt_count into v_attempt_count;

  return v_attempt_count <= 3;
end;
$$;
revoke all on function public.consume_pre_matricula_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_pre_matricula_rate_limit(text) to service_role;
