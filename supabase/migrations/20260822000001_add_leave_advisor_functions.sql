-- Add leave advisor functions that were missed due to failed migration

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

grant execute on function public.calculate_employee_leave_advisor(uuid, uuid, date, date) to authenticated;

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

grant execute on function public.calculate_own_leave_advisor(uuid, date, date) to authenticated;