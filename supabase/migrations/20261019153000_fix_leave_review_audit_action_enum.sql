-- 20261019153000_fix_leave_review_audit_action_enum.sql
-- Fixes invalid cast to public.audit_action in review_managed_leave_request:
-- 'approved'::public.audit_action -> 'approve'::public.audit_action
-- 'rejected'::public.audit_action -> 'reject'::public.audit_action

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
      'approve'::public.audit_action,
      'leave_requests',
      reviewed.id,
      to_jsonb(existing),
      to_jsonb(reviewed),
      concat_ws(
        ' | ',
        manager_notes,
        case when v_toil_deduct > 0 then concat('Loaded TOIL first: ', v_toil_deduct, 'h') else null end
      )
    );
  else
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
      'reject'::public.audit_action,
      'leave_requests',
      reviewed.id,
      to_jsonb(existing),
      to_jsonb(reviewed),
      manager_notes
    );
  end if;

  update public.approval_requests
  set status = reviewed.status,
      approver_id = actor.id,
      actioned_at = now(),
      notes = concat_ws(E'\n', notes, manager_notes)
  where company_id = reviewed.company_id
    and request_type = 'leave_request'
    and request_id = reviewed.id;

  return reviewed;
end;
$$;

grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated, service_role;
