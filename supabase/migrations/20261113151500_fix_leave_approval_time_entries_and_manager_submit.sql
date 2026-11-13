-- Migration to fix:
-- 1. "column created_by of relation time_entries does not exist" on leave request approval.
--    Replaces created_by / updated_by in public.time_entries with approved_by / approved_at.
-- 2. Allow managers and administrators to submit employee timesheet drafts via submit_own_timesheets.

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
  company_setting public.company_settings%rowtype;
  employee public.employees%rowtype;
  leave_type public.leave_types%rowtype;
  calculated jsonb;
  day_item jsonb;
  day_date date;
  day_hours numeric(6,2);
  target_timesheet_id uuid;
  target_period_id uuid;
  v_toil_enabled boolean := false;
  v_toil_bal_hours numeric(8,2) := 0;
  v_toil_deduct numeric(8,2) := 0;
  v_leave_deduct numeric(8,2) := 0;
  v_toil_bal_id uuid;
  v_toil_type_id uuid;
  v_is_untracked_balance boolean := false;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication is required';
  end if;

  if target_leave_request_id is null then
    raise exception 'Choose a leave request to review';
  end if;

  select *
    into existing
  from public.leave_requests
  where id = target_leave_request_id
    and deleted_at is null;

  if not found then
    raise exception 'Leave request not found';
  end if;

  if existing.status <> 'submitted' then
    raise exception 'Only submitted leave requests can be reviewed';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by (company_id = existing.company_id) desc, is_super_admin desc, created_at asc
  limit 1;

  if actor.id is null and current_user in ('service_role', 'postgres') then
    select * into actor from public.users where company_id = existing.company_id and status = 'active' limit 1;
  end if;

  if actor.id is null then
    raise exception 'No active user account is linked to this login';
  end if;

  if not (
    actor.is_super_admin
    or current_user in ('service_role', 'postgres')
    or public.can_manage_leave_record(existing.company_id, existing.employee_id)
  ) then
    raise exception 'You do not have permission to review this leave request';
  end if;

  select *
    into company_setting
  from public.company_settings
  where company_id = existing.company_id
  limit 1;

  select *
    into leave_type
  from public.leave_types
  where id = existing.leave_type_id
    and company_id = existing.company_id
  limit 1;

  update public.leave_requests
  set status = case when approve_request then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
      approved_by = actor.id,
      approved_at = now(),
      manager_notes = nullif(btrim(coalesce(manager_notes, '')), ''),
      updated_at = now()
  where id = existing.id
  returning * into reviewed;

  if approve_request then
    update public.approval_requests
    set status = 'approved',
        resolved_by = actor.id,
        resolved_at = now(),
        comments = nullif(btrim(coalesce(manager_notes, '')), ''),
        updated_at = now()
    where company_id = existing.company_id
      and request_type = 'leave_request'
      and request_id = existing.id;

    v_toil_enabled := coalesce((company_setting.toil_rules->>'enabled')::boolean, false);
    v_is_untracked_balance := (
      lower(coalesce(leave_type.category::text, '')) in ('unpaid', 'holiday', 'public_holiday')
      or lower(coalesce(leave_type.name, '')) like '%unpaid%'
      or lower(coalesce(leave_type.name, '')) like '%holiday%'
    );

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

    if not v_is_untracked_balance then
      if v_toil_enabled and coalesce(reviewed.use_toil_first, true) and leave_type.category in ('annual', 'other') then
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

          update public.leave_balances
          set taken_hours = taken_hours + v_toil_deduct,
              balance_hours = greatest(balance_hours - v_toil_deduct, 0),
              as_of_date = current_date,
              updated_at = now()
          where id = v_toil_bal_id;

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

          update public.leave_requests
          set toil_hours_used = v_toil_deduct
          where id = reviewed.id;

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
        update public.leave_balances
        set taken_hours = taken_hours + reviewed.total_hours,
            balance_hours = greatest(balance_hours - reviewed.total_hours, 0),
            as_of_date = current_date,
            updated_at = now()
        where company_id = reviewed.company_id
          and employee_id = reviewed.employee_id
          and leave_type_id = reviewed.leave_type_id;
      end if;
    end if;

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
          continue;
        end if;

        -- Find payroll period using valid columns period_start and period_end
        select pp.id
          into target_period_id
        from public.payroll_periods pp
        where pp.company_id = reviewed.company_id
          and day_date between pp.period_start and pp.period_end
          and pp.deleted_at is null
        order by pp.period_start desc
        limit 1;

        -- Find existing timesheet or create one
        select ts.id
          into target_timesheet_id
        from public.timesheets ts
        where ts.company_id = reviewed.company_id
          and ts.employee_id = reviewed.employee_id
          and (
            (target_period_id is not null and ts.payroll_period_id = target_period_id)
            or (target_period_id is null and ts.payroll_period_id is null)
          )
          and ts.deleted_at is null
        order by ts.created_at desc
        limit 1;

        if target_timesheet_id is null then
          insert into public.timesheets (
            company_id,
            employee_id,
            payroll_period_id,
            status
          ) values (
            reviewed.company_id,
            reviewed.employee_id,
            target_period_id,
            'draft'
          )
          returning id into target_timesheet_id;
        end if;

        -- time_entries does NOT have created_by / updated_by; it uses approved_by and approved_at
        insert into public.time_entries (
          company_id,
          timesheet_id,
          payroll_period_id,
          employee_id,
          workstation_id,
          work_date,
          paid_hours,
          normal_hours,
          gross_hours,
          overtime_hours,
          status,
          leave_type_id,
          notes,
          approved_by,
          approved_at
        ) values (
          reviewed.company_id,
          target_timesheet_id,
          target_period_id,
          reviewed.employee_id,
          employee.workstation_id,
          day_date,
          day_hours,
          day_hours,
          day_hours,
          0,
          'approved'::public.approval_status,
          reviewed.leave_type_id,
          coalesce(leave_type.name, 'Approved leave') ||
            case when reviewed.reason is not null then ' - ' || reviewed.reason else '' end,
          actor.id,
          now()
        );
      end loop;
    end if;
  end if;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    new_value,
    reason
  ) values (
    existing.company_id,
    actor.id,
    case when approve_request then 'approve' else 'reject' end,
    'leave_requests',
    jsonb_build_object('leave_request_id', reviewed.id, 'status', reviewed.status),
    nullif(btrim(coalesce(manager_notes, '')), '')
  );

  return reviewed;
