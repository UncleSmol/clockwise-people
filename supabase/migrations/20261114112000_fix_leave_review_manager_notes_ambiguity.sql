-- Fix: column reference "manager_notes" is ambiguous in review_managed_leave_request
-- Disambiguate by reading the function parameter into a local variable `v_manager_notes`.

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
  v_manager_notes text;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication is required';
  end if;

  if target_leave_request_id is null then
    raise exception 'Choose a leave request to review';
  end if;

  -- Disambiguate parameter from column name
  v_manager_notes := nullif(btrim(coalesce(review_managed_leave_request.manager_notes, '')), '');

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

  if actor.id is null and (current_user in ('service_role', 'postgres') or public.is_super_admin()) then
    select * into actor from public.users where company_id = existing.company_id and status = 'active' limit 1;
  end if;

  if actor.id is null then
    raise exception 'No active user account is linked to this login';
  end if;

  if not (
    actor.is_super_admin
    or public.is_super_admin()
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
      approved_by = case when approve_request then actor.id else null end,
      approved_at = case when approve_request then now() else null end,
      rejected_by = case when not approve_request then actor.id else null end,
      rejected_at = case when not approve_request then now() else null end,
      rejection_reason = case when not approve_request then v_manager_notes else null end,
      manager_notes = v_manager_notes,
      updated_at = now()
  where id = existing.id
  returning * into reviewed;

  if approve_request then
    update public.approval_requests
    set status = 'approved',
        resolved_by = actor.id,
        resolved_at = now(),
        comments = v_manager_notes,
        updated_at = now()
    where leave_request_id = existing.id
      and status = 'pending';
  else
    update public.approval_requests
    set status = 'rejected',
        resolved_by = actor.id,
        resolved_at = now(),
        comments = v_manager_notes,
        updated_at = now()
    where leave_request_id = existing.id
      and status = 'pending';
  end if;

  if approve_request then
    select *
      into employee
    from public.employees
    where id = existing.employee_id
      and company_id = existing.company_id
      and deleted_at is null;

    if found then
      calculated := public.calculate_leave_request_hours(
        existing.company_id,
        existing.employee_id,
        existing.start_date,
        existing.end_date,
        existing.start_half,
        existing.end_half,
        existing.is_half_day,
        existing.half_day_type,
        existing.leave_type_id
      );

      v_is_untracked_balance := coalesce(leave_type.code, '') in ('unpaid', 'public_holiday')
        or coalesce(lower(leave_type.name), '') like '%unpaid%'
        or coalesce(lower(leave_type.name), '') like '%holiday%';

      if not v_is_untracked_balance then
        select coalesce(cs.toil_rules->>'enabled', 'false')::boolean
          into v_toil_enabled
        from public.company_settings cs
        where cs.company_id = existing.company_id;

        if v_toil_enabled and coalesce(leave_type.code, '') = 'annual' then
          select lt.id into v_toil_type_id
          from public.leave_types lt
          where lt.company_id = existing.company_id
            and lt.code = 'toil'
            and lt.deleted_at is null
          limit 1;

          if v_toil_type_id is not null then
            select lb.id, coalesce(lb.current_balance, 0)
              into v_toil_bal_id, v_toil_bal_hours
            from public.leave_balances lb
            where lb.employee_id = existing.employee_id
              and lb.leave_type_id = v_toil_type_id
            limit 1;
          end if;
        end if;

        if v_toil_bal_hours > 0 and coalesce(existing.total_hours, 0) > 0 then
          v_toil_deduct := least(v_toil_bal_hours, existing.total_hours);
          v_leave_deduct := existing.total_hours - v_toil_deduct;

          update public.leave_balances
          set used = used + v_toil_deduct,
              current_balance = current_balance - v_toil_deduct,
              updated_at = now()
          where id = v_toil_bal_id;

          if v_leave_deduct > 0 then
            update public.leave_balances
            set used = used + v_leave_deduct,
                current_balance = current_balance - v_leave_deduct,
                updated_at = now()
            where employee_id = existing.employee_id
              and leave_type_id = existing.leave_type_id;
          end if;
        else
          update public.leave_balances
          set used = used + existing.total_hours,
              current_balance = current_balance - existing.total_hours,
              updated_at = now()
          where employee_id = existing.employee_id
            and leave_type_id = existing.leave_type_id;
        end if;
      end if;

      for day_item in select * from jsonb_array_elements(coalesce(calculated -> 'day_breakdown', '[]'::jsonb))
      loop
        day_date := (day_item ->> 'date')::date;
        day_hours := coalesce((day_item ->> 'hours')::numeric, 0);

        if day_hours > 0 then
          target_period_id := null;
          select pp.id
            into target_period_id
          from public.payroll_periods pp
          where pp.company_id = existing.company_id
            and pp.period_start <= day_date
            and pp.period_end >= day_date
          order by pp.period_start desc
          limit 1;

          target_timesheet_id := null;
          if target_period_id is not null then
            select ts.id
              into target_timesheet_id
            from public.timesheets ts
            where ts.employee_id = existing.employee_id
              and ts.payroll_period_id = target_period_id
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
                existing.company_id,
                existing.employee_id,
                target_period_id,
                'draft'
              )
              returning id into target_timesheet_id;
            end if;
          end if;

          insert into public.time_entries (
            company_id,
            employee_id,
            timesheet_id,
            workstation_id,
            work_date,
            gross_hours,
            lunch_hours,
            paid_hours,
            normal_hours,
            overtime_hours,
            status,
            leave_type_id,
            leave_request_id,
            notes,
            approved_by,
            approved_at
          ) values (
            existing.company_id,
            existing.employee_id,
            target_timesheet_id,
            employee.workstation_id,
            day_date,
            day_hours,
            0,
            day_hours,
            day_hours,
            0,
            'approved',
            existing.leave_type_id,
            existing.id,
            concat_ws(' - ', 'Approved Leave', leave_type.name, nullif(existing.reason, '')),
            actor.id,
            now()
          )
          on conflict (employee_id, work_date)
          where deleted_at is null
          do update set
            leave_type_id = excluded.leave_type_id,
            leave_request_id = excluded.leave_request_id,
            timesheet_id = coalesce(excluded.timesheet_id, public.time_entries.timesheet_id),
            workstation_id = coalesce(excluded.workstation_id, public.time_entries.workstation_id),
            gross_hours = excluded.gross_hours,
            lunch_hours = 0,
            paid_hours = excluded.paid_hours,
            normal_hours = excluded.normal_hours,
            overtime_hours = 0,
            status = 'approved',
            clock_in = null,
            lunch_start = null,
            lunch_end = null,
            clock_out = null,
            notes = excluded.notes,
            approved_by = actor.id,
            approved_at = now(),
            updated_at = now();
        end if;
      end loop;
    end if;
  end if;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  ) values (
    existing.company_id,
    actor.id,
    case when approve_request then 'approve'::public.audit_action else 'reject'::public.audit_action end,
    'leave_request',
    existing.id,
    jsonb_build_object(
      'status', reviewed.status,
      'approved_by', reviewed.approved_by,
      'approved_at', reviewed.approved_at,
      'rejected_by', reviewed.rejected_by,
      'rejected_at', reviewed.rejected_at,
      'rejection_reason', reviewed.rejection_reason,
      'manager_notes', reviewed.manager_notes
    )
  );

  return reviewed;
end;
$$;

grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated, service_role;
