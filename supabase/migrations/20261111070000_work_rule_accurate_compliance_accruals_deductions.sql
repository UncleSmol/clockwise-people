-- Ensure work-rule-accurate compliance flags, leave deductions, and leave accruals.
-- Fixes:
-- 1. Shared helper public.get_employee_work_rule_metrics(company_id, employee_id, fallback_daily_hours)
--    resolving effective daily/weekly/annual hours across employee_work_schedule_assignments + employees.work_schedule_id.
-- 2. refresh_time_entry_calculations: matches day-specific working rule across assignments by priority asc
--    and removes the < 4h -> 8h override that broke short (e.g. 2h or Saturday 4h) work rules.
-- 3. Both overloads of calculate_employee_leave_request_hours: respect assigned non-working days
--    (do not fall back to company Mon-Fri 8h when employee has assigned schedule rules) and use
--    normalized_schedule_paid_hours so a 2h/day rule deducts 2h/day instead of 8h.
-- 4. calculate_company_leave_accruals & sync_company_bcea_leave_accruals: scale annual/sick/FRL
--    accruals and caps accurately to each employee's assigned work rule hours.
-- 5. Safely refresh stale late_arrival / early_departure DB flags on clocked time entries
--    where the employee's assigned work rule proves actual compliance or deviation.

create or replace function public.normalized_schedule_paid_hours(
  schedule_start time without time zone,
  schedule_end time without time zone,
  schedule_lunch_minutes integer,
  configured_paid_hours numeric,
  fallback_paid_hours numeric
)
returns numeric
language plpgsql
stable
as $function$
declare
  gross_hours numeric(8,2);
  lunch_hours numeric(8,2);
  derived_paid_hours numeric(8,2);
  configured numeric(8,2);
begin
  configured := nullif(configured_paid_hours, 0);
  lunch_hours := greatest(coalesce(schedule_lunch_minutes, 0), 0)::numeric / 60;

  if schedule_start is not null and schedule_end is not null then
    gross_hours := greatest(
      extract(epoch from (
        case
          when schedule_end >= schedule_start then
            ('2000-01-01 ' || schedule_end)::timestamp - ('2000-01-01 ' || schedule_start)::timestamp
          else
            ('2000-01-02 ' || schedule_end)::timestamp - ('2000-01-01 ' || schedule_start)::timestamp
        end
      )) / 3600,
      0
    )::numeric(8,2);
    derived_paid_hours := greatest(gross_hours - lunch_hours, 0)::numeric(8,2);

    if configured is null then
      return coalesce(nullif(derived_paid_hours, 0), fallback_paid_hours, 8)::numeric(8,2);
    end if;

    -- Reject corrupted paid_hours larger than the physical shift span (e.g. 8h stored for a 09:00-13:00 shift)
    if derived_paid_hours > 0 and configured > gross_hours + 0.01 then
      return derived_paid_hours::numeric(8,2);
    end if;

    if lunch_hours > 0
      and gross_hours > 0
      and abs(configured - gross_hours) < 0.02
      and derived_paid_hours > 0 then
      return derived_paid_hours::numeric(8,2);
    end if;
  end if;

  return coalesce(configured, nullif(derived_paid_hours, 0), fallback_paid_hours, 8)::numeric(8,2);
end;
$function$;

