-- Private pre-enrollment records. Public visitors can submit only through the
-- Edge Function; they cannot query or insert this table through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  status text not null default 'pre_matricula'
    check (status in ('pre_matricula', 'matriculado', 'encerrado')),
  child_name text not null check (char_length(child_name) between 2 and 140),
  birth_date date not null,
  grade smallint not null check (grade between 1 and 5),
  school text,
  school_shift text,
  guardian_name text not null check (char_length(guardian_name) between 2 and 140),
  guardian_relation text not null,
  guardian_phone text not null,
  alternate_phone text,
  guardian_email text,
  authorized_pickup text,
  preferred_days text,
  desired_period text not null check (desired_period in ('matutino', 'vespertino', 'flexivel')),
  learning_goals text,
  support_needs text,
  allergies text,
  notes text,
  guardian_consent boolean not null check (guardian_consent is true),
  health_data_consent boolean not null default false,
  consent_version text not null,
  consented_at timestamptz not null default now()
);

alter table public.student_enrollments enable row level security;
revoke all on table public.student_enrollments from public, anon, authenticated;
grant all on table public.student_enrollments to service_role;

comment on table public.student_enrollments is
  'Dados de pré-matrícula de alunos. Somente a Edge Function e administradores autorizados devem acessá-los.';

create table if not exists private.pre_matricula_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count smallint not null default 1
);
alter table private.pre_matricula_rate_limits enable row level security;
revoke all on table private.pre_matricula_rate_limits from public, anon, authenticated;
grant all on table private.pre_matricula_rate_limits to service_role;

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
          else current_limit.attempt_count + 1
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

create or replace function private.purge_expired_pre_matriculas()
returns void
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  delete from public.student_enrollments
    where status = 'pre_matricula' and expires_at <= now();
  delete from private.pre_matricula_rate_limits
    where window_started_at <= now() - interval '1 day';
end;
$$;
revoke all on function private.purge_expired_pre_matriculas() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule(
  'purge-expired-pre-matriculas',
  '15 4 * * *',
  'select private.purge_expired_pre_matriculas()'
);
