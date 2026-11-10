-- Migration: 20261104200000_fix_leave_request_hours_calculation.sql
-- Fix leave request engine: ensure full day leave takes actual hours scheduled by work rules, not a 4h default.
-- Partial day Time Off hours only apply when explicitly requested as Time Off on a single day.

create or replace function public.submit_own_leave_request(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date,
  request_total_hours numeric default null,
  request_reason text default null,
  request_attachment_url text default null,
  request_use_toil_first boolean default true
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  leave_request public.leave_requests%rowtype;
  calculated jsonb;
  calculated_hours numeric(8,2);
  available_hours numeric(8,2);
  v_use_toil boolean;
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

  if request_end_date < request_start_date then
    raise exception 'End date must be after start date';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = actor.company_id
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Leave type could not be found';
  end if;

  if leave_type.requires_attachment
    and btrim(coalesce(request_attachment_url, '')) = '' then
    raise exception 'This leave type needs an attachment link';
  end if;

  if nullif(btrim(coalesce(request_attachment_url, '')), '') is not null
    and request_attachment_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Attachment must be a valid http or https link';
  end if;

  calculated := public.calculate_employee_leave_request_hours(
    actor.employee_id,
    leave_type.id,
    request_start_date,
    request_end_date
  );

  -- Support partial day Time Off ONLY when explicitly requested as Time Off on a single day
  -- Otherwise, always use calculated work rule schedule hours from calculate_employee_leave_request_hours
  if request_total_hours is not null 
     and request_total_hours > 0 
     and request_start_date = request_end_date 
     and coalesce(request_reason, '') like '%[Time Off:%' then
    calculated_hours := round(request_total_hours, 2);
  else
    calculated_hours := (calculated->>'total_hours')::numeric(8,2);
  end if;

  v_use_toil := coalesce(request_use_toil_first, true);
  if v_use_toil then
    available_hours := (calculated->>'available_hours')::numeric(8,2);
  else
    available_hours := coalesce((calculated->>'leave_type_available_hours')::numeric(8,2), (calculated->>'available_hours')::numeric(8,2));
  end if;

  if calculated_hours <= 0 then
    raise exception 'The selected dates do not include any working hours under your work schedule';
  end if;

  if calculated_hours > available_hours then
    raise exception 'You only have % hours available for % leave (requested % hours)', available_hours, leave_type.name, calculated_hours;
  end if;

  insert into public.leave_requests (
    company_id,
    employee_id,
    leave_type_id,
    start_date,
    end_date,
    total_hours,
    reason,
    attachment_url,
    status,
    submitted_at,
    submitted_by,
    use_toil_first
  )
  values (
    actor.company_id,
    actor.employee_id,
    leave_type.id,
    request_start_date,
    request_end_date,
    calculated_hours,
    nullif(btrim(coalesce(request_reason, '')), ''),
    nullif(btrim(coalesce(request_attachment_url, '')), ''),
    'submitted',
    now(),
    actor.id,
    v_use_toil
  )
  returning * into leave_request;

  insert into public.approval_requests (
    company_id,
    request_type,
    request_id,
    submitted_by,
    status,
    notes
  )
  values (
    leave_request.company_id,
    'leave_request',
    leave_request.id,
    actor.id,
    'submitted',
    concat_ws(
      E'\n',
      leave_request.reason,
      case
        when request_total_hours is not null and request_total_hours > 0 and request_start_date = request_end_date and coalesce(request_reason, '') like '%[Time Off:%'
          then concat('Time off hours: ', calculated_hours)
        else concat('Calculated leave hours (work rules): ', calculated_hours)
      end,
      case when v_use_toil then 'Policy: Load TOIL first before leave' else 'Policy: Direct leave type deduction' end
    )
  );

  return leave_request;
end;
$$;

-- Backward-compatible overload for 6 arguments
create or replace function public.submit_own_leave_request(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date,
  request_total_hours numeric,
  request_reason text default null,
  request_attachment_url text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.submit_own_leave_request(
    target_leave_type_id,
    request_start_date,
    request_end_date,
    request_total_hours,
    request_reason,
    request_attachment_url,
    true
  );
end;
$$;

-- Update review_managed_leave_request so that when approving a full day leave request,
-- it recalculates total_hours against employee work rules if it was previously set to 4h.
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
  v_toil_bal_hours numeric(8,2) := 0;
  v_toil_bal_id uuid;
  v_toil_type_id uuid;
  v_toil_deduct numeric(8,2) := 0;
  v_leave_deduct numeric(8,2) := 0;
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
    and status = 'active'
    and deleted_at is null
  order by (company_id = existing.company_id) desc, is_super_admin desc, created_at asc
  limit 1;

  if actor.id is null or not (public.is_super_admin() or public.can_manage_time_record(existing.company_id, existing.employee_id)) then
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
    select *
      into leave_type
    from public.leave_types
    where id = reviewed.leave_type_id
      and company_id = reviewed.company_id;

    -- Ensure full day leave requests deduct actual work schedule hours
    if not (coalesce(reviewed.reason, '') like '%[Time Off:%' and reviewed.start_date = reviewed.end_date) then
      calculated := public.calculate_employee_leave_request_hours(
        reviewed.employee_id,
        reviewed.leave_type_id,
        reviewed.start_date,
        reviewed.end_date
      );
      if coalesce((calculated->>'total_hours')::numeric(8,2), 0) > 0 then
        update public.leave_requests
        set total_hours = (calculated->>'total_hours')::numeric(8,2)
        where id = reviewed.id
        returning * into reviewed;
      end if;
    end if;

    -- If use_toil_first is active (default true) and leave type is annual or general
    if coalesce(reviewed.use_toil_first, true) and leave_type.category in ('annual', 'other') then
      -- Look up active TOIL balance
      select coalesce(lb.balance_hours, 0), lb.id, lt.id
        into v_toil_bal_hours, v_toil_bal_id, v_toil_type_id
      from public.leave_balances lb
      join public.leave_types lt on lt.id = lb.leave_type_id
      where lb.company_id = reviewed.company_id
        and lb.employee_id = reviewed.employee_id
        and lt.category = 'toil_taken'
        and lt.is_active = true
        and lt.deleted_at is null
      limit 1;

      v_toil_bal_hours := coalesce(v_toil_bal_hours, 0);

      if v_toil_bal_hours > 0 then
        v_toil_deduct := least(v_toil_bal_hours, reviewed.total_hours);
        v_leave_deduct := reviewed.total_hours - v_toil_deduct;

        -- 1. Deduct from TOIL leave balance
        update public.leave_balances
        set taken_hours = taken_hours + v_toil_deduct,
            balance_hours = greatest(balance_hours - v_toil_deduct, 0),
            as_of_date = current_date,
            updated_at = now()
        where id = v_toil_bal_id;

        -- 2. Insert audit transaction in toil_transactions
        insert into public.toil_transactions (
          company_id,
          employee_id,
          transaction_date,
          transaction_type,
          hours,
          leave_request_id,
          reason,
          status,
          created_by,
          approved_by,
          approved_at
        ) values (
          reviewed.company_id,
          reviewed.employee_id,
          reviewed.start_date,
          'toil_taken'::public.toil_transaction_type,
          -v_toil_deduct,
          reviewed.id,
          'TOIL loaded first for approved leave: ' || coalesce(leave_type.name, 'Leave'),
          'approved'::public.approval_status,
          actor.id,
          actor.id,
          now()
        );

        -- 3. Record toil_hours_used on leave_requests
        update public.leave_requests
        set toil_hours_used = v_toil_deduct
        where id = reviewed.id;

        -- 4. Deduct remaining portion from requested leave type
        if v_leave_deduct > 0 then
          update public.leave_balances
          set taken_hours = taken_hours + v_leave_deduct,
              balance_hours = greatest(balance_hours - v_leave_deduct, 0),
              as_of_date = current_date,
              updated_at = now()
          where company_id = reviewed.company_id
            and employee_id = reviewed.employee_id
            and leave_type_id = reviewed.leave_type_id;
        end if;
      else
        -- No TOIL balance available: deduct full hours from requested leave type
        update public.leave_balances
        set taken_hours = taken_hours + reviewed.total_hours,
            balance_hours = greatest(balance_hours - reviewed.total_hours, 0),
            as_of_date = current_date,
            updated_at = now()
        where company_id = reviewed.company_id
          and employee_id = reviewed.employee_id
          and leave_type_id = reviewed.leave_type_id;
      end if;
    else
      -- Standard direct deduction
      update public.leave_balances
      set taken_hours = taken_hours + reviewed.total_hours,
          balance_hours = greatest(balance_hours - reviewed.total_hours, 0),
          as_of_date = current_date,
          updated_at = now()
      where company_id = reviewed.company_id
        and employee_id = reviewed.employee_id
        and leave_type_id = reviewed.leave_type_id;
    end if;

    -- Auto-create time entries for approved leave days
    select *
      into employee
    from public.employees
    where id = reviewed.employee_id
      and company_id = reviewed.company_id
      and deleted_at is null;

    if found then
      if calculated is null then
        calculated := public.calculate_employee_leave_request_hours(
          reviewed.employee_id,
          reviewed.leave_type_id,
          reviewed.start_date,
          reviewed.end_date
        );
      end if;

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
          from public.time_entries existing_te
          where existing_te.company_id = reviewed.company_id
            and existing_te.employee_id = reviewed.employee_id
            and existing_te.work_date = day_date
            and existing_te.deleted_at is null
        ) then
          update public.time_entries
          set paid_hours = day_hours,
              normal_hours = day_hours,
              overtime_hours = 0,
              lunch_hours = 0,
              gross_hours = day_hours,
              missing_clocking = false,
              status = 'approved',
              leave_type_id = case
                when v_toil_deduct >= day_hours and v_toil_type_id is not null then v_toil_type_id
                else reviewed.leave_type_id
              end,
              notes = case
                when v_toil_deduct > 0 then 'TOIL / Leave: ' || coalesce(leave_type.name, 'Approved leave')
                else 'Leave: ' || coalesce(leave_type.name, 'Approved leave')
              end,
              updated_at = now()
          where company_id = reviewed.company_id
            and employee_id = reviewed.employee_id
            and work_date = day_date
            and deleted_at is null;
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
          case
            when v_toil_deduct > 0 then 'TOIL / Leave: ' || coalesce(leave_type.name, 'Approved leave')
            else 'Leave: ' || coalesce(leave_type.name, 'Approved leave')
          end,
          case
            when v_toil_deduct >= day_hours and v_toil_type_id is not null then v_toil_type_id
            else reviewed.leave_type_id
          end
        );
      end loop;
    end if;

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
      'update'::public.audit_action,
      'leave_requests',
      reviewed.id,
      to_jsonb(existing),
      to_jsonb(reviewed),
      'Approved leave request: ' || reviewed.total_hours || 'h'
    );
  end if;

  return reviewed;
