-- Fix remaining branch_id references after branches table removal.
--
-- 1. Drops orphan column company_workstations.branch_id
-- 2. Renames time_entries.branch_id -> workstation_id (FK -> company_workstations)
-- 3. Recreates all 6+ functions that still reference the dropped employees.branch_id
--    and/or the old time_entries.branch_id column

-- Step 1: Drop orphan column on company_workstations
alter table public.company_workstations drop column if exists branch_id;

-- Step 2: Rename time_entries.branch_id -> workstation_id
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'time_entries' and column_name = 'branch_id'
  ) then
    alter table public.time_entries rename column branch_id to workstation_id;
    alter table public.time_entries alter column workstation_id drop not null;
    alter table public.time_entries add constraint fk_time_entries_workstation
      foreign key (workstation_id) references public.company_workstations(id) on delete set null;
  end if;
end $$;

-- Step 3: Recreate functions that reference employees.branch_id or time_entries.branch_id

-- 3a. record_employee_time_event (latest version from geolocation migration)
create or replace function public.record_employee_time_event(
  requested_event public.clock_event_type,
  device_metadata jsonb default '{}'::jsonb
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
  target_period_id uuid;
  target_timesheet_id uuid;
  entry public.time_entries%rowtype;
  event_latitude numeric;
  event_longitude numeric;
  event_accuracy numeric;
  assigned_workstation public.company_workstations%rowtype;
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

  select workstation.*
    into assigned_workstation
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

  if assigned_workstation.id is null then
    calculated_geofence_status := 'no_workstation';
  elsif event_latitude is null or event_longitude is null then
    calculated_geofence_status := 'no_location';
  else
    calculated_distance := public.distance_between_coordinates_meters(
      event_latitude,
      event_longitude,
      assigned_workstation.latitude,
      assigned_workstation.longitude
    );
    calculated_geofence_status := case
      when calculated_distance <= assigned_workstation.radius_meters then 'in_range'
      else 'out_of_range'
    end;
  end if;

  enriched_metadata := jsonb_set(
    coalesce(device_metadata, '{}'::jsonb),
    '{geofence}',
    jsonb_build_object(
      'status', calculated_geofence_status,
      'distance_meters', calculated_distance,
      'workstation_id', assigned_workstation.id,
      'workstation_name', assigned_workstation.name,
      'radius_meters', assigned_workstation.radius_meters
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
      employee.workstation_id,
      'draft'
    )
    returning * into entry;
  end if;

  if entry.status not in ('draft', 'rejected') then
    raise exception 'This time entry can no longer be edited';
  end if;

  if requested_event = 'clock_in' then
    if entry.clock_in is not null then
      raise exception 'You have already clocked in for today';
    end if;

    update public.time_entries
    set clock_in = local_time,
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
        updated_at = now()
    where id = entry.id
    returning * into entry;
  else
    raise exception 'Unknown clock event type';
  end if;

  return entry;
end;
$$;

-- 3b. create_own_draft_time_entry_for_date
create or replace function public.create_own_draft_time_entry_for_date(
  target_work_date date
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
  current_work_date date;
  target_period_id uuid;
  target_timesheet_id uuid;
  entry public.time_entries%rowtype;
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

  select *
    into employee
  from public.employees
  where id = actor.employee_id
    and company_id = actor.company_id
    and employment_status = 'active'
    and deleted_at is null;

  if not found then
    raise exception 'Active employee record could not be found';
  end if;

  select timezone
    into company_timezone
  from public.companies
  where id = actor.company_id;

  current_work_date := (now() at time zone coalesce(nullif(company_timezone, ''), 'UTC'))::date;

  if target_work_date >= current_work_date then
    raise exception 'Past timesheets can only be added for dates before today';
  end if;

  if exists (
    select 1
    from public.company_public_holidays h
    where h.company_id = actor.company_id
      and h.holiday_date = target_work_date
      and h.deleted_at is null
  ) then
    raise exception 'Public holidays are booked automatically';
  end if;

  select *
    into entry
  from public.time_entries
  where company_id = actor.company_id
    and employee_id = actor.employee_id
    and work_date = target_work_date
    and deleted_at is null
  for update;

  if found then
    if entry.status not in ('draft', 'rejected') then
      raise exception 'This timesheet can no longer be edited';
    end if;

    return entry;
  end if;

  select id
    into target_period_id
  from public.payroll_periods
  where company_id = actor.company_id
    and target_work_date between period_start and period_end
    and status in ('open', 'reopened')
    and deleted_at is null
  order by period_start desc
  limit 1;

  select id
    into target_timesheet_id
  from public.timesheets
  where company_id = actor.company_id
    and employee_id = actor.employee_id
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
      actor.company_id,
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
    missing_clocking,
    status,
    notes
  )
  values (
    actor.company_id,
    target_timesheet_id,
    employee.id,
    target_period_id,
    target_work_date,
    employee.workstation_id,
    true,
    'draft',
    'Added from calendar'
  )
  returning * into entry;

  perform public.refresh_time_entry_calculations(entry.id);

  select *
    into entry
  from public.time_entries
  where id = entry.id;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    new_value,
    reason
  )
  values (
    entry.company_id,
    actor.id,
    'create',
    'time_entries',
    entry.id,
    row_to_json(entry)::jsonb,
    'Created own draft time entry from calendar'
  );

  return entry;
end;
$$;

-- 3c. create_managed_draft_time_entry_for_date
create or replace function public.create_managed_draft_time_entry_for_date(
  target_employee_id uuid,
  target_work_date date
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  employee public.employees%rowtype;
  company_timezone text;
  current_work_date date;
  target_period_id uuid;
  target_timesheet_id uuid;
  entry public.time_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
    into employee
  from public.employees
  where id = target_employee_id
    and employment_status = 'active'
    and deleted_at is null;

  if not found then
    raise exception 'Active employee record could not be found';
  end if;

  if not public.can_manage_time_record(employee.company_id, employee.id) then
    raise exception 'You do not have permission to manage this employee timesheet';
  end if;

  select timezone
    into company_timezone
  from public.companies
  where id = employee.company_id;

  current_work_date := (now() at time zone coalesce(nullif(company_timezone, ''), 'UTC'))::date;

  if target_work_date > current_work_date then
    raise exception 'Managers can only create timesheets up to today';
  end if;

  select *
    into entry
  from public.time_entries
  where company_id = employee.company_id
    and employee_id = employee.id
    and work_date = target_work_date
    and deleted_at is null
  for update;

  if found then
    return entry;
  end if;

  select id
    into target_period_id
  from public.payroll_periods
  where company_id = employee.company_id
    and target_work_date between period_start and period_end
    and status in ('open', 'reopened')
    and deleted_at is null
  order by period_start desc
  limit 1;

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
    missing_clocking,
    status,
    notes
  )
  values (
    employee.company_id,
    target_timesheet_id,
    employee.id,
    target_period_id,
    target_work_date,
    employee.workstation_id,
    true,
    'draft',
    'Manager added draft timesheet from calendar'
  )
  returning * into entry;

  perform public.refresh_time_entry_calculations(entry.id);

  select *
    into entry
  from public.time_entries
  where id = entry.id;

  return entry;
end;
$$;

-- 3d. load_managed_leave_request_time_entries (latest version from leave_language_consistency)
create or replace function public.load_managed_leave_request_time_entries(
  target_leave_request_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  request public.leave_requests%rowtype;
  employee public.employees%rowtype;
  leave_type public.leave_types%rowtype;
  calculated jsonb;
  day_item jsonb;
  day_date date;
  day_hours numeric(8,2);
  target_period_id uuid;
  target_timesheet_id uuid;
  created_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  for request in
    select *
    from public.leave_requests
    where id = any(coalesce(target_leave_request_ids, '{}'::uuid[]))
      and status = 'approved'
      and deleted_at is null
    order by start_date
  loop
    select *
      into employee
    from public.employees
    where id = request.employee_id
      and company_id = request.company_id
      and deleted_at is null;

    if not found then
      continue;
    end if;

    if not public.can_manage_time_record(request.company_id, request.employee_id) then
      raise exception 'You do not have permission to load leave for one or more employees';
    end if;

    select *
      into leave_type
    from public.leave_types
    where id = request.leave_type_id
      and company_id = request.company_id;

    calculated := public.calculate_employee_leave_request_hours(
      request.employee_id,
      request.leave_type_id,
      request.start_date,
      request.end_date
    );

    for day_item in
      select value
      from jsonb_array_elements(coalesce(calculated -> 'days', '[]'::jsonb))
    loop
      day_date := (day_item ->> 'date')::date;
      day_hours := coalesce((day_item ->> 'hours')::numeric, 0);

      if day_hours <= 0 then
        continue;
      end if;

      if exists (
        select 1
        from public.time_entries existing
        where existing.company_id = request.company_id
          and existing.employee_id = request.employee_id
          and existing.work_date = day_date
          and existing.deleted_at is null
      ) then
        continue;
      end if;

      select id
        into target_period_id
      from public.payroll_periods
      where company_id = request.company_id
        and day_date between period_start and period_end
        and status in ('open', 'reopened')
        and deleted_at is null
      order by period_start desc
      limit 1;

      select id
        into target_timesheet_id
      from public.timesheets
      where company_id = request.company_id
        and employee_id = request.employee_id
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
          request.company_id,
          request.employee_id,
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
        paid_hours,
        normal_hours,
        overtime_hours,
        lunch_hours,
        gross_hours,
        missing_clocking,
        status,
        notes
      )
      values (
        request.company_id,
        target_timesheet_id,
        request.employee_id,
        target_period_id,
        day_date,
        employee.workstation_id,
        day_hours,
        day_hours,
        0,
        0,
        day_hours,
        false,
        'approved',
        'Leave: ' || coalesce(leave_type.name, 'Approved leave')
      );

      created_count := created_count + 1;
    end loop;
  end loop;

  return created_count;
end;
$$;

-- 3e. sync_company_public_holiday_time_entries (latest version with NT fill-up)
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
    )
    on conflict (company_id, employee_id, work_date)
    do update set
      timesheet_id = excluded.timesheet_id,
      payroll_period_id = excluded.payroll_period_id,
      workstation_id = excluded.workstation_id,
      gross_hours = excluded.gross_hours,
      lunch_hours = excluded.lunch_hours,
      paid_hours = excluded.paid_hours,
      normal_hours = excluded.normal_hours,
      overtime_hours = 0,
      missing_clocking = false,
      late_arrival = false,
      early_departure = false,
      notes = excluded.notes,
      status = 'approved',
      approved_by = actor_id,
      approved_at = now(),
      deleted_at = null,
      updated_at = now()
    where public.time_entries.deleted_at is not null
       or (
        public.time_entries.status in ('draft', 'approved')
        and public.time_entries.clock_in is null
        and public.time_entries.lunch_start is null
        and public.time_entries.lunch_end is null
        and public.time_entries.clock_out is null
        and coalesce(public.time_entries.notes, '') like 'Public holiday:%'
      );

    get diagnostics affected_count = row_count;
  end loop;

  return affected_count;
