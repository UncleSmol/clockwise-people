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
        'Leave: ' || coalesce(leave_type.name, 'Approved leave')
      );

      created_count := created_count + 1;
    end loop;
  end loop;

  return created_count;
end;
$$;

create or replace function public.notify_employee_leave_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_user_id uuid;
  leave_type_name text;
  notification_title text;
  notification_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status = old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select user_id
    into recipient_user_id
  from public.employees
  where id = new.employee_id;

  select name
    into leave_type_name
  from public.leave_types
  where id = new.leave_type_id;

  notification_title := case
    when new.status = 'approved' then 'Leave approved'
    else 'Leave rejected'
  end;

  notification_body := coalesce(leave_type_name, 'Leave') || ' from ' ||
    new.start_date::text || ' to ' || new.end_date::text || ' was ' || new.status::text || '.';

  insert into public.app_notifications (
    company_id,
    user_id,
    employee_id,
    category,
    title,
    body,
    target_type,
    target_id,
    target_href,
    metadata
  )
  values (
    new.company_id,
    recipient_user_id,
    new.employee_id,
    'leave_' || new.status::text,
    notification_title,
    notification_body,
    'leave_request',
    new.id,
    '/dashboard/leave?leave_request_id=' || new.id::text,
    jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date, 'status', new.status)
  );

  return new;
end;
$$;

update public.time_entries
set notes = regexp_replace(notes, '^Time off:', 'Leave:'),
    updated_at = now()
where notes like 'Time off:%';

update public.app_notifications
set title = replace(title, 'Time off', 'Leave'),
    body = replace(body, 'Time off', 'Leave')
where title like '%Time off%' or body like '%Time off%';

update public.app_updates
set summary = replace(replace(summary, 'time off', 'leave'), 'Time off', 'Leave'),
    changes = array(
      select replace(replace(value, 'time off', 'leave'), 'Time off', 'Leave')
      from unnest(changes) as value
    ),
    updated_at = now()
where summary ilike '%time off%'
   or exists (
    select 1
    from unnest(changes) as value
    where value ilike '%time off%'
  );

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.26-leave-language-consistency',
  'Leave wording is consistent',
  'Leave wording now matches the Leave page across the app.',
  array[
    'Approved leave loaded into timesheets now uses leave wording everywhere.'
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

grant execute on function public.load_managed_leave_request_time_entries(uuid[]) to authenticated;
