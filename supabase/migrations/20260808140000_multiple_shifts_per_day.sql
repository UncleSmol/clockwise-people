-- Allow employees to record multiple shifts in a single day.
--
-- 1. Drop the unique constraint that limited employees to one
--    time_entries row per work_date.
-- 2. Rewrite record_employee_time_event so clocking in again after a shift
--    has been clocked out creates a NEW time_entries row instead of failing.
--    Clocking in while a shift is still open still raises an error.
--
-- The "today" entry is now the most recently created time_entries row.

alter table public.time_entries
  drop constraint if exists time_entries_employee_date_unique;

create or replace function public.record_employee_time_event(
  requested_event public.clock_event_type,
  device_metadata jsonb default '{}'::jsonb,
  workstation_id uuid default null,
  requested_at time default null
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  employee public.employees%rowtype;
  company_timezone text;
  local_now timestamp;
  local_date date;
  local_time time;
  recorded_local_time time;
  target_period_id uuid;
  target_timesheet_id uuid;
  entry public.time_entries%rowtype;
  event_latitude numeric;
  event_longitude numeric;
  event_accuracy numeric;
  picked_workstation public.company_workstations%rowtype;
  calculated_distance numeric;
  calculated_geofence_status text := 'unknown';
  enriched_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  event_latitude := nullif(device_metadata #>> '{location,latitude}', '')::numeric;
  event_longitude := nullif(device_metadata #>> '{location,longitude}', '')::numeric;
  event_accuracy := nullif(device_metadata #>> '{location,accuracy}', '')::numeric;

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

  select *
    into employee
  from public.employees
  where id = actor.employee_id
    and company_id = actor.company_id
    and employment_status = 'active'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Active employee record could not be found';
  end if;

  -- Resolve the workstation: the picked one wins, otherwise the active assignment.
  if workstation_id is not null then
    select *
      into picked_workstation
    from public.company_workstations ws
    where ws.id = workstation_id
      and ws.company_id = employee.company_id
      and ws.is_active
      and ws.deleted_at is null;

    if picked_workstation.id is null then
      raise exception 'Selected workstation is not available for this company';
    end if;
  else
    select workstation.*
      into picked_workstation
    from public.employee_workstation_assignments assignment
    join public.company_workstations workstation
      on workstation.id = assignment.workstation_id
     and workstation.company_id = assignment.company_id
     and workstation.is_active
     and workstation.deleted_at is null
    where assignment.company_id = employee.company_id
      and assignment.employee_id = employee.id
      and assignment.is_active
      and assignment.deleted_at is null
      and current_date between assignment.effective_from and coalesce(assignment.effective_to, current_date)
    order by assignment.created_at desc
    limit 1;
  end if;

  if picked_workstation.id is null then
    calculated_geofence_status := 'no_workstation';
  elsif event_latitude is null or event_longitude is null then
    calculated_geofence_status := 'no_location';
  else
    calculated_distance := public.distance_between_coordinates_meters(
      event_latitude,
      event_longitude,
      picked_workstation.latitude,
      picked_workstation.longitude
    );
    calculated_geofence_status := case
      when calculated_distance <= picked_workstation.radius_meters then 'in_range'
      else 'out_of_range'
    end;
  end if;

  enriched_metadata := jsonb_set(
    coalesce(device_metadata, '{}'::jsonb),
    '{geofence}',
    jsonb_build_object(
      'status', calculated_geofence_status,
      'distance_meters', calculated_distance,
      'workstation_id', picked_workstation.id,
      'workstation_name', picked_workstation.name,
      'radius_meters', picked_workstation.radius_meters
    ),
    true
  );

  select timezone
    into company_timezone
  from public.companies
  where id = employee.company_id;

  company_timezone := coalesce(nullif(company_timezone, ''), 'UTC');
  local_now := now() at time zone company_timezone;
  local_date := local_now::date;
  local_time := local_now::time;
  recorded_local_time := local_time;

  select id
    into target_period_id
  from public.payroll_periods
  where company_id = employee.company_id
    and local_date between period_start and period_end
    and status in ('open', 'reopened')
    and deleted_at is null
  order by period_start desc
  limit 1;

  select *
    into entry
  from public.time_entries
  where company_id = employee.company_id
    and employee_id = employee.id
    and work_date = local_date
    and deleted_at is null
  order by created_at desc, id desc
  limit 1
  for update;

  if not found then
    select id
      into target_timesheet_id
    from public.timesheets
    where company_id = employee.company_id
      and employee_id = employee.id
      and (
        (target_period_id is not null and payroll_period_id = target_period_id)
        or (target_period_id is null and payroll_period_id is null and status = 'draft')
      )
      and status in ('draft', 'rejected')
      and deleted_at is null
    order by created_at desc
    limit 1;

    if target_timesheet_id is null then
      insert into public.timesheets (
        company_id,
        employee_id,
        payroll_period_id,
        status
      )
      values (
        employee.company_id,
        employee.id,
        target_period_id,
        'draft'
      )
      returning id into target_timesheet_id;
    end if;

    insert into public.time_entries (
      company_id,
      timesheet_id,
      employee_id,
      payroll_period_id,
      work_date,
      workstation_id,
      status
    )
    values (
      employee.company_id,
      target_timesheet_id,
      employee.id,
      target_period_id,
      local_date,
      picked_workstation.id,
      'draft'
    )
    returning * into entry;
  end if;

  if requested_event = 'clock_in' then
    -- A new shift may only start when the latest entry is not an open shift.
    if entry.clock_in is not null and entry.clock_out is null then
      raise exception 'You already have an active shift for today';
    end if;

    if requested_at is not null and requested_at > local_time then
      raise exception 'Clock-in time cannot be in the future';
    end if;

    recorded_local_time := coalesce(requested_at, local_time);

    -- If today's latest entry is already completed, start a fresh row.
    if entry.clock_in is not null then
      insert into public.time_entries (
        company_id,
        timesheet_id,
        employee_id,
        payroll_period_id,
        work_date,
        workstation_id,
        status
      )
      values (
        employee.company_id,
        entry.timesheet_id,
        employee.id,
        entry.payroll_period_id,
        local_date,
        picked_workstation.id,
        'draft'
      )
      returning * into entry;
    end if;

    update public.time_entries
    set clock_in = coalesce(requested_at, local_time),
        workstation_id = picked_workstation.id,
        device_metadata = enriched_metadata,
        updated_at = now()
    where id = entry.id
    returning * into entry;
  else
    -- Lunch, clock out, and workstation switching edit the active shift only.
    if entry.status not in ('draft', 'rejected') then
      raise exception 'This time entry can no longer be edited';
    end if;

    if requested_event = 'switch_workstation' then
      if entry.clock_in is null or entry.clock_out is not null then
        raise exception 'Switch workstations only while a shift is active';
      end if;

      if workstation_id is null then
        raise exception 'Choose a workstation to switch to';
      end if;

      update public.time_entries
      set workstation_id = picked_workstation.id,
          device_metadata = enriched_metadata,
          updated_at = now()
      where id = entry.id
      returning * into entry;
    elsif requested_event = 'lunch_start' then
      if entry.clock_in is null then
        raise exception 'Clock in before starting lunch';
      end if;

      if entry.lunch_start is not null then
        raise exception 'Lunch has already been started';
      end if;

      if entry.clock_out is not null then
        raise exception 'Cannot start lunch after clocking out';
      end if;

      update public.time_entries
      set lunch_start = local_time,
          workstation_id = picked_workstation.id,
          device_metadata = enriched_metadata,
          updated_at = now()
      where id = entry.id
      returning * into entry;
    elsif requested_event = 'lunch_end' then
      if entry.lunch_start is null then
        raise exception 'Start lunch before ending lunch';
      end if;

      if entry.lunch_end is not null then
        raise exception 'Lunch has already been ended';
      end if;

      if entry.clock_out is not null then
        raise exception 'Cannot end lunch after clocking out';
      end if;

      update public.time_entries
      set lunch_end = local_time,
          workstation_id = picked_workstation.id,
          device_metadata = enriched_metadata,
          updated_at = now()
      where id = entry.id
      returning * into entry;
    elsif requested_event = 'clock_out' then
      if entry.clock_out is not null then
        raise exception 'You have already clocked out for today';
      end if;

      if entry.clock_in is null then
        raise exception 'Clock in before clocking out';
      end if;

      update public.time_entries
      set clock_out = local_time,
          lunch_end = case
            when lunch_start is not null and lunch_end is null then local_time
            else lunch_end
          end,
          workstation_id = picked_workstation.id,
          device_metadata = enriched_metadata,
          updated_at = now()
      where id = entry.id
      returning * into entry;
    else
      raise exception 'Unknown clock event type';
    end if;
  end if;

  perform public.refresh_time_entry_calculations(entry.id);

  -- Store location event in time_clock_events so the UI can show location history
  insert into public.time_clock_events (
    company_id,
    employee_id,
    time_entry_id,
    event_type,
    event_at,
    local_work_date,
    local_event_time,
    latitude,
    longitude,
    accuracy_meters,
    workstation_id,
    distance_meters,
    geofence_status,
    source,
    device_metadata,
    created_by
  )
  values (
    entry.company_id,
    entry.employee_id,
    entry.id,
    requested_event,
    now(),
    local_date,
    recorded_local_time,
    event_latitude,
    event_longitude,
    event_accuracy,
    picked_workstation.id,
    calculated_distance,
    calculated_geofence_status,
    'web',
    enriched_metadata,
    actor.id
  );

  select *
    into entry
  from public.time_entries
  where id = entry.id;

  return entry;
end;
$$;

grant execute on function public.record_employee_time_event(public.clock_event_type, jsonb, uuid, time) to authenticated;

-- sync_company_public_holiday_time_entries used to rely on the dropped
-- time_entries_employee_date_unique constraint for its upsert. Recreate it
-- with an explicit "update eligible row, else insert only when nothing exists
-- for the employee and date" flow so it keeps working with multiple rows a day.
create or replace function public.sync_company_public_holiday_time_entries(
  target_company_id uuid,
  target_year integer default extract(year from current_date)::integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  item record;
  target_schedule_id uuid;
  target_period_id uuid;
  target_timesheet_id uuid;
  scheduled_gross_hours numeric(6,2);
  scheduled_lunch_hours numeric(6,2);
  scheduled_paid_hours numeric(6,2);
  affected_count integer := 0;
  holiday_entry public.time_entries%rowtype;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  for item in
    select
      e.id as employee_id,
      e.work_schedule_id,
      e.workstation_id,
      h.holiday_date,
      h.name as holiday_name
    from public.employees e
    join public.company_public_holidays h
      on h.company_id = e.company_id
     and h.deleted_at is null
     and h.is_paid
     and extract(year from h.holiday_date)::integer = target_year
    where e.company_id = target_company_id
      and e.employment_status = 'active'
      and e.deleted_at is null
  loop
    select assignments.work_schedule_id
      into target_schedule_id
    from public.employee_work_schedule_assignments assignments
    join public.work_schedules schedules
      on schedules.id = assignments.work_schedule_id
     and schedules.company_id = assignments.company_id
     and schedules.is_active
     and schedules.deleted_at is null
    where assignments.company_id = target_company_id
      and assignments.employee_id = item.employee_id
      and assignments.is_active
      and assignments.deleted_at is null
      and assignments.effective_from <= item.holiday_date
      and (assignments.effective_to is null or assignments.effective_to >= item.holiday_date)
    order by assignments.priority, assignments.effective_from desc
    limit 1;

    target_schedule_id := coalesce(target_schedule_id, item.work_schedule_id);

    if target_schedule_id is null then
      select ws.id
        into target_schedule_id
      from public.work_schedules ws
      where ws.company_id = target_company_id
        and ws.scope = 'company'
        and ws.is_active
        and ws.deleted_at is null
      order by ws.created_at desc
      limit 1;
    end if;

    scheduled_gross_hours := null;
    scheduled_lunch_hours := 0;
    scheduled_paid_hours := null;

    if target_schedule_id is not null then
      select
        case
          when sd.start_time is not null and sd.end_time is not null then
            greatest(
              extract(epoch from (
                case
                  when sd.end_time >= sd.start_time then
                    ('2000-01-01 ' || sd.end_time)::timestamp - ('2000-01-01 ' || sd.start_time)::timestamp
                  else
                    ('2000-01-02 ' || sd.end_time)::timestamp - ('2000-01-01 ' || sd.start_time)::timestamp
                end
              )) / 3600,
              0
            )::numeric(6,2)
          else null
        end,
        greatest(coalesce(sd.lunch_minutes, 0), 0)::numeric / 60,
        public.normalized_schedule_paid_hours(sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, 8)
        into scheduled_gross_hours, scheduled_lunch_hours, scheduled_paid_hours
      from public.schedule_days sd
      where sd.work_schedule_id = target_schedule_id
        and sd.day_of_week = extract(dow from item.holiday_date)::integer
        and sd.is_working_day
      limit 1;
    end if;

    if target_schedule_id is null and extract(dow from item.holiday_date)::integer between 1 and 5 then
      scheduled_paid_hours := 8;
      scheduled_lunch_hours := 1;
      scheduled_gross_hours := 9;
    end if;

    if coalesce(scheduled_paid_hours, 0) <= 0 then
      continue;
    end if;

    scheduled_gross_hours := coalesce(scheduled_gross_hours, scheduled_paid_hours + scheduled_lunch_hours)::numeric(6,2);

    select id
      into target_period_id
    from public.payroll_periods
    where company_id = target_company_id
      and item.holiday_date between period_start and period_end
      and status in ('open', 'reopened')
      and deleted_at is null
    order by period_start desc
    limit 1;

    select id
      into target_timesheet_id
    from public.timesheets
    where company_id = target_company_id
      and employee_id = item.employee_id
      and (
        (target_period_id is not null and payroll_period_id = target_period_id)
        or (target_period_id is null and payroll_period_id is null)
      )
      and deleted_at is null
    order by created_at desc
    limit 1;

    if target_timesheet_id is null then
      insert into public.timesheets (
        company_id,
        employee_id,
        payroll_period_id,
        status,
        notes
      )
      values (
        target_company_id,
        item.employee_id,
        target_period_id,
        'draft',
        'Created for public holiday booking'
      )
      returning id into target_timesheet_id;
    end if;

    holiday_entry.id := null;

    select *
      into holiday_entry
    from public.time_entries
    where company_id = target_company_id
      and employee_id = item.employee_id
      and work_date = item.holiday_date
      and (
        deleted_at is not null
        or (
          status in ('draft', 'approved')
          and clock_in is null
          and lunch_start is null
          and lunch_end is null
          and clock_out is null
          and coalesce(notes, '') like 'Public holiday:%'
        )
      )
    order by created_at desc, id desc
    limit 1
    for update;

    if holiday_entry.id is not null then
      update public.time_entries
      set timesheet_id = target_timesheet_id,
          payroll_period_id = target_period_id,
          workstation_id = item.workstation_id,
          gross_hours = scheduled_gross_hours,
          lunch_hours = scheduled_lunch_hours,
          paid_hours = scheduled_paid_hours,
          normal_hours = scheduled_paid_hours,
          overtime_hours = 0,
          missing_clocking = false,
          late_arrival = false,
          early_departure = false,
          notes = 'Public holiday: ' || item.holiday_name,
          status = 'approved',
          approved_by = actor_id,
          approved_at = now(),
          deleted_at = null,
          updated_at = now()
      where id = holiday_entry.id;

      get diagnostics affected_count = row_count;
    elsif not exists (
      select 1
      from public.time_entries
      where company_id = target_company_id
        and employee_id = item.employee_id
        and work_date = item.holiday_date
    ) then
      insert into public.time_entries (
        company_id,
        timesheet_id,
        employee_id,
        payroll_period_id,
        work_date,
        workstation_id,
        gross_hours,
        lunch_hours,
        paid_hours,
        normal_hours,
        overtime_hours,
        missing_clocking,
        late_arrival,
        early_departure,
        notes,
        status,
        approved_by,
        approved_at
      )
      values (
        target_company_id,
        target_timesheet_id,
        item.employee_id,
        target_period_id,
        item.holiday_date,
        item.workstation_id,
        scheduled_gross_hours,
        scheduled_lunch_hours,
        scheduled_paid_hours,
        scheduled_paid_hours,
        0,
        false,
        false,
        false,
        'Public holiday: ' || item.holiday_name,
        'approved',
        actor_id,
        now()
      );

      get diagnostics affected_count = row_count;
    end if;
  end loop;

  return affected_count;
end;
$$;

grant execute on function public.sync_company_public_holiday_time_entries(uuid, integer) to authenticated;