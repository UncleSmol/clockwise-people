-- Migration: 20261023080000_geofence_privacy_and_interaction_tracking.sql
-- Description:
-- 1. Ensure 'app_interaction' enum value exists on public.clock_event_type.
-- 2. Update record_employee_time_event so coordinates (latitude, longitude) are set to NULL
--    when the user is outside the geofence radius ('out_of_range'), preventing them from appearing
--    on the map while preserving distance_meters and out_of_range geofence_status for deviation auditing.
-- 3. Create record_employee_interaction_location RPC to capture location on app interactions while clocked in.
-- 4. Strip historical coordinates on existing out_of_range time_clock_events records.

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'clock_event_type'
      and e.enumlabel = 'app_interaction'
  ) then
    alter type public.clock_event_type add value 'app_interaction';
  end if;
end $$;

-- Rewrite record_employee_time_event with strict geofence radius coordinate privacy
create or replace function public.record_employee_time_event(
  requested_event public.clock_event_type,
  device_metadata jsonb default '{}'::jsonb,
  workstation_id uuid default null,
  requested_at time default null,
  target_company_id uuid default null
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
  target_timesheet_id uuid;
  target_period_id uuid;
  entry public.time_entries%rowtype;
  event_latitude numeric;
  event_longitude numeric;
  calculated_distance numeric;
  calculated_geofence_status text;
  enriched_metadata jsonb;
  picked_workstation public.company_workstations%rowtype;
  resolved_company_id uuid;
  stored_lat numeric;
  stored_lng numeric;
begin
  resolved_company_id := target_company_id;

  if resolved_company_id is null then
    select u.company_id
      into resolved_company_id
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and u.deleted_at is null
    limit 1;
  end if;

  if resolved_company_id is null then
    raise exception 'No active company context could be resolved for clocking';
  end if;

  select *
    into actor
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.company_id = resolved_company_id
    and u.status = 'active'
    and u.deleted_at is null
  limit 1;

  if actor.id is null then
    raise exception 'Current user is not active in this company';
  end if;

  if actor.employee_id is not null then
    select *
      into employee
    from public.employees e
    where e.id = actor.employee_id
      and e.company_id = resolved_company_id
      and e.employment_status = 'active'
      and e.deleted_at is null;
  end if;

  if employee.id is null then
    select *
      into employee
    from public.employees e
    where e.user_id = actor.id
      and e.company_id = resolved_company_id
      and e.employment_status = 'active'
      and e.deleted_at is null
    limit 1;
  end if;

  if employee.id is null and actor.auth_user_id is not null then
    select *
      into employee
    from public.employees e
    where e.auth_user_id = actor.auth_user_id
      and e.company_id = resolved_company_id
      and e.employment_status = 'active'
      and e.deleted_at is null
    limit 1;
  end if;

  if employee.id is null and actor.email is not null then
    select *
      into employee
    from public.employees e
    where lower(e.email) = lower(actor.email)
      and e.company_id = resolved_company_id
      and e.employment_status = 'active'
      and e.deleted_at is null
    limit 1;
  end if;

  if employee.id is null then
    raise exception 'Active employee record could not be found for this company';
  end if;

  -- Extract coordinates from device metadata
  if device_metadata is not null and device_metadata ? 'location' and device_metadata->'location' is not null then
    event_latitude := nullif(device_metadata->'location'->>'latitude', '')::numeric;
    event_longitude := nullif(device_metadata->'location'->>'longitude', '')::numeric;
  end if;

  -- Resolve workstation: picked one wins, otherwise active assignment
  if workstation_id is not null then
    select *
      into picked_workstation
    from public.company_workstations ws
    where ws.id = workstation_id
      and ws.company_id = resolved_company_id
      and ws.is_active
      and ws.deleted_at is null;

    if picked_workstation.id is null then
      select *
        into picked_workstation
      from public.company_workstations ws
      where ws.id = workstation_id
        and ws.company_id = resolved_company_id;
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
    where assignment.company_id = resolved_company_id
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

  -- If outside geofence radius, strip raw coordinates from stored metadata for employee privacy
  if calculated_geofence_status = 'out_of_range' then
    if enriched_metadata ? 'location' and enriched_metadata->'location' is not null then
      enriched_metadata := jsonb_set(enriched_metadata, '{location,latitude}', 'null'::jsonb, true);
      enriched_metadata := jsonb_set(enriched_metadata, '{location,longitude}', 'null'::jsonb, true);
      enriched_metadata := jsonb_set(enriched_metadata, '{location,hidden_due_to_out_of_range}', 'true'::jsonb, true);
    end if;
    stored_lat := null;
    stored_lng := null;
  else
    stored_lat := event_latitude;
    stored_lng := event_longitude;
  end if;

  select timezone
    into company_timezone
  from public.companies
  where id = resolved_company_id;

  company_timezone := coalesce(nullif(company_timezone, ''), 'Africa/Johannesburg');
  local_now := now() at time zone company_timezone;
  local_date := local_now::date;
  local_time := local_now::time;
  recorded_local_time := local_time;

  select id
    into target_period_id
  from public.payroll_periods
  where company_id = resolved_company_id
    and local_date between period_start and period_end
    and status in ('open', 'reopened')
    and deleted_at is null
  order by period_start desc
  limit 1;

  select *
    into entry
  from public.time_entries
  where company_id = resolved_company_id
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
    where company_id = resolved_company_id
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
        resolved_company_id,
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
      work_date,
      workstation_id,
      status,
      device_metadata
    )
    values (
      resolved_company_id,
      target_timesheet_id,
      employee.id,
      local_date,
      picked_workstation.id,
      'draft',
      enriched_metadata
    )
    returning * into entry;
  end if;

  if requested_event = 'clock_in' then
    if entry.clock_in is not null and entry.clock_out is null then
      raise exception 'You are already clocked in. Clock out or start lunch first.';
    end if;

    if entry.clock_out is not null then
      if requested_at is not null then
        if requested_at <= entry.clock_out then
          raise exception 'New shift start time must be after previous shift clock out (%)', entry.clock_out;
        end if;
      else
        if local_time <= entry.clock_out then
          raise exception 'Cannot start a new shift before previous shift clock out (%)', entry.clock_out;
        end if;
      end if;

      insert into public.time_entries (
        company_id,
        timesheet_id,
        employee_id,
        work_date,
        workstation_id,
        status,
        device_metadata
      )
      values (
        resolved_company_id,
        entry.timesheet_id,
        employee.id,
        local_date,
        coalesce(picked_workstation.id, entry.workstation_id),
        'draft',
        enriched_metadata
      )
      returning * into entry;
    end if;

    if requested_at is not null then
      recorded_local_time := requested_at;
    end if;

    update public.time_entries
    set clock_in = recorded_local_time,
        workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
        device_metadata = enriched_metadata,
        updated_at = now()
    where id = entry.id
    returning * into entry;

  elsif requested_event = 'lunch_start' then
    if entry.clock_in is null then
      raise exception 'Cannot start lunch before clocking in';
    end if;
    if entry.clock_out is not null then
      raise exception 'Shift is already complete';
    end if;
    if entry.lunch_start is not null then
      raise exception 'Lunch already started';
    end if;

    update public.time_entries
    set lunch_start = recorded_local_time,
        workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
        device_metadata = enriched_metadata,
        updated_at = now()
    where id = entry.id
    returning * into entry;

  elsif requested_event = 'lunch_end' then
    if entry.lunch_start is null then
      raise exception 'Cannot end lunch before starting lunch';
    end if;
    if entry.lunch_end is not null then
      raise exception 'Lunch already ended';
    end if;

    update public.time_entries
    set lunch_end = recorded_local_time,
        workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
        device_metadata = enriched_metadata,
        updated_at = now()
    where id = entry.id
    returning * into entry;

  elsif requested_event = 'clock_out' then
    if entry.clock_in is null then
      raise exception 'Cannot clock out before clocking in';
    end if;
    if entry.clock_out is not null then
      raise exception 'Already clocked out for today';
    end if;

    update public.time_entries
    set clock_out = recorded_local_time,
        workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
        device_metadata = enriched_metadata,
        updated_at = now()
    where id = entry.id
    returning * into entry;

  elsif requested_event = 'switch_workstation' then
    if picked_workstation.id is null then
      raise exception 'Choose a valid workstation to switch to';
    end if;

    update public.time_entries
    set workstation_id = picked_workstation.id,
        device_metadata = enriched_metadata,
        updated_at = now()
    where id = entry.id
    returning * into entry;
  end if;

  -- Store clock event in time_clock_events:
  -- When out_of_range, latitude and longitude are stored as NULL so the employee
  -- does NOT appear on the map outside the geofence, while distance_meters and
  -- geofence_status ('out_of_range') record the deviation for manager audit.
  insert into public.time_clock_events (
    company_id,
    time_entry_id,
    employee_id,
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
    device_metadata
  )
  values (
    resolved_company_id,
    entry.id,
    employee.id,
    requested_event,
    coalesce(
      nullif(device_metadata->'location'->>'captured_at', '')::timestamptz,
      now()
    ),
    local_date,
    recorded_local_time,
    stored_lat,
    stored_lng,
    nullif(device_metadata->'location'->>'accuracy', '')::numeric,
    picked_workstation.id,
    calculated_distance,
    calculated_geofence_status,
    jsonb_build_object(
      'source', coalesce(device_metadata->>'source', 'dashboard'),
      'geofence_status', calculated_geofence_status,
      'distance_meters', calculated_distance
    )
  );

  return entry;