end;
$$;

-- Fix any pending submitted requests that were stored as 4h due to the time_off_hours default
update public.leave_requests lr
set total_hours = coalesce(
  (public.calculate_employee_leave_request_hours(lr.employee_id, lr.leave_type_id, lr.start_date, lr.end_date)->>'total_hours')::numeric(8,2),
  lr.total_hours
)
where lr.status = 'submitted'
  and lr.total_hours = 4.00
  and (lr.reason is null or lr.reason not like '%[Time Off:%');

grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text, boolean) to authenticated;
grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text) to authenticated;
grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated;


-- Update load_managed_leave_request_time_entries to update existing draft records as approved leave rather than skipping
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

    if auth.uid() is not null and not (public.is_super_admin() or public.can_manage_time_record(request.company_id, request.employee_id)) then
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
        update public.time_entries
        set paid_hours = day_hours,
            normal_hours = day_hours,
            overtime_hours = 0,
            lunch_hours = 0,
            gross_hours = day_hours,
            missing_clocking = false,
            status = 'approved',
            leave_type_id = request.leave_type_id,
            notes = 'Leave: ' || coalesce(leave_type.name, 'Approved leave'),
            updated_at = now()
        where company_id = request.company_id
          and employee_id = request.employee_id
          and work_date = day_date
          and deleted_at is null;
        created_count := created_count + 1;
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

grant execute on function public.load_managed_leave_request_time_entries(uuid[]) to authenticated;