create or replace function public.get_employee_work_rule_metrics(
  target_company_id uuid,
  target_employee_id uuid,
  fallback_daily_hours numeric default 8
)
returns table(
  daily_hours numeric,
  weekly_hours numeric,
  annual_hours numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_safe_fallback numeric(8,2) := greatest(coalesce(nullif(fallback_daily_hours, 0), 8), 0.5);
  v_emp_schedule_id uuid;
  v_avg_daily numeric(8,2);
  v_sum_weekly numeric(8,2);
  v_sched_daily numeric(8,2);
begin
  select e.work_schedule_id
    into v_emp_schedule_id
  from public.employees e
  where e.id = target_employee_id
    and e.company_id = target_company_id
    and e.deleted_at is null;

  -- Merge day_of_week (0..6) across active assignments ordered by priority asc, then primary work_schedule_id.
  with ordered_schedules as (
    select
      a.work_schedule_id as sched_id,
      row_number() over (order by a.priority asc, a.effective_from desc, a.created_at desc) as ord
    from public.employee_work_schedule_assignments a
    join public.work_schedules ws
      on ws.id = a.work_schedule_id
     and ws.company_id = a.company_id
     and ws.is_active
     and ws.deleted_at is null
    where a.company_id = target_company_id
      and a.employee_id = target_employee_id
      and a.is_active
      and a.deleted_at is null

    union all

    select
      v_emp_schedule_id as sched_id,
      999999 as ord
    where v_emp_schedule_id is not null
  ),
  dedup_schedules as (
    select sched_id, min(ord) as ord
    from ordered_schedules
    where sched_id is not null
    group by sched_id
  ),
  per_day as (
    select distinct on (sd.day_of_week)
      sd.day_of_week,
      public.normalized_schedule_paid_hours(
        sd.start_time,
        sd.end_time,
        sd.lunch_minutes,
        sd.paid_hours,
        coalesce(ws.standard_daily_hours, v_safe_fallback)
      ) as day_hours
    from dedup_schedules ds
    join public.work_schedules ws on ws.id = ds.sched_id and ws.deleted_at is null
    join public.schedule_days sd on sd.work_schedule_id = ds.sched_id
    where coalesce(sd.is_working_day, false) = true
    order by sd.day_of_week, ds.ord asc
  )
  select
    round(avg(day_hours) filter (where day_hours > 0), 2),
    round(sum(day_hours) filter (where day_hours > 0), 2)
  into v_avg_daily, v_sum_weekly
  from per_day;

  if v_avg_daily is null or v_avg_daily <= 0 then
    select coalesce(
      (
        select ws.standard_daily_hours
        from public.employee_work_schedule_assignments a
        join public.work_schedules ws
          on ws.id = a.work_schedule_id
         and ws.company_id = a.company_id
         and ws.is_active
         and ws.deleted_at is null
        where a.company_id = target_company_id
          and a.employee_id = target_employee_id
          and a.is_active
          and a.deleted_at is null
        order by a.priority asc, a.effective_from desc
        limit 1
      ),
      (
        select ws.standard_daily_hours
        from public.work_schedules ws
        where ws.id = v_emp_schedule_id
          and ws.deleted_at is null
      ),
      v_safe_fallback
    )
    into v_sched_daily;

    v_avg_daily := greatest(coalesce(v_sched_daily, v_safe_fallback), 0.5);
    v_sum_weekly := round(v_avg_daily * 5.0, 2);
  end if;

  daily_hours := v_avg_daily;
  weekly_hours := v_sum_weekly;
  annual_hours := round(v_sum_weekly * 52.0, 2);
  return next;
end;
$function$;

create or replace function public.refresh_time_entry_calculations(target_time_entry_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  entry public.time_entries%rowtype;
  company_setting public.company_settings%rowtype;
  target_schedule_id uuid;
  scheduled_start time;
  scheduled_end time;
  scheduled_lunch_minutes integer := 0;
  scheduled_paid_hours numeric(6,2);
  standard_paid_hours numeric(6,2);
  gross numeric(6,2) := 0;
  lunch numeric(6,2) := 0;
  paid numeric(6,2) := 0;
  entry_dow integer;
begin
  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id;

  if not found then
    raise exception 'Time entry not found';
  end if;

  entry_dow := extract(dow from entry.work_date)::integer;

  select *
    into company_setting
  from public.company_settings
  where company_id = entry.company_id;

  standard_paid_hours := coalesce(company_setting.standard_daily_hours, 8)::numeric(6,2);

  -- Pick the highest-priority working day rule matching entry.work_date's day of week across assigned rules
  select sd.work_schedule_id,
         sd.start_time,
         sd.end_time,
         sd.lunch_minutes,
         public.normalized_schedule_paid_hours(
           sd.start_time,
           sd.end_time,
           sd.lunch_minutes,
           sd.paid_hours,
           coalesce(schedules.standard_daily_hours, standard_paid_hours)
         )
    into target_schedule_id, scheduled_start, scheduled_end, scheduled_lunch_minutes, scheduled_paid_hours
  from public.employee_work_schedule_assignments assignments
  join public.work_schedules schedules
    on schedules.id = assignments.work_schedule_id
   and schedules.company_id = assignments.company_id
   and schedules.is_active
   and schedules.deleted_at is null
  join public.schedule_days sd
    on sd.work_schedule_id = schedules.id
   and sd.day_of_week = entry_dow
   and sd.is_working_day
  where assignments.company_id = entry.company_id
    and assignments.employee_id = entry.employee_id
    and assignments.is_active
    and assignments.deleted_at is null
    and assignments.effective_from <= entry.work_date
    and (assignments.effective_to is null or assignments.effective_to >= entry.work_date)
  order by assignments.priority asc, assignments.effective_from desc, assignments.created_at desc
  limit 1;

  if target_schedule_id is null then
    select sd.work_schedule_id,
           sd.start_time,
           sd.end_time,
           sd.lunch_minutes,
           public.normalized_schedule_paid_hours(
             sd.start_time,
             sd.end_time,
             sd.lunch_minutes,
             sd.paid_hours,
             coalesce(ws.standard_daily_hours, standard_paid_hours)
           )
      into target_schedule_id, scheduled_start, scheduled_end, scheduled_lunch_minutes, scheduled_paid_hours
    from public.employees e
    join public.work_schedules ws
      on ws.id = e.work_schedule_id
     and ws.is_active
     and ws.deleted_at is null
    join public.schedule_days sd
      on sd.work_schedule_id = ws.id
     and sd.day_of_week = entry_dow
     and sd.is_working_day
    where e.id = entry.employee_id
      and e.company_id = entry.company_id
    limit 1;
  end if;

  -- Only fall back to company default if employee has NO active assigned/primary schedule
  if target_schedule_id is null
     and not exists (
       select 1
       from public.employee_work_schedule_assignments assignments
       where assignments.company_id = entry.company_id
         and assignments.employee_id = entry.employee_id
         and assignments.is_active
         and assignments.deleted_at is null
     )
     and not exists (
       select 1
       from public.employees e
       where e.id = entry.employee_id
         and e.company_id = entry.company_id
         and e.work_schedule_id is not null
     )
  then
    select sd.work_schedule_id,
           sd.start_time,
           sd.end_time,
           sd.lunch_minutes,
           public.normalized_schedule_paid_hours(
             sd.start_time,
             sd.end_time,
             sd.lunch_minutes,
             sd.paid_hours,
             coalesce(ws.standard_daily_hours, standard_paid_hours)
           )
      into target_schedule_id, scheduled_start, scheduled_end, scheduled_lunch_minutes, scheduled_paid_hours
    from public.work_schedules ws
    join public.schedule_days sd
      on sd.work_schedule_id = ws.id
     and sd.day_of_week = entry_dow
     and sd.is_working_day
    where ws.company_id = entry.company_id
      and ws.scope = 'company'
      and ws.is_active
      and ws.deleted_at is null
    order by ws.created_at desc
    limit 1;
  end if;

  -- Preserve short work rules (e.g. 2h/day or 4h Saturday); never clamp < 4h up to 8h.
  scheduled_paid_hours := coalesce(scheduled_paid_hours, standard_paid_hours)::numeric(6,2);

  if entry.clock_in is not null and entry.clock_out is not null then
    gross := greatest(
      extract(epoch from (
        case
          when entry.clock_out >= entry.clock_in then
            ('2000-01-01 ' || entry.clock_out)::timestamp - ('2000-01-01 ' || entry.clock_in)::timestamp
          else
            ('2000-01-02 ' || entry.clock_out)::timestamp - ('2000-01-01 ' || entry.clock_in)::timestamp
        end
      )) / 3600,
      0
    )::numeric(6,2);
  end if;

  if entry.lunch_start is not null and entry.lunch_end is not null then
    lunch := greatest(
      extract(epoch from (
        case
          when entry.lunch_end >= entry.lunch_start then
            ('2000-01-01 ' || entry.lunch_end)::timestamp - ('2000-01-01 ' || entry.lunch_start)::timestamp
          else
            ('2000-01-02 ' || entry.lunch_end)::timestamp - ('2000-01-01 ' || entry.lunch_start)::timestamp
        end
      )) / 3600,
      0
    )::numeric(6,2);
  else
    lunch := 0;
  end if;

  paid := greatest(gross - lunch, 0)::numeric(6,2);

  update public.time_entries
  set gross_hours = gross,
      lunch_hours = lunch,
      paid_hours = paid,
      normal_hours = least(paid, scheduled_paid_hours)::numeric(6,2),
      overtime_hours = greatest(paid - scheduled_paid_hours, 0)::numeric(6,2),
      missing_clocking = (
        clock_in is null
        or clock_out is null
        or (lunch_start is not null and lunch_end is null)
      ),
      late_arrival = (
        scheduled_start is not null
        and clock_in is not null
        and clock_in > (scheduled_start + interval '5 minutes')::time
      ),
      early_departure = (
        scheduled_end is not null
        and clock_out is not null
        and clock_out < scheduled_end
      ),
      updated_at = now()
  where id = entry.id;
end;
$function$;

create or replace function public.calculate_employee_leave_request_hours(
  target_employee_id uuid,
  request_start_date date,
  request_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  employee public.employees%rowtype;
  company_setting public.company_settings%rowtype;
  assigned_rule_count integer := 0;
  total_hours numeric(8,2) := 0;
  working_days integer := 0;
  public_holiday_count integer := 0;
  non_working_days integer := 0;
  detail jsonb := '[]'::jsonb;
  current_day date;
  current_dow integer;
  v_sd_start time;
  v_sd_end time;
  v_sd_lunch integer;
  v_sd_paid numeric(8,2);
  v_sd_working boolean;
  v_sched_daily numeric(8,2);
  v_matched boolean;
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

    v_matched := false;
    v_sd_start := null;
    v_sd_end := null;
    v_sd_lunch := 0;
    v_sd_paid := null;
    v_sd_working := false;
    v_sched_daily := null;

    if assigned_rule_count > 0 then
      select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, schedules.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
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
      order by assignments.priority asc, assignments.effective_from desc, assignments.created_at desc
      limit 1;
      v_matched := found;

      if not v_matched and employee.work_schedule_id is not null then
        select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, ws.standard_daily_hours
          into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
        from public.schedule_days sd
        join public.work_schedules ws on ws.id = sd.work_schedule_id and ws.deleted_at is null
        where sd.work_schedule_id = employee.work_schedule_id
          and sd.day_of_week = current_dow
          and coalesce(sd.is_working_day, false)
        limit 1;
        v_matched := found;
      end if;
    elsif employee.work_schedule_id is not null then
      select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, ws.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
      from public.schedule_days sd
      join public.work_schedules ws on ws.id = sd.work_schedule_id and ws.deleted_at is null
      where sd.work_schedule_id = employee.work_schedule_id
        and sd.day_of_week = current_dow
        and coalesce(sd.is_working_day, false)
      limit 1;
      v_matched := found;
    else
      select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, schedules.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
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
      v_matched := found;
    end if;

    if not v_matched or not coalesce(v_sd_working, false) then
      non_working_days := non_working_days + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'non_working_day'
      ));
      continue;
    end if;

    daily_hours := public.normalized_schedule_paid_hours(
      v_sd_start,
      v_sd_end,
      v_sd_lunch,
      v_sd_paid,
      coalesce(v_sched_daily, company_setting.standard_daily_hours, 8)
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
    'total_hours', total_hours,
    'working_days', working_days,
    'public_holidays', public_holiday_count,
    'non_working_days', non_working_days,
    'days', detail
  );
end;
$function$;

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
set search_path to 'public'
as $function$
declare
  employee public.employees%rowtype;
  company_setting public.company_settings%rowtype;
  leave_type public.leave_types%rowtype;
  leave_balance public.leave_balances%rowtype;
  assigned_rule_count integer := 0;
  total_hours numeric(8,2) := 0;
  available_hours numeric(8,2) := 0;
  v_effective_available numeric(8,2) := 0;
  v_toil_balance numeric(8,2) := 0;
  v_toil_to_use numeric(8,2) := 0;
  v_leave_to_use numeric(8,2) := 0;
  v_load_toil_first boolean := false;
  working_days integer := 0;
  public_holiday_count integer := 0;
  non_working_days integer := 0;
  detail jsonb := '[]'::jsonb;
  current_day date;
  current_dow integer;
  v_sd_start time;
  v_sd_end time;
  v_sd_lunch integer;
  v_sd_paid numeric(8,2);
  v_sd_working boolean;
  v_sched_daily numeric(8,2);
  v_matched boolean;
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

  -- Check employee's available TOIL balance
  select coalesce(lb.balance_hours, 0)
    into v_toil_balance
  from public.leave_balances lb
  join public.leave_types lt on lt.id = lb.leave_type_id
  where lb.company_id = employee.company_id
    and lb.employee_id = employee.id
    and lt.category = 'toil_taken'
    and lt.is_active = true
    and lt.deleted_at is null
  limit 1;

  v_toil_balance := coalesce(v_toil_balance, 0);

  v_load_toil_first := (
    v_toil_balance > 0 and
    leave_type.category in ('annual', 'other') and
    coalesce((company_setting.toil_rules->>'load_toil_first')::boolean, true)
  );

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

    v_matched := false;
    v_sd_start := null;
    v_sd_end := null;
    v_sd_lunch := 0;
    v_sd_paid := null;
    v_sd_working := false;
    v_sched_daily := null;

    if assigned_rule_count > 0 then
      select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, schedules.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
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
      order by assignments.priority asc, assignments.effective_from desc, assignments.created_at desc
      limit 1;
      v_matched := found;

      if not v_matched and employee.work_schedule_id is not null then
        select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, ws.standard_daily_hours
          into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
        from public.schedule_days sd
        join public.work_schedules ws on ws.id = sd.work_schedule_id and ws.deleted_at is null
        where sd.work_schedule_id = employee.work_schedule_id
          and sd.day_of_week = current_dow
          and coalesce(sd.is_working_day, false)
        limit 1;
        v_matched := found;
      end if;
    elsif employee.work_schedule_id is not null then
      select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, ws.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
      from public.schedule_days sd
      join public.work_schedules ws on ws.id = sd.work_schedule_id and ws.deleted_at is null
      where sd.work_schedule_id = employee.work_schedule_id
        and sd.day_of_week = current_dow
        and coalesce(sd.is_working_day, false)
      limit 1;
      v_matched := found;
    else
      -- Employee has no assigned schedule; fall back to company default schedule
      select sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, sd.is_working_day, schedules.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
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
      v_matched := found;
    end if;

    -- Strictly treat days outside the employee's assigned working schedule as non-working (0h)
    if not v_matched or not coalesce(v_sd_working, false) then
      non_working_days := non_working_days + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'non_working_day'
      ));
      continue;
    end if;

    daily_hours := public.normalized_schedule_paid_hours(
      v_sd_start,
      v_sd_end,
      v_sd_lunch,
      v_sd_paid,
      coalesce(v_sched_daily, company_setting.standard_daily_hours, 8)
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

  if v_load_toil_first then
    v_effective_available := available_hours + v_toil_balance;
    v_toil_to_use := least(v_toil_balance, total_hours);
    v_leave_to_use := greatest(0, total_hours - v_toil_to_use);
  else
    v_effective_available := available_hours;
    v_toil_to_use := 0;
    v_leave_to_use := total_hours;
  end if;

  return jsonb_build_object(
    'available_hours', v_effective_available,
    'leave_type_available_hours', available_hours,
    'toil_available_hours', v_toil_balance,
    'toil_hours_to_use', v_toil_to_use,
    'leave_hours_to_use', v_leave_to_use,
    'load_toil_first', v_load_toil_first,
    'days', detail,
    'exceeds_balance', total_hours > v_effective_available,
    'leave_type_name', leave_type.name,
    'non_working_days', non_working_days,
    'public_holidays', public_holiday_count,
    'remaining_hours', v_effective_available - total_hours,
    'total_hours', total_hours,
    'working_days', working_days
  );
end;
$function$;

create or replace function public.calculate_company_leave_accruals(
  target_leave_type_id uuid,
  period_start date,
  period_end date
)
returns table(
  employee_id uuid,
  full_name text,
  employee_number text,
  hours_worked numeric,
  accrued_hours numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  company_setting public.company_settings%rowtype;
  yearly_hours numeric(8,2);
  standard_daily_hours numeric(8,2);
  company_weekly_hours numeric(8,2);
  toil_mult numeric(8,2);
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
  standard_daily_hours := greatest(coalesce(company_setting.standard_daily_hours, 8), 1);
  company_weekly_hours := standard_daily_hours * 5.0;
  toil_mult := coalesce((leave_type.accrual_rules->>'accrual_multiplier')::numeric, 1.5);

  return query
  select
    e.id as employee_id,
    e.full_name,
    e.employee_number,
    coalesce(te_agg.hours_worked, 0)::numeric as hours_worked,
    case
      when coalesce(te_agg.shifts_worked, 0) = 0 or coalesce(te_agg.hours_worked, 0) <= 0 then 0.00

      when leave_type.category = 'annual' then
        round(
          greatest(
            (coalesce(te_agg.shifts_worked, 0) / 17.0) * wrm.daily_hours,
            coalesce(te_agg.hours_worked, 0) / 17.0,
            case
              when yearly_hours > 0 and wrm.annual_hours > 0 then
                ((yearly_hours * (wrm.weekly_hours / company_weekly_hours)) * coalesce(te_agg.hours_worked, 0)) / wrm.annual_hours
              else 0
            end
          ),
          2
        )::numeric

      when leave_type.category = 'sick' then
        round(
          least(
            coalesce(nullif(yearly_hours, 0), 80.0) * (wrm.weekly_hours / company_weekly_hours),
            greatest(
              (coalesce(te_agg.shifts_worked, 0) / 26.0) * wrm.daily_hours,
              coalesce(te_agg.hours_worked, 0) / 26.0,
              case
                when yearly_hours > 0 and wrm.annual_hours > 0 then
                  ((yearly_hours * (wrm.weekly_hours / company_weekly_hours)) * coalesce(te_agg.hours_worked, 0)) / wrm.annual_hours
                else 0
              end
            )
          ),
          2
        )::numeric

      when leave_type.category = 'family_responsibility' then
        case
          when e.start_date <= (period_end - interval '4 months') and coalesce(te_agg.shifts_worked, 0) >= 16 then
            round(
              coalesce(nullif(yearly_hours, 0), standard_daily_hours * 3.0) * (wrm.weekly_hours / company_weekly_hours),
              2
            )::numeric
          else 0.00
        end

      when leave_type.category = 'toil_taken' then
        round(coalesce(te_agg.overtime_hours, 0) * toil_mult, 2)::numeric

      else 0.00
    end as accrued_hours

  from public.employees e
  cross join lateral public.get_employee_work_rule_metrics(e.company_id, e.id, standard_daily_hours) wrm
  left join (
    select
      te.employee_id,
      count(distinct te.work_date) filter (where te.paid_hours > 0 or te.normal_hours > 0 or te.clock_in is not null) as shifts_worked,
      sum(case when te.paid_hours > 0 then te.paid_hours else te.normal_hours end) as hours_worked,
      sum(te.overtime_hours) as overtime_hours
    from public.time_entries te
    where te.company_id = leave_type.company_id
      and te.deleted_at is null
      and te.work_date between period_start and period_end
    group by te.employee_id
  ) te_agg on te_agg.employee_id = e.id
  where e.company_id = leave_type.company_id
    and e.deleted_at is null
    and e.employment_status = 'active'
  order by e.full_name asc;
end;
$function$;

create or replace function public.sync_company_bcea_leave_accruals(target_company_id uuid)
returns table(
  out_employee_id uuid,
  out_employee_name text,
  out_leave_type_name text,
  out_hours_worked numeric,
  out_accrued_hours numeric,
  out_taken_hours numeric,
  out_balance_hours numeric
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r_emp record;
  r_lt record;
  v_shifts integer;
  v_worked numeric(10,2);
  v_overtime numeric(10,2);
  v_taken numeric(10,2);
  v_existing_taken numeric(10,2);
  v_accrued numeric(10,2);
  v_adjusted numeric(10,2);
  v_net_balance numeric(10,2);
  v_yearly_hours numeric(10,2);
  v_entitlement_days numeric(10,2);
  v_toil_mult numeric(10,2);
  v_standard_annual numeric(10,2);
  v_daily_hours numeric(10,2);
  v_company_weekly numeric(10,2);
  v_schedule_scale numeric(10,4);
  v_scaled_yearly numeric(10,2);
  v_months_employed numeric(10,2);
  v_shift_accrual numeric(10,2);
  v_hours_accrual numeric(10,2);
  v_bcea_floor numeric(10,2);
begin
  select
    greatest(coalesce(cs.standard_monthly_hours, 173.33) * 12, 1),
    greatest(coalesce(cs.standard_daily_hours, 8), 1)
  into v_standard_annual, v_daily_hours
  from public.company_settings cs
  where cs.company_id = target_company_id;

  if v_standard_annual is null then
    v_standard_annual := 2080.0;
  end if;
  if v_daily_hours is null then
    v_daily_hours := 8.0;
  end if;
  v_company_weekly := v_daily_hours * 5.0;

  for r_emp in
    select
      emp.id,
      emp.full_name,
      emp.employee_number,
      emp.start_date,
      wrm.daily_hours as emp_daily_hours,
      wrm.weekly_hours as emp_weekly_hours,
      wrm.annual_hours as emp_annual_hours
    from public.employees emp
    cross join lateral public.get_employee_work_rule_metrics(emp.company_id, emp.id, v_daily_hours) wrm
    where emp.company_id = target_company_id
      and emp.deleted_at is null
      and emp.employment_status = 'active'
    order by emp.full_name
  loop
    v_months_employed := greatest(0, round(extract(epoch from (now() - coalesce(r_emp.start_date::timestamp, '2026-01-01'::timestamp))) / (86400 * 30.4), 2));
    v_schedule_scale := case when v_company_weekly > 0 then r_emp.emp_weekly_hours / v_company_weekly else 1.0 end;

    select
      coalesce(count(distinct te.work_date) filter (where te.paid_hours > 0 or te.normal_hours > 0 or te.clock_in is not null), 0),
      coalesce(sum(case when te.paid_hours > 0 then te.paid_hours else te.normal_hours end), 0),
      coalesce(sum(te.overtime_hours), 0)
    into v_shifts, v_worked, v_overtime
    from public.time_entries te
    where te.company_id = target_company_id
      and te.employee_id = r_emp.id
      and te.deleted_at is null;

    for r_lt in
      select lt.id, lt.name, lt.category, lt.accrual_rules
      from public.leave_types lt
      where lt.company_id = target_company_id
        and lt.is_active = true
        and lt.deleted_at is null
    loop
      v_yearly_hours := coalesce((r_lt.accrual_rules->>'yearly_hours')::numeric, 0);
      v_entitlement_days := coalesce(
        (r_lt.accrual_rules->>'entitlement_days')::numeric,
        (r_lt.accrual_rules->>'entitlement_amount')::numeric,
        (r_lt.accrual_rules->>'yearly_days')::numeric,
        case
          when v_yearly_hours > 0 and v_yearly_hours <= 40 then v_yearly_hours
          when v_yearly_hours > 40 then round(v_yearly_hours / v_daily_hours, 2)
          else 15.0
        end
      );
      v_scaled_yearly := round(
        coalesce(nullif(v_yearly_hours, 0), v_entitlement_days * v_daily_hours) * v_schedule_scale,
        2
      );
      v_toil_mult := coalesce((r_lt.accrual_rules->>'accrual_multiplier')::numeric, 1.5);

      select coalesce(sum(lr.total_hours), 0)
      into v_taken
      from public.leave_requests lr
      where lr.company_id = target_company_id
        and lr.employee_id = r_emp.id
        and lr.leave_type_id = r_lt.id
        and lr.status = 'approved'
        and lr.deleted_at is null;

      select coalesce(lb.taken_hours, 0), coalesce(lb.adjusted_hours, 0)
      into v_existing_taken, v_adjusted
      from public.leave_balances lb
      where lb.company_id = target_company_id
        and lb.employee_id = r_emp.id
        and lb.leave_type_id = r_lt.id;

      v_taken := greatest(coalesce(v_taken, 0), coalesce(v_existing_taken, 0));
      v_adjusted := coalesce(v_adjusted, 0);

      if v_shifts = 0 or v_worked <= 0 then
        v_accrued := 0.00;
      else
        if r_lt.category = 'annual' then
          v_shift_accrual := round((v_shifts * v_scaled_yearly) / 260.0, 2);
          v_hours_accrual := round(
            case when r_emp.emp_annual_hours > 0 then (v_worked * v_scaled_yearly) / r_emp.emp_annual_hours else 0 end,
            2
          );
          v_bcea_floor := round(greatest(v_worked / 17.0, (v_shifts / 17.0) * r_emp.emp_daily_hours), 2);
          v_accrued := greatest(v_shift_accrual, v_hours_accrual, v_bcea_floor);

        elsif r_lt.category = 'sick' then
          v_accrued := round(
            least(
              round(coalesce(nullif(v_yearly_hours, 0), 10.0 * v_daily_hours) * v_schedule_scale, 2),
              greatest(
                (v_shifts / 26.0) * r_emp.emp_daily_hours,
                v_worked / 26.0,
                case when v_scaled_yearly > 0 and r_emp.emp_annual_hours > 0 then (v_scaled_yearly * v_worked) / r_emp.emp_annual_hours else 0 end
              )
            ),
            2
          );

        elsif r_lt.category = 'family_responsibility' then
          if (v_months_employed >= 4.0 and v_shifts >= 16) then
            v_accrued := round(coalesce(nullif(v_yearly_hours, 0), 3.0 * v_daily_hours) * v_schedule_scale, 2);
          else
            v_accrued := 0.00;
          end if;

        elsif r_lt.category = 'toil_taken' then
          v_accrued := round(v_overtime * v_toil_mult, 2);

        else
          v_accrued := 0.00;
        end if;
      end if;

      v_net_balance := greatest(0, round(v_accrued + v_adjusted - v_taken, 2));

      insert into public.leave_balances (
        company_id,
        employee_id,
        leave_type_id,
        accrued_hours,
        balance_hours,
        taken_hours,
        adjusted_hours,
        as_of_date
      ) values (
        target_company_id,
        r_emp.id,
        r_lt.id,
        v_accrued,
        v_net_balance,
        v_taken,
        v_adjusted,
        current_date
      )
      on conflict (company_id, employee_id, leave_type_id)
      do update set
        accrued_hours = excluded.accrued_hours,
        taken_hours = excluded.taken_hours,
        balance_hours = excluded.balance_hours,
        as_of_date = current_date,
        updated_at = now();

      out_employee_id := r_emp.id;
      out_employee_name := r_emp.full_name;
      out_leave_type_name := r_lt.name;
      out_hours_worked := v_worked;
      out_accrued_hours := v_accrued;
      out_taken_hours := v_taken;
      out_balance_hours := v_net_balance;
      return next;
    end loop;
  end loop;

  return;
end;
$function$;

-- Reconcile existing stale late_arrival / early_departure flags on clocked time entries
-- against each employee's actual assigned schedule day (without altering paid/normal hours).
with resolved_entry_day as (
  select
    te.id as entry_id,
    coalesce(
      (
        select sd.start_time
        from public.employee_work_schedule_assignments a
        join public.work_schedules ws
          on ws.id = a.work_schedule_id
         and ws.company_id = a.company_id
         and ws.is_active
         and ws.deleted_at is null
        join public.schedule_days sd
          on sd.work_schedule_id = ws.id
         and sd.day_of_week = extract(dow from te.work_date)::integer
         and sd.is_working_day
        where a.company_id = te.company_id
          and a.employee_id = te.employee_id
          and a.is_active
          and a.deleted_at is null
          and a.effective_from <= te.work_date
          and (a.effective_to is null or a.effective_to >= te.work_date)
        order by a.priority asc, a.effective_from desc, a.created_at desc
        limit 1
      ),
      (
        select sd.start_time
        from public.employees e
        join public.work_schedules ws
          on ws.id = e.work_schedule_id
         and ws.is_active
         and ws.deleted_at is null
        join public.schedule_days sd
          on sd.work_schedule_id = ws.id
         and sd.day_of_week = extract(dow from te.work_date)::integer
         and sd.is_working_day
        where e.id = te.employee_id
          and e.company_id = te.company_id
        limit 1
      )
    ) as sched_start,
    coalesce(
      (
        select sd.end_time
        from public.employee_work_schedule_assignments a
        join public.work_schedules ws
          on ws.id = a.work_schedule_id
         and ws.company_id = a.company_id
         and ws.is_active
         and ws.deleted_at is null
        join public.schedule_days sd
          on sd.work_schedule_id = ws.id
         and sd.day_of_week = extract(dow from te.work_date)::integer
         and sd.is_working_day
        where a.company_id = te.company_id
          and a.employee_id = te.employee_id
          and a.is_active
          and a.deleted_at is null
          and a.effective_from <= te.work_date
          and (a.effective_to is null or a.effective_to >= te.work_date)
        order by a.priority asc, a.effective_from desc, a.created_at desc
        limit 1
      ),
      (
        select sd.end_time
        from public.employees e
        join public.work_schedules ws
          on ws.id = e.work_schedule_id
         and ws.is_active
         and ws.deleted_at is null
        join public.schedule_days sd
          on sd.work_schedule_id = ws.id
         and sd.day_of_week = extract(dow from te.work_date)::integer
         and sd.is_working_day
        where e.id = te.employee_id
          and e.company_id = te.company_id
        limit 1
      )
    ) as sched_end
  from public.time_entries te
  where te.deleted_at is null
    and te.clock_in is not null
)
update public.time_entries te
set
  late_arrival = (
    r.sched_start is not null
    and te.clock_in is not null
    and te.clock_in > (r.sched_start + interval '5 minutes')::time
  ),
  early_departure = (
    r.sched_end is not null
    and te.clock_out is not null
    and te.clock_out < r.sched_end
  ),
  updated_at = now()
from resolved_entry_day r
where te.id = r.entry_id
  and (r.sched_start is not null or r.sched_end is not null)
  and (
    te.late_arrival is distinct from (
      r.sched_start is not null
      and te.clock_in is not null
      and te.clock_in > (r.sched_start + interval '5 minutes')::time
    )
    or te.early_departure is distinct from (
      r.sched_end is not null
      and te.clock_out is not null
      and te.clock_out < r.sched_end
    )
  );