end;
$$;

grant execute on function public.record_employee_time_event(public.clock_event_type, jsonb, uuid, time, uuid) to authenticated;

-- RPC: record_employee_interaction_location
-- Captures the employee's location every time they interact with the app while clocked in.
-- If outside the geofence radius, latitude/longitude are stored as NULL so they do NOT appear
-- on the map, but geofence_status ('out_of_range') and distance_meters are recorded as deviance.
create or replace function public.record_employee_interaction_location(
  target_time_entry_id uuid,
  current_latitude numeric,
  current_longitude numeric,
  accuracy_meters numeric default null,
  captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.time_entries%rowtype;
  picked_workstation public.company_workstations%rowtype;
  calculated_distance numeric;
  calculated_geofence_status text;
  company_timezone text;
  local_now timestamp;
  local_date date;
  local_time time;
  stored_lat numeric;
  stored_lng numeric;
begin
  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id
    and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Time entry not found');
  end if;

  -- Only record breadcrumbs for an active clocked-in shift
  if entry.clock_in is null or entry.clock_out is not null then
    return jsonb_build_object('ok', false, 'message', 'Shift is not currently active');
  end if;

  -- Ensure user has access
  if not public.can_access_employee(entry.company_id, entry.employee_id) then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized');
  end if;

  -- Resolve workstation: entry workstation first, fallback to active assignment
  if entry.workstation_id is not null then
    select *
      into picked_workstation
    from public.company_workstations
    where id = entry.workstation_id
      and company_id = entry.company_id;
  end if;

  if picked_workstation.id is null then
    select workstation.*
      into picked_workstation
    from public.employee_workstation_assignments assignment
    join public.company_workstations workstation
      on workstation.id = assignment.workstation_id
     and workstation.company_id = assignment.company_id
     and workstation.is_active
     and workstation.deleted_at is null
    where assignment.company_id = entry.company_id
      and assignment.employee_id = entry.employee_id
      and assignment.is_active
      and assignment.deleted_at is null
      and current_date between assignment.effective_from and coalesce(assignment.effective_to, current_date)
    order by assignment.created_at desc
    limit 1;
  end if;

  if picked_workstation.id is null then
    calculated_geofence_status := 'no_workstation';
  elsif current_latitude is null or current_longitude is null then
    calculated_geofence_status := 'no_location';
  else
    calculated_distance := public.distance_between_coordinates_meters(
      current_latitude,
      current_longitude,
      picked_workstation.latitude,
      picked_workstation.longitude
    );
    calculated_geofence_status := case
      when calculated_distance <= picked_workstation.radius_meters then 'in_range'
      else 'out_of_range'
    end;
  end if;

  select timezone
    into company_timezone
  from public.companies
  where id = entry.company_id;

  company_timezone := coalesce(nullif(company_timezone, ''), 'Africa/Johannesburg');
  local_now := coalesce(captured_at, now()) at time zone company_timezone;
  local_date := local_now::date;
  local_time := local_now::time;

  -- Privacy gate: outside geofence radius -> coordinates set to NULL so user does not appear on map
  if calculated_geofence_status = 'in_range' then
    stored_lat := current_latitude;
    stored_lng := current_longitude;
  else
    stored_lat := null;
    stored_lng := null;
  end if;

  insert into public.time_clock_events (
    company_id,
    time_entry_id,
    employee_id,
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
    device_metadata
  )
  values (
    entry.company_id,
    entry.id,
    entry.employee_id,
    'app_interaction'::public.clock_event_type,
    coalesce(captured_at, now()),
    local_date,
    local_time,
    stored_lat,
    stored_lng,
    accuracy_meters,
    picked_workstation.id,
    calculated_distance,
    calculated_geofence_status,
    jsonb_build_object(
      'source', 'app_interaction',
      'geofence_status', calculated_geofence_status,
      'distance_meters', calculated_distance
    )
  );

  return jsonb_build_object(
    'ok', true,
    'geofence_status', calculated_geofence_status,
    'distance_meters', calculated_distance,
    'in_range', (calculated_geofence_status = 'in_range')
  );
end;
$$;

grant execute on function public.record_employee_interaction_location(uuid, numeric, numeric, numeric, timestamptz) to authenticated;

-- Strip coordinates from any historical out-of-range events to ensure full POPIA compliance and no outside markers on the map
update public.time_clock_events
set latitude = null, longitude = null
where geofence_status = 'out_of_range'
  and (latitude is not null or longitude is not null);
