create table if not exists public.company_employee_number_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  next_number integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint company_employee_number_counters_next_positive check (next_number > 0)
);

insert into public.company_employee_number_counters (
  company_id,
  next_number
)
select
  companies.id,
  greatest(
    coalesce(
      max(
        substring(employees.employee_number from '^EMP-([0-9]+)$')::integer
      ),
      0
    ),
    count(employees.id)::integer
  ) + 1
from public.companies
left join public.employees
  on employees.company_id = companies.id
group by companies.id
on conflict (company_id) do nothing;

create or replace function public.next_company_employee_number(
  target_company_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  allocated_number integer;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  insert into public.company_employee_number_counters (
    company_id,
    next_number
  )
  values (
    target_company_id,
    2
  )
  on conflict (company_id)
  do update
    set next_number = public.company_employee_number_counters.next_number + 1,
        updated_at = now()
  returning next_number - 1 into allocated_number;

  return 'EMP-' || lpad(allocated_number::text, 4, '0');
end;
$$;

grant execute on function public.next_company_employee_number(uuid) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-scale-phase-1',
  'Production scale readiness phase 1',
  'Employee numbering is now safer for concurrent usage, and the app has a health endpoint for production load balancing.',
  array[
    'Employee numbers are now allocated through Supabase using an atomic per-company counter.',
    'Concurrent employee creation is safer when the app runs across multiple Vercel or server instances.',
    'A health endpoint was added for production load balancers and uptime checks.',
    'Production scale-up documentation now explains the Phase 1 deployment expectations.'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at,
    is_published = true,
    updated_at = now();
