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
  target_schedule_id uuid;
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
  scheduled_hours numeric(8,2);
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

    if target_schedule_id is not null then
      select *
        into schedule_day
      from public.schedule_days sd
      where sd.work_schedule_id = target_schedule_id
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
    end if;

    if target_schedule_id is null and current_dow in (0, 6) then
      non_working_days := non_working_days + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'non_working_day'
      ));
      continue;
    end if;

    scheduled_hours := case
      when schedule_day.start_time is not null and schedule_day.end_time is not null then
        greatest(
          extract(epoch from (schedule_day.end_time - schedule_day.start_time)) / 3600
          - (greatest(coalesce(schedule_day.lunch_minutes, 0), 0)::numeric / 60),
          0
        )::numeric(8,2)
      else null
    end;

    scheduled_hours := coalesce(
      nullif(scheduled_hours, 0),
      nullif(schedule_day.paid_hours, 0),
      company_setting.standard_daily_hours,
      8
    );

    daily_hours := case
      when current_dow = 6 then scheduled_hours
      else 8::numeric(8,2)
    end;

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

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.24-saturday-leave-hours',
  'Time off hours now handle Saturdays correctly',
  'Normal working days deduct 8 hours, while Saturdays use the configured work rule hours.',
  array[
    'Monday to Friday leave days now deduct exactly 8 hours per working day.',
    'Saturday leave days use the Saturday hours configured in the employee or company work rule.',
    'Public holidays and non-working days are still skipped in the calculation.'
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
