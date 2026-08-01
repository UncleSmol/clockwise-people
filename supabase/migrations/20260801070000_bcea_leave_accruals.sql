-- BCEA leave accruals and leave advisor
--
-- Admin functions:
--   calculate_company_leave_accruals   -> preview pro-rata accrual per employee
--   accrue_company_leave_balances      -> apply accruals (add or overwrite) with carry-over caps
--
-- Employee functions:
--   calculate_employee_leave_advisor   -> enriched calculation for the leave advisor
--   calculate_own_leave_advisor        -> actor-scoped wrapper for employees

create or replace function public.calculate_company_leave_accruals(
  target_leave_type_id uuid,
  period_start date,
  period_end date
)
returns table (
  employee_id uuid,
  full_name text,
  employee_number text,
  hours_worked numeric,
  accrued_hours numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  company_setting public.company_settings%rowtype;
  yearly_hours numeric(8,2);
  standard_annual_hours numeric(8,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if period_end < period_start then
    raise exception 'End date must be after start date';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and deleted_at is null;

  if not found then
    raise exception 'Leave rule could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and company_id = leave_type.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.has_any_company_role(leave_type.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can calculate leave accruals';
  end if;

  select *
    into company_setting
  from public.company_settings
  where company_id = leave_type.company_id;

  yearly_hours := coalesce((leave_type.accrual_rules->>'yearly_hours')::numeric, 0);
  standard_annual_hours := greatest(coalesce(company_setting.standard_monthly_hours, 173.33) * 12, 1);

  return query
  select
    e.id,
    e.full_name,
    e.employee_number,
    coalesce(worked.hours_worked, 0)::numeric as hours_worked,
    round(yearly_hours * (coalesce(worked.hours_worked, 0) / standard_annual_hours), 2)::numeric as accrued_hours
  from public.employees e
  left join (
    select te.employee_id, sum(te.normal_hours) as hours_worked
    from public.time_entries te
    where te.company_id = leave_type.company_id
      and te.deleted_at is null
      and te.status in ('submitted', 'approved', 'locked')
      and te.work_date between period_start and period_end
    group by te.employee_id
  ) worked on worked.employee_id = e.id
  where e.company_id = leave_type.company_id
    and e.deleted_at is null
    and e.employment_status = 'active'
  order by e.full_name asc;
end;
$$;

create or replace function public.accrue_company_leave_balances(
  target_leave_type_id uuid,
  period_start date,
  period_end date,
  add_to_balance boolean default true,
  entries jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  company_setting public.company_settings%rowtype;
  entry_item jsonb;
  target_employee_id uuid;
  target_accrued numeric(8,2);
  existing public.leave_balances%rowtype;
  balance public.leave_balances%rowtype;
  old_value jsonb;
  cap numeric(8,2);
  cap_value jsonb;
  affected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if period_end < period_start then
    raise exception 'End date must be after start date';
  end if;

  if jsonb_typeof(entries) <> 'array' then
    raise exception 'Accrual entries must be an array';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and deleted_at is null;

  if not found then
    raise exception 'Leave rule could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and company_id = leave_type.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.has_any_company_role(leave_type.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can load leave accruals';
  end if;

  select *
    into company_setting
  from public.company_settings
  where company_id = leave_type.company_id;

  cap_value := company_setting.leave_rules->'carry_over_hours';

  for entry_item in
    select * from jsonb_array_elements(entries)
  loop
    target_employee_id := nullif((entry_item->>'employee_id')::text, '')::uuid;
    target_accrued := (entry_item->>'accrued_hours')::numeric;

    if target_employee_id is null or target_accrued is null or target_accrued <= 0 then
      continue;
    end if;

    if not exists (
      select 1
      from public.employees
      where id = target_employee_id
        and company_id = leave_type.company_id
        and deleted_at is null
    ) then
      continue;
    end if;

    select *
      into existing
    from public.leave_balances
    where company_id = leave_type.company_id
      and employee_id = target_employee_id
      and leave_type_id = leave_type.id
    for update;

    old_value := null;
    if existing.id is not null then
      old_value := to_jsonb(existing);
    end if;

    if not found then
      insert into public.leave_balances (
        company_id,
        employee_id,
        leave_type_id,
        balance_hours,
        accrued_hours,
        adjusted_hours,
        as_of_date
      )
      values (
        leave_type.company_id,
        target_employee_id,
        leave_type.id,
        target_accrued,
        target_accrued,
        case when add_to_balance then 0 else target_accrued end,
        period_end
      )
      returning * into balance;
    elsif add_to_balance then
      update public.leave_balances
      set balance_hours = balance_hours + target_accrued,
          accrued_hours = accrued_hours + target_accrued,
          as_of_date = period_end,
          updated_at = now()
      where id = existing.id
      returning * into balance;
    else
      update public.leave_balances
      set balance_hours = target_accrued,
          accrued_hours = target_accrued,
          adjusted_hours = target_accrued,
          as_of_date = period_end,
          updated_at = now()
      where id = existing.id
      returning * into balance;
    end if;

    cap := null;
    if cap_value is not null then
      if jsonb_typeof(cap_value) = 'number' then
        cap := cap_value::numeric;
      elsif jsonb_typeof(cap_value) = 'object' then
        cap := nullif(cap_value->>(leave_type.category)::text, '')::numeric;
      end if;
    end if;

    if cap is not null and balance.balance_hours > cap then
      update public.leave_balances
      set balance_hours = cap,
          updated_at = now()
      where id = balance.id
      returning * into balance;
    end if;

    insert into public.audit_logs (
      company_id,
      user_id,
      action,
      affected_table,
      record_id,
      old_value,
      new_value,
      reason
    )
    values (
      leave_type.company_id,
      actor.id,
      'adjust',
      'leave_balances',
      balance.id,
      old_value,
      to_jsonb(balance),
      'BCEA accrual loaded'
    );

    affected_count := affected_count + 1;
  end loop;

  return jsonb_build_object('affected', affected_count);
end;
$$;

create or replace function public.calculate_employee_leave_advisor(
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
  calculated jsonb;
  target_schedule_id uuid;
  return_day date;
  is_working boolean;
  daily_hours numeric(5,2);
  total_hours numeric(8,2);
  schedule_day public.schedule_days%rowtype;
  holiday public.company_public_holidays%rowtype;
  loop_limit integer := 0;
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
    into company_setting
  from public.company_settings
  where company_id = employee.company_id;

  calculated := public.calculate_employee_leave_request_hours(
    target_employee_id,
    target_leave_type_id,
    request_start_date,
    request_end_date
  );

  total_hours := (calculated->>'total_hours')::numeric(8,2);
  daily_hours := coalesce(company_setting.standard_daily_hours, 8);

  target_schedule_id := employee.work_schedule_id;
  if target_schedule_id is null then
    select ws.id
      into target_schedule_id
    from public.work_schedules ws
    where ws.company_id = employee.company_id
      and ws.scope = 'company'
      and ws.is_active
      and ws.deleted_at is null
    order by ws.created_at desc
    limit 1;
  end if;

  return_day := request_end_date;
  loop
    loop_limit := loop_limit + 1;
    if loop_limit > 366 then
      exit;
    end if;

    return_day := return_day + 1;
    is_working := true;

    select *
      into holiday
    from public.company_public_holidays cph
    where cph.company_id = employee.company_id
      and cph.holiday_date = return_day
      and cph.deleted_at is null
    limit 1;

    if found then
      is_working := false;
      continue;
    end if;

    schedule_day := null;
    if target_schedule_id is not null then
      select *
        into schedule_day
      from public.schedule_days sd
      where sd.work_schedule_id = target_schedule_id
        and sd.day_of_week = extract(dow from return_day)::integer
      limit 1;

      if not found or not coalesce(schedule_day.is_working_day, false) then
        is_working := false;
        continue;
      end if;
    elsif extract(dow from return_day)::integer in (0, 6) then
      is_working := false;
      continue;
    end if;

    if is_working then
      exit;
    end if;
  end loop;

  return calculated || jsonb_build_object(
    'requires_attachment', leave_type.requires_attachment,
    'standard_daily_hours', daily_hours,
    'days_equivalent', round(total_hours / nullif(daily_hours, 0), 2),
    'expected_return_date', return_day
  );
end;
$$;

create or replace function public.calculate_own_leave_advisor(
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
  actor public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
    and employee_id is not null
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'No active employee account is linked to this login';
  end if;

  return public.calculate_employee_leave_advisor(
    actor.employee_id,
    target_leave_type_id,
    request_start_date,
    request_end_date
  );
end;
$$;

grant execute on function public.calculate_company_leave_accruals(uuid, date, date) to authenticated;
grant execute on function public.accrue_company_leave_balances(uuid, date, date, boolean, jsonb) to authenticated;
grant execute on function public.calculate_employee_leave_advisor(uuid, uuid, date, date) to authenticated;
grant execute on function public.calculate_own_leave_advisor(uuid, date, date) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.1-bcea-leave-accruals-and-my-time-hub',
  'BCEA leave accruals and My time hub',
  'Admins can load pro-rata BCEA leave accruals across the company, and employees get a single My time flow with a leave advisor.',
  array[
    'Admins can preview and load leave accruals for every employee, pro-rated by hours worked against BCEA yearly entitlements (annual, sick, family responsibility).',
    'Accruals are recorded in hours, can be added to existing balances or overwrite them, and respect carry-over caps from company rules.',
    'Every accrual load is written to the audit trail.',
    'Employees get a single My time hub: clock, review and adjust, submit, and leave under one flow instead of separate tabs.',
    'A leave advisor shows hours to be taken, converted to days, the leave start date, the expected return-to-work date, and whether supporting documents are required.'
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
