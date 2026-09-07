-- Fix remaining references to dropped branch_id on time_entries and employees

-- 1. Drop obsolete 8-argument overload of upsert_company_workstation that referenced branch_id
drop function if exists public.upsert_company_workstation(uuid, uuid, uuid, text, text, numeric, numeric, integer);

-- 2. Fix recalculate_employee_period_fill_up to remove references to te.branch_id and ws.branch_id
create or replace function public.recalculate_employee_period_fill_up(
  target_company_id uuid,
  target_employee_id uuid,
  target_payroll_period_id uuid,
  target_work_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  running_shortfall numeric(8,2) := 0;
  base_normal numeric(8,2);
  base_overtime numeric(8,2);
  applied_fill_up numeric(8,2);
  target_normal numeric(8,2);
  target_overtime numeric(8,2);
  clean_warning text;
begin
  for item in
    select
      te.id,
      te.paid_hours,
      te.normal_hours,
      te.overtime_hours,
      te.warning_notes,
      te.notes,
      coalesce(
        public.normalized_schedule_paid_hours(sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, cs.standard_daily_hours),
        cs.standard_daily_hours,
        8
      )::numeric(8,2) as scheduled_nt
    from public.time_entries te
    join public.employees e
      on e.id = te.employee_id
     and e.company_id = te.company_id
    left join public.company_settings cs
      on cs.company_id = te.company_id
    left join public.schedule_days sd
      on sd.work_schedule_id = coalesce((
          select assignments.work_schedule_id
          from public.employee_work_schedule_assignments assignments
          join public.work_schedules schedules
            on schedules.id = assignments.work_schedule_id
           and schedules.company_id = assignments.company_id
           and schedules.is_active
           and schedules.deleted_at is null
          where assignments.company_id = te.company_id
            and assignments.employee_id = te.employee_id
            and assignments.is_active
            and assignments.deleted_at is null
            and assignments.effective_from <= te.work_date
            and (assignments.effective_to is null or assignments.effective_to >= te.work_date)
          order by assignments.priority, assignments.effective_from desc
          limit 1
        ), e.work_schedule_id, (
          select ws.id
          from public.work_schedules ws
          where ws.company_id = te.company_id
            and ws.scope = 'company'
            and ws.is_active
            and ws.deleted_at is null
          order by ws.created_at desc
          limit 1
        ))
     and sd.day_of_week = extract(dow from te.work_date)::integer
     and sd.is_working_day
    where te.company_id = target_company_id
      and te.employee_id = target_employee_id
      and te.deleted_at is null
      and (
        (target_payroll_period_id is not null and te.payroll_period_id = target_payroll_period_id)
        or (
          target_payroll_period_id is null
          and te.payroll_period_id is null
          and te.work_date between date_trunc('month', target_work_date)::date
              and (date_trunc('month', target_work_date)::date + interval '1 month - 1 day')::date
        )
      )
    order by te.work_date, te.created_at, te.id
  loop
    base_normal := least(coalesce(item.paid_hours, 0), coalesce(item.scheduled_nt, 8))::numeric(8,2);
    base_overtime := greatest(coalesce(item.paid_hours, 0) - coalesce(item.scheduled_nt, 8), 0)::numeric(8,2);
    applied_fill_up := least(base_overtime, running_shortfall)::numeric(8,2);
    target_normal := (base_normal + applied_fill_up)::numeric(8,2);
    target_overtime := (base_overtime - applied_fill_up)::numeric(8,2);
    clean_warning := nullif(
      btrim(
        regexp_replace(
          coalesce(item.warning_notes, ''),
          'NT fill-up applied: [0-9]+(\.[0-9]+)?h of generated overtime was used to cover earlier normal-time shortfall\.',
          '',
          'g'
        )
      ),
      ''
    );

    if applied_fill_up > 0 then
      clean_warning := concat_ws(
        ' ',
        clean_warning,
        'NT fill-up applied: ' || applied_fill_up::text || 'h of generated overtime was used to cover earlier normal-time shortfall.'
      );
    end if;

    update public.time_entries
    set normal_hours = target_normal,
        overtime_hours = target_overtime,
        warning_notes = clean_warning,
        updated_at = now()
    where id = item.id;

    running_shortfall := greatest(
      running_shortfall + greatest(coalesce(item.scheduled_nt, 8) - base_normal, 0) - applied_fill_up,
      0
    )::numeric(8,2);
  end loop;
end;
$$;

grant execute on function public.recalculate_employee_period_fill_up(uuid, uuid, uuid, date) to authenticated, service_role;

-- 3. Fix review_managed_leave_request to use workstation_id instead of branch_id
create or replace function public.review_managed_leave_request(
  target_leave_request_id uuid,
  approve_request boolean,
  manager_notes text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  existing public.leave_requests%rowtype;
  reviewed public.leave_requests%rowtype;
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

  select *
    into existing
  from public.leave_requests
  where id = target_leave_request_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Leave request could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and (company_id = existing.company_id or is_super_admin = true)
    and status = 'active'
    and deleted_at is null
  order by (company_id = existing.company_id) desc, created_at asc
  limit 1;

  if not found or not (public.is_super_admin() or public.can_manage_time_record(existing.company_id, existing.employee_id)) then
    raise exception 'You do not have permission to review this leave request';
  end if;

  if existing.status <> 'submitted' then
    raise exception 'Only submitted leave requests can be reviewed';
  end if;

  update public.leave_requests
  set status = (
        case when approve_request then 'approved' else 'rejected' end
      )::public.approval_status,
      approved_by = case when approve_request then actor.id else null end,
      approved_at = case when approve_request then now() else null end,
      rejected_by = case when approve_request then null else actor.id end,
      rejected_at = case when approve_request then null else now() end,
      rejection_reason = case when approve_request then null else nullif(btrim(coalesce(manager_notes, '')), '') end,
      updated_at = now()
  where id = existing.id
  returning * into reviewed;

  if approve_request then
    update public.leave_balances
    set taken_hours = taken_hours + reviewed.total_hours,
        balance_hours = greatest(balance_hours - reviewed.total_hours, 0),
        as_of_date = current_date,
        updated_at = now()
    where company_id = reviewed.company_id
      and employee_id = reviewed.employee_id
      and leave_type_id = reviewed.leave_type_id;

    -- Auto-create time entries for approved leave
    select *
      into employee
    from public.employees
    where id = reviewed.employee_id
      and company_id = reviewed.company_id
      and deleted_at is null;

    if found then
      select *
        into leave_type
      from public.leave_types
      where id = reviewed.leave_type_id
        and company_id = reviewed.company_id;

      calculated := public.calculate_employee_leave_request_hours(
        reviewed.employee_id,
        reviewed.leave_type_id,
        reviewed.start_date,
        reviewed.end_date
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

        -- Skip if time entry already exists for this date
        if exists (
          select 1
          from public.time_entries existing_te
          where existing_te.company_id = reviewed.company_id
            and existing_te.employee_id = reviewed.employee_id
            and existing_te.work_date = day_date
            and existing_te.deleted_at is null
        ) then
          continue;
        end if;

        select id
          into target_period_id
        from public.payroll_periods
        where company_id = reviewed.company_id
          and day_date between period_start and period_end
          and status in ('open', 'reopened')
          and deleted_at is null
        order by period_start desc
        limit 1;

        select id
          into target_timesheet_id
        from public.timesheets
        where company_id = reviewed.company_id
          and employee_id = reviewed.employee_id
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
            reviewed.company_id,
            reviewed.employee_id,
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
          notes,
          leave_type_id
        )
        values (
          reviewed.company_id,
          target_timesheet_id,
          reviewed.employee_id,
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
          'Leave: ' || coalesce(leave_type.name, 'Approved leave'),
          reviewed.leave_type_id
        );

        created_count := created_count + 1;
      end loop;
    end if;
  end if;

  update public.approval_requests
  set status = reviewed.status,
      approver_id = actor.id,
      actioned_at = now(),
      notes = coalesce(nullif(btrim(coalesce(manager_notes, '')), ''), notes),
      updated_at = now()
  where company_id = reviewed.company_id
    and request_type = 'leave_request'
    and request_id = reviewed.id
    and deleted_at is null;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    old_value,
    new_value,
    reason
  )
  values (
    reviewed.company_id,
    actor.id,
    'review_leave_request',
    'leave_requests',
    reviewed.id,
    to_jsonb(existing),
    to_jsonb(reviewed),
    manager_notes
  );

  return reviewed;
end;
$$;

grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated, service_role;

-- 4. Fix load_managed_leave_request_time_entries to use workstation_id instead of branch_id
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

    if not (public.is_super_admin() or public.can_manage_time_record(request.company_id, request.employee_id)) then
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
        notes,
        leave_type_id
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
        'Leave: ' || coalesce(leave_type.name, 'Approved leave'),
        request.leave_type_id
      );

      created_count := created_count + 1;
    end loop;
  end loop;

  return created_count;
end;
$$;

grant execute on function public.load_managed_leave_request_time_entries(uuid[]) to authenticated, service_role;
