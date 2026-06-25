create or replace function public.easter_sunday(target_year integer)
returns date
language plpgsql
immutable
as $$
declare
  a integer;
  b integer;
  c integer;
  d integer;
  e integer;
  f integer;
  g integer;
  h integer;
  i integer;
  k integer;
  l integer;
  m integer;
  easter_month integer;
  easter_day integer;
begin
  a := target_year % 19;
  b := target_year / 100;
  c := target_year % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  easter_month := (h + l - 7 * m + 114) / 31;
  easter_day := ((h + l - 7 * m + 114) % 31) + 1;

  return make_date(target_year, easter_month, easter_day);
end;
$$;

create or replace function public.south_african_public_holidays(target_year integer)
returns table (
  holiday_date date,
  name text
)
language sql
stable
as $$
  with base_holidays as (
    select make_date(target_year, 1, 1) as holiday_date, 'New Year''s Day' as name
    union all select make_date(target_year, 3, 21), 'Human Rights Day'
    union all select public.easter_sunday(target_year) - 2, 'Good Friday'
    union all select public.easter_sunday(target_year) + 1, 'Family Day'
    union all select make_date(target_year, 4, 27), 'Freedom Day'
    union all select make_date(target_year, 5, 1), 'Workers'' Day'
    union all select make_date(target_year, 6, 16), 'Youth Day'
    union all select make_date(target_year, 8, 9), 'National Women''s Day'
    union all select make_date(target_year, 9, 24), 'Heritage Day'
    union all select make_date(target_year, 12, 16), 'Day of Reconciliation'
    union all select make_date(target_year, 12, 25), 'Christmas Day'
    union all select make_date(target_year, 12, 26), 'Day of Goodwill'
  ),
  observed_holidays as (
    select
      holiday_date + 1 as holiday_date,
      'Public holiday ' || name || ' observed' as name
    from base_holidays
    where extract(dow from holiday_date)::integer = 0
  )
  select holiday_date, name from base_holidays
  union all
  select holiday_date, name from observed_holidays
  order by holiday_date;
$$;

create or replace function public.ensure_current_year_za_public_holidays(
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
  affected_count integer := 0;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  insert into public.company_public_holidays (
    company_id,
    holiday_date,
    name,
    is_paid
  )
  select
    target_company_id,
    holidays.holiday_date,
    holidays.name,
    true
  from public.south_african_public_holidays(target_year) holidays
  on conflict (company_id, holiday_date)
  do update set
    name = excluded.name,
    is_paid = true,
    deleted_at = null,
    updated_at = now();

  get diagnostics affected_count = row_count;

  perform public.sync_company_public_holiday_time_entries(
    target_company_id,
    target_year
  );

  return affected_count;
end;
$$;

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
      e.branch_id,
      e.work_schedule_id,
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
    target_schedule_id := item.work_schedule_id;

    if target_schedule_id is null then
      select ws.id
        into target_schedule_id
      from public.work_schedules ws
      where ws.company_id = target_company_id
        and ws.branch_id = item.branch_id
        and ws.scope = 'branch'
        and ws.is_active
        and ws.deleted_at is null
      order by ws.created_at desc
      limit 1;
    end if;

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

    scheduled_paid_hours := null;

    if target_schedule_id is not null then
      select nullif(sd.paid_hours, 0)
        into scheduled_paid_hours
      from public.schedule_days sd
      where sd.work_schedule_id = target_schedule_id
        and sd.day_of_week = extract(dow from item.holiday_date)::integer
        and sd.is_working_day
      limit 1;
    end if;

    if target_schedule_id is null and extract(dow from item.holiday_date)::integer between 1 and 5 then
      scheduled_paid_hours := 8;
    end if;

    if coalesce(scheduled_paid_hours, 0) <= 0 then
      continue;
    end if;

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
      branch_id,
      gross_hours,
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
      item.branch_id,
      scheduled_paid_hours,
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
      branch_id = excluded.branch_id,
      gross_hours = excluded.gross_hours,
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
    branch_id,
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
    employee.branch_id,
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
    to_jsonb(entry),
    'Employee added past draft timesheet from calendar'
  );

  return entry;
end;
$$;

create or replace function public.delete_own_draft_time_entry(
  target_time_entry_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
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
    into entry
  from public.time_entries
  where id = target_time_entry_id
    and company_id = actor.company_id
    and employee_id = actor.employee_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Timesheet could not be found';
  end if;

  if entry.status not in ('draft', 'rejected') then
    raise exception 'Only draft or rejected timesheets can be deleted';
  end if;

  delete from public.time_clock_events
  where time_entry_id = entry.id;

  delete from public.time_entries
  where id = entry.id;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    old_value,
    reason
  )
  values (
    entry.company_id,
    actor.id,
    'delete',
    'time_entries',
    entry.id,
    to_jsonb(entry),
    'Employee deleted draft timesheet from calendar'
  );

  return 1;
end;
$$;

grant execute on function public.easter_sunday(integer) to authenticated;
grant execute on function public.south_african_public_holidays(integer) to authenticated;
grant execute on function public.ensure_current_year_za_public_holidays(uuid, integer) to authenticated;
grant execute on function public.sync_company_public_holiday_time_entries(uuid, integer) to authenticated;
grant execute on function public.create_own_draft_time_entry_for_date(date) to authenticated;
grant execute on function public.delete_own_draft_time_entry(uuid) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-calendar-timesheets',
  'Timesheets now have a calendar view',
  'South African public holidays are loaded automatically and employees can manage draft past timesheets from a calendar.',
  array[
    'The current year''s South African public holidays are loaded into each company automatically.',
    'Paid public holidays are booked as approved time entries for employees who would normally work that day.',
    'Employees can add past draft timesheets from the calendar.',
    'Draft and rejected timesheets can be edited or deleted before submission.'
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
