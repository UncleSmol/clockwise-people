-- Migration: 20261114091500_fix_record_employee_time_event_payroll_periods.sql
-- Description: Fix column references on public.payroll_periods in record_employee_time_event.
-- Replaces non-existent columns pp.start_date / pp.end_date with pp.period_start / pp.period_end.
-- Removes non-existent column approved_by_user_id from timesheets insertion.

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
    select e.*
      into employee
    from public.employees e
    join public.users u on u.id = e.user_id
    where u.auth_user_id = actor.auth_user_id
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

  -- Resolve workstation: picked one wins, otherwise active assignment, otherwise employee standard workstation
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

    -- Fallback: if assignment table has no record, use employee's standard workstation
    if picked_workstation.id is null and employee.workstation_id is not null then
      select *
        into picked_workstation
      from public.company_workstations ws
      where ws.id = employee.workstation_id
        and ws.company_id = resolved_company_id
        and ws.is_active
        and ws.deleted_at is null;

      if picked_workstation.id is null then
        select *
          into picked_workstation
        from public.company_workstations ws
        where ws.id = employee.workstation_id
          and ws.company_id = resolved_company_id;
      end if;
    end if;
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
    )
  );

  select coalesce(c.timezone, 'Africa/Johannesburg')
    into company_timezone
  from public.companies c
  where c.id = resolved_company_id;

  local_now := timezone(company_timezone, now());
  local_date := local_now::date;
  local_time := date_trunc('second', local_now::time);
  recorded_local_time := coalesce(requested_at, local_time);

  -- Ensure active draft timesheet header exists
  select t.id, t.payroll_period_id
    into target_timesheet_id, target_period_id
  from public.timesheets t
  where t.company_id = resolved_company_id
    and t.employee_id = employee.id
    and t.status in ('draft', 'rejected')
    and t.deleted_at is null
  order by t.created_at desc
  limit 1;

  if target_timesheet_id is null then
    select pp.id
      into target_period_id
    from public.payroll_periods pp
    where pp.company_id = resolved_company_id
      and local_date between pp.period_start and pp.period_end
      and pp.deleted_at is null
    order by pp.period_start desc
    limit 1;

    insert into public.timesheets (
      company_id,
      employee_id,
      payroll_period_id,
      status
    ) values (
      resolved_company_id,
      employee.id,
      target_period_id,
      'draft'
    )
    returning id into target_timesheet_id;
  end if;

  -- For clock_in: check if there is an active open shift
  if requested_event = 'clock_in' then
    select *
      into entry
    from public.time_entries e
    where e.company_id = resolved_company_id
      and e.employee_id = employee.id
      and e.work_date = local_date
      and e.clock_in is not null
      and e.clock_out is null
      and e.deleted_at is null
    order by e.created_at desc
    limit 1;

    if entry.id is not null then
      raise exception 'Shift already active: You are currently clocked in. Clock out before starting a new shift.';
    end if;

    select *
      into entry
    from public.time_entries e
    where e.company_id = resolved_company_id
      and e.employee_id = employee.id
      and e.work_date = local_date
      and e.clock_in is null
      and e.clock_out is null
      and e.deleted_at is null
    order by e.created_at desc
    limit 1;
  else
    -- For lunch/clock_out: match today's latest active shift
    select *
      into entry
    from public.time_entries e
    where e.company_id = resolved_company_id
      and e.employee_id = employee.id
      and e.work_date = local_date
      and e.clock_in is not null
      and e.clock_out is null
      and e.deleted_at is null
    order by e.created_at desc
    limit 1;

    if entry.id is null then
      select *
        into entry
      from public.time_entries e
      where e.company_id = resolved_company_id
        and e.employee_id = employee.id
        and e.work_date = local_date
        and e.deleted_at is null
      order by e.created_at desc
      limit 1;
    end if;
  end if;

  if entry.id is null then
    insert into public.time_entries (
      company_id,
      employee_id,
      timesheet_id,
      payroll_period_id,
      work_date,
      workstation_id,
      clock_in,
      lunch_start,
      lunch_end,
      clock_out,
      device_metadata
    ) values (
      resolved_company_id,
      employee.id,
      target_timesheet_id,
      target_period_id,
      local_date,
      picked_workstation.id,
      case when requested_event = 'clock_in' then recorded_local_time else null end,
      case when requested_event = 'lunch_start' then recorded_local_time else null end,
      case when requested_event = 'lunch_end' then recorded_local_time else null end,
      case when requested_event = 'clock_out' then recorded_local_time else null end,
      enriched_metadata
    )
    returning * into entry;
  else
    if requested_event = 'clock_in' then
      if entry.clock_in is null then
        update public.time_entries
        set clock_in = recorded_local_time,
            timesheet_id = coalesce(timesheet_id, target_timesheet_id),
            payroll_period_id = coalesce(payroll_period_id, target_period_id),
            workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
            device_metadata = enriched_metadata
        where id = entry.id
        returning * into entry;
      else
        insert into public.time_entries (
          company_id,
          employee_id,
          timesheet_id,
          payroll_period_id,
          work_date,
          workstation_id,
          clock_in,
          device_metadata
        ) values (
          resolved_company_id,
          employee.id,
          target_timesheet_id,
          target_period_id,
          local_date,
          coalesce(picked_workstation.id, entry.workstation_id),
          recorded_local_time,
          enriched_metadata
        )
        returning * into entry;
      end if;
    elsif requested_event = 'lunch_start' then
      if entry.lunch_start is not null and entry.lunch_end is not null then
        raise exception 'Lunch already completed for this shift. Company policy only allows 1 lunch break per shift.';
      end if;
      update public.time_entries
      set lunch_start = coalesce(lunch_start, recorded_local_time),
          timesheet_id = coalesce(timesheet_id, target_timesheet_id),
          payroll_period_id = coalesce(payroll_period_id, target_period_id),
          workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
          device_metadata = enriched_metadata
      where id = entry.id
      returning * into entry;
    elsif requested_event = 'lunch_end' then
      update public.time_entries
      set lunch_end = coalesce(lunch_end, recorded_local_time),
          timesheet_id = coalesce(timesheet_id, target_timesheet_id),
          payroll_period_id = coalesce(payroll_period_id, target_period_id),
          workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
          device_metadata = enriched_metadata
      where id = entry.id
      returning * into entry;
    elsif requested_event = 'clock_out' then
      update public.time_entries
      set clock_out = coalesce(clock_out, recorded_local_time),
          timesheet_id = coalesce(timesheet_id, target_timesheet_id),
          payroll_period_id = coalesce(payroll_period_id, target_period_id),
          workstation_id = coalesce(picked_workstation.id, entry.workstation_id),
          device_metadata = enriched_metadata
      where id = entry.id
      returning * into entry;
    elsif requested_event = 'switch_workstation' then
      update public.time_entries
      set workstation_id = picked_workstation.id,
          timesheet_id = coalesce(timesheet_id, target_timesheet_id),
          payroll_period_id = coalesce(payroll_period_id, target_period_id),
          device_metadata = enriched_metadata
      where id = entry.id
      returning * into entry;
    end if;
  end if;

  if calculated_geofence_status = 'out_of_range' then
    stored_lat := null;
    stored_lng := null;
  else
    stored_lat := event_latitude;
    stored_lng := event_longitude;
  end if;

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
    device_metadata
  ) values (
    resolved_company_id,
    employee.id,
    entry.id,
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

