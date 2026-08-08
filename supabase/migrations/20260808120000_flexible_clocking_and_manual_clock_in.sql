-- Make the daily clock flow flexible and allow a manual clock-in time.
--
-- 1. record_employee_time_event now accepts an optional requested_at time.
--    The clock-in branch uses it (validated to not be in the future) instead
--    of always stamping the current time.
-- 2. Clocking out no longer blocks on lunch. Employees can skip lunch and go
--    straight to clock out. If they clock out while a lunch is open
--    (lunch_start set, lunch_end null), lunch is closed automatically so the
--    entry is not flagged as missing clocking.

drop function if exists public.record_employee_time_event(public.clock_event_type, jsonb, uuid);

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

  if entry.status not in ('draft', 'rejected') then
    raise exception 'This time entry can no longer be edited';
  end if;

  if requested_event = 'switch_workstation' then
    if entry.clock_in is null then
      raise exception 'Clock in before switching workstations';
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
  elsif requested_event = 'clock_in' then
    if entry.clock_in is not null then
      raise exception 'You have already clocked in for today';
    end if;

    if requested_at is not null and requested_at > local_time then
      raise exception 'Clock-in time cannot be in the future';
    end if;

    recorded_local_time := coalesce(requested_at, local_time);

    update public.time_entries
    set clock_in = coalesce(requested_at, local_time),
        workstation_id = picked_workstation.id,
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