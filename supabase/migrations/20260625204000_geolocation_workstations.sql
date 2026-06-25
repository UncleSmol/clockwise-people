create table if not exists public.company_workstations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  address text,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  radius_meters integer not null default 150,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint company_workstations_name_not_blank check (btrim(name) <> ''),
  constraint company_workstations_latitude_range check (latitude between -90 and 90),
  constraint company_workstations_longitude_range check (longitude between -180 and 180),
  constraint company_workstations_radius_range check (radius_meters between 25 and 5000)
);

create trigger company_workstations_set_updated_at
before update on public.company_workstations
for each row execute function public.set_updated_at();

create index if not exists idx_company_workstations_company
on public.company_workstations(company_id, is_active)
where deleted_at is null;

create table if not exists public.employee_workstation_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  workstation_id uuid not null references public.company_workstations(id) on delete cascade,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint employee_workstation_assignment_dates check (
    effective_to is null or effective_to >= effective_from
  )
);

create trigger employee_workstation_assignments_set_updated_at
before update on public.employee_workstation_assignments
for each row execute function public.set_updated_at();

create unique index if not exists idx_employee_workstation_assignments_one_active
on public.employee_workstation_assignments(company_id, employee_id)
where is_active and deleted_at is null;

create index if not exists idx_employee_workstation_assignments_workstation
on public.employee_workstation_assignments(company_id, workstation_id, is_active)
where deleted_at is null;

alter table public.company_workstations enable row level security;
alter table public.employee_workstation_assignments enable row level security;

drop policy if exists "company members can view workstations" on public.company_workstations;
create policy "company members can view workstations"
on public.company_workstations for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "owners and hr admins can manage workstations" on public.company_workstations;
create policy "owners and hr admins can manage workstations"
on public.company_workstations for all
to authenticated
using (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]))
with check (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]));

drop policy if exists "company members can view workstation assignments" on public.employee_workstation_assignments;
create policy "company members can view workstation assignments"
on public.employee_workstation_assignments for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "owners and hr admins can manage workstation assignments" on public.employee_workstation_assignments;
create policy "owners and hr admins can manage workstation assignments"
on public.employee_workstation_assignments for all
to authenticated
using (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]))
with check (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]));

alter table public.time_clock_events
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists accuracy_meters numeric(10,2),
  add column if not exists workstation_id uuid references public.company_workstations(id) on delete set null,
  add column if not exists distance_meters numeric(10,2),
  add column if not exists geofence_status text not null default 'unknown';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'time_clock_events_geofence_status_valid'
  ) then
    alter table public.time_clock_events
      add constraint time_clock_events_geofence_status_valid
      check (
        geofence_status in (
          'in_range',
          'out_of_range',
          'no_location',
          'no_workstation',
          'unknown'
        )
      );
  end if;
end;
$$;

create index if not exists idx_time_clock_events_geofence
on public.time_clock_events(company_id, employee_id, geofence_status, event_at desc);

create or replace function public.distance_between_coordinates_meters(
  from_latitude numeric,
  from_longitude numeric,
  to_latitude numeric,
  to_longitude numeric
)
returns numeric
language sql
immutable
as $$
  select (
    6371000 * 2 * asin(
      least(
        1,
        sqrt(
          power(sin(radians((to_latitude - from_latitude)::double precision) / 2), 2)
          + cos(radians(from_latitude::double precision))
          * cos(radians(to_latitude::double precision))
          * power(sin(radians((to_longitude - from_longitude)::double precision) / 2), 2)
        )
      )
    )
  )::numeric;
$$;

