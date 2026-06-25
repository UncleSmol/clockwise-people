create table if not exists public.employee_work_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_schedule_id uuid not null references public.work_schedules(id) on delete cascade,
  effective_from date not null default current_date,
  effective_to date,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint employee_work_schedule_dates_valid check (effective_to is null or effective_to >= effective_from)
);

create trigger employee_work_schedule_assignments_set_updated_at
before update on public.employee_work_schedule_assignments
for each row execute function public.set_updated_at();

create index if not exists idx_employee_work_schedule_assignments_employee
on public.employee_work_schedule_assignments(company_id, employee_id, is_active)
where deleted_at is null;

create unique index if not exists idx_employee_work_schedule_assignments_active_unique
on public.employee_work_schedule_assignments(company_id, employee_id, work_schedule_id)
where deleted_at is null and is_active;

alter table public.employee_work_schedule_assignments enable row level security;

create policy "company members can view employee work schedule assignments"
on public.employee_work_schedule_assignments for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage employee work schedule assignments"
on public.employee_work_schedule_assignments for all
to authenticated
using (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]))
with check (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]));

insert into public.employee_work_schedule_assignments (
  company_id,
  employee_id,
  work_schedule_id,
  priority
)
select
  employees.company_id,
  employees.id,
  employees.work_schedule_id,
  0
from public.employees
where employees.work_schedule_id is not null
  and employees.deleted_at is null
on conflict do nothing;

