-- Fix column references on public.payroll_periods in review_managed_leave_request
-- Table public.payroll_periods has period_start and period_end (NOT start_date and end_date).
-- Also replaces calls to non-existent helper functions with safe inline upserts.

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
  company_setting public.company_settings%rowtype;
  calculated jsonb;
  day_item jsonb;
  day_date date;
  day_hours numeric(8,2);
  target_period_id uuid;
  target_timesheet_id uuid;
  v_toil_enabled boolean := false;
  v_is_untracked_balance boolean := false;
  v_toil_bal_hours numeric(8,2) := 0;
  v_toil_bal_id uuid;
  v_toil_type_id uuid;
  v_toil_deduct numeric(8,2) := 0;
  v_leave_deduct numeric(8,2) := 0;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
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

  if actor.id is null and current_user in ('service_role', 'postgres') then
    select * into actor from public.users where company_id = existing.company_id and status = 'active' limit 1;
  end if;

  if actor.id is null or not (
    public.is_super_admin()
    or current_user in ('service_role', 'postgres')
    or public.can_manage_time_record(existing.company_id, existing.employee_id)
  ) then
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

    select *
      into company_setting
    from public.company_settings
    where company_id = reviewed.company_id;

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
          created_by,
          updated_by
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
          actor.id
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