create or replace function public.upsert_company_workstation(
  target_workstation_id uuid,
  workstation_name text,
  workstation_branch_id uuid,
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

  if workstation_branch_id is not null and not exists (
    select 1
    from public.branches branch
    where branch.id = workstation_branch_id
      and branch.company_id = target_company_id
      and branch.deleted_at is null
  ) then
    raise exception 'Branch does not belong to this company';
  end if;

  if target_workstation_id is null then
    insert into public.company_workstations (
      company_id,
      branch_id,
      name,
      address,
      latitude,
      longitude,
      radius_meters
    )
    values (
      target_company_id,
      workstation_branch_id,
      btrim(workstation_name),
      nullif(btrim(coalesce(workstation_address, '')), ''),
      workstation_latitude,
      workstation_longitude,
      workstation_radius_meters
    )
    returning id into saved_workstation_id;
  else
    update public.company_workstations
    set branch_id = workstation_branch_id,
        name = btrim(workstation_name),
        address = nullif(btrim(coalesce(workstation_address, '')), ''),
        latitude = workstation_latitude,
        longitude = workstation_longitude,
        radius_meters = workstation_radius_meters,
        is_active = true,
        deleted_at = null,
        updated_at = now()
    where id = target_workstation_id
      and company_id = target_company_id
      and deleted_at is null
    returning id into saved_workstation_id;

    if saved_workstation_id is null then
      raise exception 'Workstation could not be found';
    end if;
  end if;

  return saved_workstation_id;
end;
$$;

create or replace function public.deactivate_company_workstation(
  target_workstation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
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

  update public.company_workstations
  set is_active = false,
      deleted_at = now(),
      updated_at = now()
  where id = target_workstation_id
    and company_id = target_company_id
    and deleted_at is null;

  update public.employee_workstation_assignments
  set is_active = false,
      deleted_at = now(),
      updated_at = now()
  where workstation_id = target_workstation_id
    and company_id = target_company_id
    and deleted_at is null;
end;
$$;

create or replace function public.assign_employee_workstation(
  target_employee_id uuid,
  target_workstation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_company_id uuid;
begin
  select company_id
    into employee_company_id
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if employee_company_id is null then
    raise exception 'Employee could not be found';
  end if;

  if not public.has_any_company_role(employee_company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can assign workstations';
  end if;

  if target_workstation_id is not null and not exists (
    select 1
    from public.company_workstations workstation
    where workstation.id = target_workstation_id
      and workstation.company_id = employee_company_id
      and workstation.is_active
      and workstation.deleted_at is null
  ) then
    raise exception 'Workstation does not belong to this company';
  end if;

  update public.employee_workstation_assignments
  set is_active = false,
      effective_to = current_date,
      deleted_at = now(),
      updated_at = now()
  where company_id = employee_company_id
    and employee_id = target_employee_id
    and is_active
    and deleted_at is null;

  if target_workstation_id is not null then
    insert into public.employee_workstation_assignments (
      company_id,
      employee_id,
      workstation_id,
      is_active
    )
    values (
      employee_company_id,
      target_employee_id,
      target_workstation_id,
      true
    );
  end if;
end;
$$;

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
      branch_id,
      status
    )
    values (
      employee.company_id,
      target_timesheet_id,
      employee.id,
      target_period_id,
      local_date,
      employee.branch_id,
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
    if entry.clock_in is null then
      raise exception 'Clock in before clocking out';
    end if;

    if entry.clock_out is not null then
      raise exception 'You have already clocked out for today';
    end if;

    if entry.lunch_start is not null and entry.lunch_end is null then
      raise exception 'End lunch before clocking out';
    end if;

    update public.time_entries
    set clock_out = local_time,
        updated_at = now()
    where id = entry.id
    returning * into entry;
  else
    raise exception 'Unsupported time event';
  end if;

  perform public.refresh_time_entry_calculations(entry.id);

  insert into public.time_clock_events (
    company_id,
    employee_id,
    time_entry_id,
    event_type,
    event_at,
    local_work_date,
    local_event_time,
    device_metadata,
    latitude,
    longitude,
    accuracy_meters,
    workstation_id,
    distance_meters,
    geofence_status,
    created_by
  )
  values (
    entry.company_id,
    entry.employee_id,
    entry.id,
    requested_event,
    now(),
    local_date,
    local_time,
    enriched_metadata,
    event_latitude,
    event_longitude,
    event_accuracy,
    assigned_workstation.id,
    calculated_distance,
    calculated_geofence_status,
    actor.id
  );

  select *
    into entry
  from public.time_entries
  where id = entry.id;

  return entry;
end;
$$;

grant execute on function public.distance_between_coordinates_meters(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.upsert_company_workstation(uuid, text, uuid, text, numeric, numeric, integer) to authenticated;
grant execute on function public.deactivate_company_workstation(uuid) to authenticated;
grant execute on function public.assign_employee_workstation(uuid, uuid) to authenticated;
grant execute on function public.record_employee_time_event(public.clock_event_type, jsonb) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-geolocation-workstations',
  'Workstation geolocation is available',
  'Companies can create mapped workstations, assign employees, and capture clocking location status.',
  array[
    'Company admins can define workstation coordinates and geofence radius.',
    'Employees can be assigned to a workstation for location-aware clocking.',
    'Clock events now store browser-provided coordinates, accuracy, workstation distance, and geofence status.',
    'Out-of-range, missing-location, and no-workstation clock events are identifiable for review.'
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