end;
$$;

-- Step 4: Sync any time entries that still reference the old branch_id column
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'time_entries' and column_name = 'workstation_id'
  ) then
    update public.time_entries te
    set workstation_id = e.workstation_id
    from public.employees e
    where te.employee_id = e.id
      and te.workstation_id is null
      and e.workstation_id is not null;
  end if;
end $$;

-- 3f. upsert_company_workstation (removed branch_id parameter)
create or replace function public.upsert_company_workstation(
  target_workstation_id uuid,
  workstation_name text,
  workstation_address text,
  workstation_latitude numeric,
  workstation_longitude numeric,
  workstation_radius_meters integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  saved_workstation_id uuid;
begin
  select company_id
    into target_company_id
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by created_at asc
  limit 1;

  if target_company_id is null then
    raise exception 'No active company is linked to this login';
  end if;

  if not public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can manage workstations';
  end if;

  if target_workstation_id is null then
    insert into public.company_workstations (
      company_id,
      name,
      address,
      latitude,
      longitude,
      radius_meters
    )
    values (
      target_company_id,
      btrim(workstation_name),
      nullif(btrim(coalesce(workstation_address, '')), ''),
      workstation_latitude,
      workstation_longitude,
      workstation_radius_meters
    )
    returning id into saved_workstation_id;
  else
    update public.company_workstations
    set name = btrim(workstation_name),
        address = nullif(btrim(coalesce(workstation_address, '')), ''),
        latitude = workstation_latitude,
        longitude = workstation_longitude,
        radius_meters = workstation_radius_meters,
        is_active = true,
        deleted_at = null,
        updated_at = now()
    where id = target_workstation_id
      and company_id = target_company_id;

    if not found then
      raise exception 'Workstation not found or belongs to another company';
    end if;

    saved_workstation_id := target_workstation_id;
  end if;

  return saved_workstation_id;
end;
$$;

grant execute on function public.record_employee_time_event(public.clock_event_type, jsonb) to authenticated;
grant execute on function public.create_own_draft_time_entry_for_date(date) to authenticated;
grant execute on function public.create_managed_draft_time_entry_for_date(uuid, date) to authenticated;
grant execute on function public.load_managed_leave_request_time_entries(uuid[]) to authenticated;
grant execute on function public.sync_company_public_holiday_time_entries(uuid, integer) to authenticated;
grant execute on function public.upsert_company_workstation(uuid, text, text, numeric, numeric, integer) to authenticated;