end;
$$;

grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated, service_role;


-- Upgrade submit_own_timesheets to allow managers and administrators to submit drafts on behalf of employees
create or replace function public.submit_own_timesheets(
  target_time_entry_ids uuid[],
  acknowledged_ids uuid[] default '{}'::uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  entry_record record;
  submitted_count integer := 0;
  is_manager boolean := false;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication is required';
  end if;

  if coalesce(array_length(target_time_entry_ids, 1), 0) = 0 then
    raise exception 'Choose at least one timesheet to submit';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by created_at asc
  limit 1;

  if actor.id is null and current_user in ('service_role', 'postgres') then
    select * into actor from public.users where status = 'active' and deleted_at is null limit 1;
  end if;

  if actor.id is null then
    raise exception 'No active user account is linked to this login';
  end if;

  -- Validate permissions and flag gates
  for entry_record in
    select te.id,
           te.company_id,
           te.employee_id,
           te.missing_clocking,
           te.late_arrival,
           te.early_departure,
           te.clock_in,
           te.paid_hours
    from public.time_entries te
    where te.company_id = actor.company_id
      and te.id = any(target_time_entry_ids)
      and te.status in ('draft', 'rejected')
      and te.deleted_at is null
  loop
    is_manager := (
      actor.is_super_admin
      or current_user in ('service_role', 'postgres')
      or public.can_manage_time_record(entry_record.company_id, entry_record.employee_id)
    );

    if entry_record.employee_id <> coalesce(actor.employee_id, '00000000-0000-0000-0000-000000000000'::uuid) and not is_manager then
      raise exception 'You do not have permission to submit timesheets for other employees';
    end if;

    -- If submitted by the employee themselves, enforce deviation acknowledgement
    if not is_manager then
      if entry_record.missing_clocking
         or entry_record.late_arrival
         or entry_record.early_departure
         or (entry_record.clock_in is not null and entry_record.paid_hours <= 0) then
        if not (acknowledged_ids @> array[entry_record.id]) then
          raise exception 'Flag the timesheets that need attention before submitting';
        end if;
      end if;
    end if;
  end loop;

  update public.time_entries te
  set status = 'submitted',
      submitted_at = now(),
      updated_at = now()
  where te.id = any(target_time_entry_ids)
    and te.company_id = actor.company_id
    and (
      te.employee_id = actor.employee_id
      or actor.is_super_admin
      or current_user in ('service_role', 'postgres')
      or public.can_manage_time_record(te.company_id, te.employee_id)
    )
    and te.status in ('draft', 'rejected')
    and te.deleted_at is null;

  get diagnostics submitted_count = row_count;

  update public.timesheets ts
  set status = 'submitted',
      submitted_at = coalesce(ts.submitted_at, now()),
      submitted_by = coalesce(ts.submitted_by, actor.id),
      updated_at = now()
  where ts.company_id = actor.company_id
    and ts.status in ('draft', 'rejected')
    and ts.deleted_at is null
    and exists (
      select 1
      from public.time_entries te
      where te.timesheet_id = ts.id
        and te.id = any(target_time_entry_ids)
        and te.status = 'submitted'
    );

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    new_value,
    reason
  )
  values (
    actor.company_id,
    actor.id,
    'submit',
    'time_entries',
    jsonb_build_object('time_entry_ids', target_time_entry_ids, 'submitted_count', submitted_count),
    'Timesheets submitted for approval'
  );

  return submitted_count;
end;
$$;

grant execute on function public.submit_own_timesheets(uuid[], uuid[]) to authenticated, service_role;