create or replace function public.set_employee_work_schedule_assignments(
  target_employee_id uuid,
  target_work_schedule_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  employee public.employees%rowtype;
  schedule_count integer := 0;
  first_schedule_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Employee could not be found';
  end if;

  if not public.has_any_company_role(employee.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can assign work rules';
  end if;

  create temporary table if not exists selected_work_schedules (
    work_schedule_id uuid primary key,
    priority integer not null
  ) on commit drop;

  truncate table selected_work_schedules;

  insert into selected_work_schedules (work_schedule_id, priority)
  select
    value::uuid,
    row_number() over ()::integer
  from unnest(coalesce(target_work_schedule_ids, '{}'::uuid[])) as value
  where value is not null;

  if exists (
    select 1
    from selected_work_schedules selected
    left join public.work_schedules schedules
      on schedules.id = selected.work_schedule_id
     and schedules.company_id = employee.company_id
     and schedules.deleted_at is null
    where schedules.id is null
  ) then
    raise exception 'One or more work rules do not belong to this company';
  end if;

  update public.employee_work_schedule_assignments
  set is_active = false,
      deleted_at = now()
  where company_id = employee.company_id
    and employee_id = employee.id
    and deleted_at is null
    and work_schedule_id not in (
      select selected.work_schedule_id from selected_work_schedules selected
    );

  insert into public.employee_work_schedule_assignments (
    company_id,
    employee_id,
    work_schedule_id,
    priority,
    is_active,
    deleted_at
  )
  select
    employee.company_id,
    employee.id,
    selected.work_schedule_id,
    selected.priority,
    true,
    null
  from selected_work_schedules selected
  on conflict (company_id, employee_id, work_schedule_id)
  where deleted_at is null and is_active
  do update set
    priority = excluded.priority,
    is_active = true,
    deleted_at = null,
    updated_at = now();

  select work_schedule_id
    into first_schedule_id
  from selected_work_schedules
  order by priority
  limit 1;

  update public.employees
  set work_schedule_id = first_schedule_id,
      updated_at = now()
  where id = employee.id;

  get diagnostics schedule_count = row_count;

  return (select count(*) from selected_work_schedules);
end;
$$;

create or replace function public.calculate_employee_leave_request_hours(
  target_employee_id uuid,
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  employee public.employees%rowtype;
  company_setting public.company_settings%rowtype;
  leave_type public.leave_types%rowtype;
  leave_balance public.leave_balances%rowtype;
  assigned_rule_count integer := 0;
  total_hours numeric(8,2) := 0;
  available_hours numeric(8,2) := 0;
  working_days integer := 0;
  public_holiday_count integer := 0;
  non_working_days integer := 0;
  detail jsonb := '[]'::jsonb;
  current_day date;
  current_dow integer;
  schedule_day public.schedule_days%rowtype;
  holiday public.company_public_holidays%rowtype;
  daily_hours numeric(8,2);
begin
  if request_end_date < request_start_date then
    raise exception 'End date must be after start date';
  end if;

  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if not found then
    raise exception 'Employee could not be found';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = employee.company_id
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Time off type could not be found';
  end if;

  select *
    into leave_balance
  from public.leave_balances
  where company_id = employee.company_id
    and employee_id = employee.id
    and leave_type_id = leave_type.id;

  available_hours := coalesce(leave_balance.balance_hours, 0);

  select *
    into company_setting
  from public.company_settings
  where company_id = employee.company_id;

  select count(*)
    into assigned_rule_count
  from public.employee_work_schedule_assignments assignments
  where assignments.company_id = employee.company_id
    and assignments.employee_id = employee.id
    and assignments.is_active
    and assignments.deleted_at is null
    and assignments.effective_from <= request_end_date
    and (assignments.effective_to is null or assignments.effective_to >= request_start_date);

  for current_day in
    select generate_series(request_start_date, request_end_date, interval '1 day')::date
  loop
    current_dow := extract(dow from current_day)::integer;

    select *
      into holiday
    from public.company_public_holidays cph
    where cph.company_id = employee.company_id
      and cph.holiday_date = current_day
      and cph.deleted_at is null
    limit 1;

    if found then
      public_holiday_count := public_holiday_count + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'public_holiday',
        'label', holiday.name
      ));
      continue;
    end if;

    schedule_day := null;

    if assigned_rule_count > 0 then
      select sd.*
        into schedule_day
      from public.employee_work_schedule_assignments assignments
      join public.work_schedules schedules
        on schedules.id = assignments.work_schedule_id
       and schedules.company_id = assignments.company_id
       and schedules.is_active
       and schedules.deleted_at is null
      join public.schedule_days sd
        on sd.work_schedule_id = schedules.id
       and sd.day_of_week = current_dow
       and sd.is_working_day
      where assignments.company_id = employee.company_id
        and assignments.employee_id = employee.id
        and assignments.is_active
        and assignments.deleted_at is null
        and assignments.effective_from <= current_day
        and (assignments.effective_to is null or assignments.effective_to >= current_day)
      order by assignments.priority desc, assignments.effective_from desc, assignments.created_at desc
      limit 1;

      if not found then
        non_working_days := non_working_days + 1;
        detail := detail || jsonb_build_array(jsonb_build_object(
          'date', current_day,
          'hours', 0,
          'reason', 'non_working_day'
        ));
        continue;
      end if;
    elsif employee.work_schedule_id is not null then
      select *
        into schedule_day
      from public.schedule_days sd
      where sd.work_schedule_id = employee.work_schedule_id
        and sd.day_of_week = current_dow
      limit 1;

      if not found or not coalesce(schedule_day.is_working_day, false) then
        non_working_days := non_working_days + 1;
        detail := detail || jsonb_build_array(jsonb_build_object(
          'date', current_day,
          'hours', 0,
          'reason', 'non_working_day'
        ));
        continue;
      end if;
    else
      select sd.*
        into schedule_day
      from public.work_schedules schedules
      join public.schedule_days sd
        on sd.work_schedule_id = schedules.id
       and sd.day_of_week = current_dow
       and sd.is_working_day
      where schedules.company_id = employee.company_id
        and schedules.scope = 'company'
        and schedules.is_active
        and schedules.deleted_at is null
      order by schedules.created_at desc
      limit 1;

      if not found and current_dow in (0, 6) then
        non_working_days := non_working_days + 1;
        detail := detail || jsonb_build_array(jsonb_build_object(
          'date', current_day,
          'hours', 0,
          'reason', 'non_working_day'
        ));
        continue;
      end if;
    end if;

    daily_hours := coalesce(
      nullif(schedule_day.paid_hours, 0),
      case
        when schedule_day.start_time is not null and schedule_day.end_time is not null then
          greatest(
            extract(epoch from (schedule_day.end_time - schedule_day.start_time)) / 3600
            - (greatest(coalesce(schedule_day.lunch_minutes, 0), 0)::numeric / 60),
            0
          )::numeric(8,2)
        else null
      end,
      company_setting.standard_daily_hours,
      8
    )::numeric(8,2);

    if daily_hours <= 0 then
      non_working_days := non_working_days + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'non_working_day'
      ));
      continue;
    end if;

    total_hours := total_hours + daily_hours;
    working_days := working_days + 1;
    detail := detail || jsonb_build_array(jsonb_build_object(
      'date', current_day,
      'hours', daily_hours,
      'reason', 'working_day'
    ));
  end loop;

  return jsonb_build_object(
    'available_hours', available_hours,
    'days', detail,
    'exceeds_balance', total_hours > available_hours,
    'leave_type_name', leave_type.name,
    'non_working_days', non_working_days,
    'public_holidays', public_holiday_count,
    'remaining_hours', available_hours - total_hours,
    'total_hours', total_hours,
    'working_days', working_days
  );
end;
$$;

grant execute on function public.set_employee_work_schedule_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.calculate_employee_leave_request_hours(uuid, uuid, date, date) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-smart-leave-rules',
  'Leave now follows assigned work rules',
  'Time off deductions now use the employee''s assigned work rules for each selected day.',
  array[
    'Employees can now be assigned more than one work rule.',
    'Leave deductions skip days that are not working days in the employee''s assigned rules.',
    'Saturday or weekend leave only deducts hours when the assigned rule says the employee works that day.',
    'Leave hours now use the configured paid hours for that specific work-rule day.'
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
