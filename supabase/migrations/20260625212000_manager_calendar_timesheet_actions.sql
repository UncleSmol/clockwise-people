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
    branch_id,
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
    employee.branch_id,
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
      raise exception 'You do not have permission to load time off for one or more employees';
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
        branch_id,
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
        employee.branch_id,
        day_hours,
        day_hours,
        0,
        0,
        day_hours,
        false,
        'approved',
        'Time off: ' || coalesce(leave_type.name, 'Approved leave')
      );

      created_count := created_count + 1;
    end loop;
  end loop;

  return created_count;
end;
$$;

grant execute on function public.create_managed_draft_time_entry_for_date(uuid, date) to authenticated;
grant execute on function public.load_managed_leave_request_time_entries(uuid[]) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-manager-calendar-actions',
  'Manager calendar actions are expanded',
  'Employees can inspect calendar timesheets, and managers can create subordinate timesheets and load approved time off.',
  array[
    'Employee calendar timesheet records now open into a detail modal.',
    'Managers can create draft timesheets for accessible employees from the company calendar.',
    'Managers can load approved time off requests individually or in bulk into timesheet rows.',
    'Bulk time off loading skips days that already have a timesheet to avoid overwriting clocked work.'
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
