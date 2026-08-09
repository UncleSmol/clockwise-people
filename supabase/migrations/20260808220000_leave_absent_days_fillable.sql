-- Allow leave to be filled on days the employee was absent (no timesheet rows).
--
-- The smart leave calculation reduced any day that did not resolve to a working
-- schedule day to 0 hours, which made submit_own_leave_request raise "The
-- selected dates do not include working hours" when an employee tried to request
-- leave for days they were absent on (for example, days that fell outside their
-- work schedule assignment's effective window could not match the strict
-- assignment lookup and were silently treated as non-working days).
--
-- Hours are still counted from scheduled working days only. For days without an
-- existing timesheet (absent days), the schedule lookup is now broadened to the
-- employee's own work schedule and the company-wide schedule, so a scheduled
-- working day with no timesheet is never blocked from leave. Truly non-working
-- days (weekends with no schedule) still produce 0 hours.

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
  absent boolean := false;
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

    select exists (
      select 1
      from public.time_entries te
      where te.company_id = employee.company_id
        and te.employee_id = employee.id
        and te.work_date = current_day
        and te.deleted_at is null
    )
      into absent;

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
        if absent then
          if employee.work_schedule_id is not null then
            select *
              into schedule_day
            from public.schedule_days sd
            where sd.work_schedule_id = employee.work_schedule_id
              and sd.day_of_week = current_dow
              and coalesce(sd.is_working_day, false)
            limit 1;
          end if;

          if schedule_day is null then
            select sd.*
              into schedule_day
            from public.work_schedules schedules
            join public.schedule_days sd
              on sd.work_schedule_id = schedules.id
             and sd.day_of_week = current_dow
             and coalesce(sd.is_working_day, false)
            where schedules.company_id = employee.company_id
              and schedules.scope = 'company'
              and schedules.is_active
              and schedules.deleted_at is null
            order by schedules.created_at desc
            limit 1;
          end if;

          if schedule_day is not null
            and coalesce(schedule_day.is_working_day, false) then
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

            if daily_hours > 0 then
              total_hours := total_hours + daily_hours;
              working_days := working_days + 1;
              detail := detail || jsonb_build_array(jsonb_build_object(
                'date', current_day,
                'hours', daily_hours,
                'reason', 'working_day'
              ));
              continue;
            end if;
          end if;
        end if;

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
        if absent then
          select sd.*
            into schedule_day
          from public.work_schedules schedules
          join public.schedule_days sd
            on sd.work_schedule_id = schedules.id
           and sd.day_of_week = current_dow
           and coalesce(sd.is_working_day, false)
          where schedules.company_id = employee.company_id
            and schedules.scope = 'company'
            and schedules.is_active
            and schedules.deleted_at is null
          order by schedules.created_at desc
          limit 1;

          if schedule_day is not null
            and coalesce(schedule_day.is_working_day, false) then
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

            if daily_hours > 0 then
              total_hours := total_hours + daily_hours;
              working_days := working_days + 1;
              detail := detail || jsonb_build_array(jsonb_build_object(
                'date', current_day,
                'hours', daily_hours,
                'reason', 'working_day'
              ));
              continue;
            end if;
          end if;
        end if;

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

grant execute on function public.calculate_employee_leave_request_hours(uuid, uuid, date, date) to authenticated;