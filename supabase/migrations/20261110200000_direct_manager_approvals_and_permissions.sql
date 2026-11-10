-- Migration: 20261110200000_direct_manager_approvals_and_permissions.sql
-- Description:
-- 1. Updates public.can_manage_time_record to correctly recognize direct managers
--    (linking manager employee via user_id, employee_id, or email) so that employees assigned as managers
--    can approve/deny timesheets, corrections, and leave requests for their direct reports.
-- 2. Updates public.can_access_employee to ensure direct managers have read visibility to their direct reports.
-- 3. Updates public.review_managed_leave_request, public.approve_managed_timesheets,
--    public.reject_managed_timesheets, and public.review_timesheet_correction_request
--    to support direct managers and service_role execution seamlessly.

-- 1. Update public.can_manage_time_record
create or replace function public.can_manage_time_record(
  target_company_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or current_user in ('service_role', 'postgres')
    or public.has_any_company_role(target_company_id, array['owner', 'hr_admin', 'branch_manager']::public.app_role[])
    or exists (
      select 1
      from public.employees managed_employee
      join public.employees manager_employee
        on manager_employee.id = managed_employee.manager_employee_id
        and manager_employee.company_id = managed_employee.company_id
        and manager_employee.deleted_at is null
      join public.users manager_user
        on (
          manager_user.id = manager_employee.user_id
          or manager_user.employee_id = manager_employee.id
          or lower(manager_user.email) = lower(manager_employee.email)
        )
        and manager_user.company_id = target_company_id
        and manager_user.status = 'active'
        and manager_user.deleted_at is null
      where manager_user.auth_user_id = auth.uid()
        and managed_employee.company_id = target_company_id
        and managed_employee.deleted_at is null
        and managed_employee.id = target_employee_id
    );
$$;

grant execute on function public.can_manage_time_record(uuid, uuid) to authenticated, service_role;

-- 2. Update public.can_access_employee
create or replace function public.can_access_employee(
  target_company_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or current_user in ('service_role', 'postgres')
    or public.has_any_company_role(target_company_id, array['owner', 'hr_admin', 'branch_manager', 'payroll_viewer']::public.app_role[])
    or public.current_employee_id(target_company_id) = target_employee_id
    or exists (
      select 1
      from public.employees managed_employee
      join public.employees manager_employee
        on manager_employee.id = managed_employee.manager_employee_id
        and manager_employee.company_id = managed_employee.company_id
        and manager_employee.deleted_at is null
      join public.users manager_user
        on (
          manager_user.id = manager_employee.user_id
          or manager_user.employee_id = manager_employee.id
          or lower(manager_user.email) = lower(manager_employee.email)
        )
        and manager_user.company_id = target_company_id
        and manager_user.status = 'active'
        and manager_user.deleted_at is null
      where manager_user.auth_user_id = auth.uid()
        and managed_employee.company_id = target_company_id
        and managed_employee.deleted_at is null
        and managed_employee.id = target_employee_id
    );
$$;

grant execute on function public.can_access_employee(uuid, uuid) to authenticated, service_role;

-- 3. Update public.approve_managed_timesheets
create or replace function public.approve_managed_timesheets(
  target_time_entry_ids uuid[],
  approval_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  approved_count integer := 0;
  first_company_id uuid;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication is required';
  end if;

  if coalesce(array_length(target_time_entry_ids, 1), 0) = 0 then
    raise exception 'Choose at least one timesheet to approve';
  end if;

  select company_id into first_company_id
  from public.time_entries
  where id = any(target_time_entry_ids)
  limit 1;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by (company_id = first_company_id) desc, is_super_admin desc, created_at asc
  limit 1;

  if actor.id is null and current_user in ('service_role', 'postgres') then
    select * into actor from public.users where company_id = first_company_id and status = 'active' limit 1;
  end if;

  if actor.id is null then
    raise exception 'No active user account is linked to this login';
  end if;

  update public.time_entries te
  set status = 'approved',
      approved_by = actor.id,
      approved_at = now(),
      notes = concat_ws(E'\n', nullif(te.notes, ''), nullif(btrim(coalesce(approval_notes, '')), '')),
      updated_at = now()
  where te.id = any(target_time_entry_ids)
    and te.status in ('submitted', 'draft')
    and te.deleted_at is null
    and (
      public.is_super_admin()
      or current_user in ('service_role', 'postgres')
      or public.can_manage_time_record(te.company_id, te.employee_id)
    );

  get diagnostics approved_count = row_count;

  update public.timesheets ts
  set status = 'approved',
      approved_by = actor.id,
      approved_at = now(),
      updated_at = now()
  where ts.status in ('submitted', 'draft')
    and ts.deleted_at is null
    and exists (
      select 1
      from public.time_entries te
      where te.timesheet_id = ts.id
        and te.id = any(target_time_entry_ids)
        and te.status = 'approved'
    )
    and not exists (
      select 1
      from public.time_entries pending
      where pending.timesheet_id = ts.id
        and pending.deleted_at is null
        and pending.status not in ('approved', 'locked')
    );

  if approved_count > 0 and first_company_id is not null then
    insert into public.audit_logs (
      company_id,
      user_id,
      action,
      affected_table,
      new_value,
      reason
    )
    values (
      first_company_id,
      actor.id,
      'approve',
      'time_entries',
      jsonb_build_object('time_entry_ids', target_time_entry_ids, 'approved_count', approved_count),
      nullif(btrim(coalesce(approval_notes, '')), '')
    );
  end if;

  return approved_count;
end;
$$;

grant execute on function public.approve_managed_timesheets(uuid[], text) to authenticated, service_role;

-- 4. Update public.reject_managed_timesheets
create or replace function public.reject_managed_timesheets(
  target_time_entry_ids uuid[],
  rejection_notes text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  rejected_count integer := 0;
  clean_notes text;
  first_company_id uuid;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication is required';
  end if;

  if coalesce(array_length(target_time_entry_ids, 1), 0) = 0 then
    raise exception 'Choose at least one timesheet to reject';
  end if;

  clean_notes := nullif(btrim(coalesce(rejection_notes, '')), '');
  if clean_notes is null then
    raise exception 'Add a note so the employee knows what to fix';
  end if;

  select company_id into first_company_id
  from public.time_entries
  where id = any(target_time_entry_ids)
  limit 1;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by (company_id = first_company_id) desc, is_super_admin desc, created_at asc
  limit 1;

  if actor.id is null and current_user in ('service_role', 'postgres') then
    select * into actor from public.users where company_id = first_company_id and status = 'active' limit 1;
  end if;

  if actor.id is null then
    raise exception 'No active user account is linked to this login';
  end if;

  update public.time_entries te
  set status = 'rejected',
      notes = concat_ws(E'\n', nullif(te.notes, ''), 'Manager note: ' || clean_notes),
      updated_at = now()
  where te.id = any(target_time_entry_ids)
    and te.status in ('submitted', 'draft', 'approved')
    and te.deleted_at is null
    and (
      public.is_super_admin()
      or current_user in ('service_role', 'postgres')
      or public.can_manage_time_record(te.company_id, te.employee_id)
    );

  get diagnostics rejected_count = row_count;

  update public.timesheets ts
  set status = 'rejected',
      rejected_by = actor.id,
      rejected_at = now(),
      rejection_reason = clean_notes,
      updated_at = now()
  where ts.status in ('submitted', 'approved', 'draft')
    and ts.deleted_at is null
    and exists (
      select 1
      from public.time_entries te
      where te.timesheet_id = ts.id
        and te.id = any(target_time_entry_ids)
        and te.status = 'rejected'
    );

  if rejected_count > 0 and first_company_id is not null then
    insert into public.audit_logs (
      company_id,
      user_id,
      action,
      affected_table,
      new_value,
      reason
    )
    values (
      first_company_id,
      actor.id,
      'reject',
      'time_entries',
      jsonb_build_object('time_entry_ids', target_time_entry_ids, 'rejected_count', rejected_count),
      clean_notes
    );
  end if;

  return rejected_count;
end;
$$;

grant execute on function public.reject_managed_timesheets(uuid[], text) to authenticated, service_role;

-- 5. Update public.review_timesheet_correction_request
create or replace function public.review_timesheet_correction_request(
  target_correction_id uuid,
  approve_request boolean,
  manager_notes text default null
)
returns public.timesheet_correction_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  existing public.timesheet_correction_requests%rowtype;
  correction public.timesheet_correction_requests%rowtype;
  entry public.time_entries%rowtype;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication is required';
  end if;

  select *
    into existing
  from public.timesheet_correction_requests
  where id = target_correction_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Correction request could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and (company_id = existing.company_id or is_super_admin = true)
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
    raise exception 'You do not have permission to review this correction request';
  end if;

  if existing.status <> 'submitted' then
    raise exception 'Only submitted correction requests can be reviewed';
  end if;

  update public.timesheet_correction_requests
  set status = (
        case when approve_request then 'approved' else 'rejected' end
      )::public.approval_status,
      reviewed_by = actor.id,
      reviewed_at = now(),
      review_notes = nullif(btrim(coalesce(manager_notes, '')), ''),
      updated_at = now()
  where id = existing.id
  returning * into correction;

  if approve_request then
    select *
      into entry
    from public.time_entries
    where id = correction.time_entry_id
      and company_id = correction.company_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'The time entry for this correction request could not be found';
    end if;

    update public.time_entries
    set clock_in = correction.proposed_clock_in,
        lunch_start = correction.proposed_lunch_start,
        lunch_end = correction.proposed_lunch_end,
        clock_out = correction.proposed_clock_out,
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          'Correction approved: ' || coalesce(correction.reason, 'Timesheet correction')
        ),
        updated_at = now()
    where id = entry.id;

    perform public.recalculate_time_entry_fields(entry.id);
  end if;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    new_value,
    reason
  )
  values (
    existing.company_id,
    actor.id,
    case when approve_request then 'approve' else 'reject' end,
    'timesheet_correction_requests',
    jsonb_build_object('correction_request_id', correction.id, 'status', correction.status),
    nullif(btrim(coalesce(manager_notes, '')), '')
  );

  return correction;
end;
$$;

grant execute on function public.review_timesheet_correction_request(uuid, boolean, text) to authenticated, service_role;

-- 6. Update public.review_managed_leave_request
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

    if coalesce(reviewed.use_toil_first, true) and leave_type.category in ('annual', 'other') then
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

        select pp.id
          into target_period_id
        from public.payroll_periods pp
        where pp.company_id = reviewed.company_id
          and day_date between pp.start_date and pp.end_date
          and pp.deleted_at is null
        order by pp.start_date asc
        limit 1;

        if target_period_id is null then
          target_period_id := public.ensure_payroll_period_for_date(
            reviewed.company_id,
            day_date
          );
        end if;

        select ts.id
          into target_timesheet_id
        from public.timesheets ts
        where ts.company_id = reviewed.company_id
          and ts.employee_id = reviewed.employee_id
          and ts.payroll_period_id = target_period_id
          and ts.deleted_at is null
        limit 1;

        if target_timesheet_id is null then
          target_timesheet_id := public.ensure_employee_timesheet(
            reviewed.company_id,
            reviewed.employee_id,
            target_period_id
          );
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

