-- 20260918120000_sysadmin_multi_company_universal_access.sql
-- Universal SysAdmin Multi-Company Access, Approval Fixes & Tenant Isolation

-- 1. Ensure is_super_admin() helper is defined and accurate
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select true
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.is_super_admin = true
        and u.status = 'active'
        and u.deleted_at is null
      limit 1
    ),
    false
  );
$$;

grant execute on function public.is_super_admin() to authenticated, service_role;

-- 2. Update has_company_role & has_any_company_role to recognize is_super_admin
create or replace function public.has_company_role(target_company_id uuid, target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.users u
    left join public.user_roles ur
      on ur.user_id = u.id
      and ur.company_id = u.company_id
      and ur.revoked_at is null
    left join public.roles r
      on r.id = ur.role_id
      and r.company_id = u.company_id
    where u.auth_user_id = auth.uid()
      and u.company_id = target_company_id
      and u.status = 'active'
      and u.deleted_at is null
      and r.key = target_role
  );
$$;

create or replace function public.has_any_company_role(
  target_company_id uuid,
  target_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
  or exists (
    select 1
    from public.users u
    left join public.user_roles ur
      on ur.user_id = u.id
      and ur.company_id = u.company_id
      and ur.revoked_at is null
    left join public.roles r
      on r.id = ur.role_id
      and r.company_id = u.company_id
    where u.auth_user_id = auth.uid()
      and u.company_id = target_company_id
      and u.status = 'active'
      and u.deleted_at is null
      and r.key = any(target_roles)
  );
$$;

grant execute on function public.has_company_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.has_any_company_role(uuid, public.app_role[]) to authenticated, service_role;

-- 3. Update can_access_employee to explicitly include is_super_admin
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
    or public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[])
    or public.current_employee_id(target_company_id) = target_employee_id
    or exists (
      select 1
      from public.users manager_user
      join public.employees managed_employee
        on managed_employee.manager_employee_id = manager_user.employee_id
        and managed_employee.company_id = manager_user.company_id
        and managed_employee.deleted_at is null
      where manager_user.auth_user_id = auth.uid()
        and manager_user.company_id = target_company_id
        and manager_user.status = 'active'
        and manager_user.deleted_at is null
        and manager_user.employee_id is not null
        and managed_employee.id = target_employee_id
    );
$$;

grant execute on function public.can_access_employee(uuid, uuid) to authenticated, service_role;

-- 4. Update can_manage_time_record to explicitly include is_super_admin
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
    or public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[])
    or exists (
      select 1
      from public.users manager_user
      join public.employees managed_employee
        on managed_employee.manager_employee_id = manager_user.employee_id
        and managed_employee.company_id = manager_user.company_id
        and managed_employee.deleted_at is null
      where manager_user.auth_user_id = auth.uid()
        and manager_user.company_id = target_company_id
        and manager_user.status = 'active'
        and manager_user.deleted_at is null
        and manager_user.employee_id is not null
        and managed_employee.id = target_employee_id
    );
$$;

grant execute on function public.can_manage_time_record(uuid, uuid) to authenticated, service_role;

-- 5. Update approve_managed_timesheets
-- Allows approving both 'submitted' and 'draft' entries when selected by an admin/manager.
-- Resolves actor across companies for super admin.
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
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if coalesce(array_length(target_time_entry_ids, 1), 0) = 0 then
    raise exception 'Choose at least one timesheet to approve';
  end if;

  -- Determine target company from first time entry
  select company_id into first_company_id
  from public.time_entries
  where id = any(target_time_entry_ids)
  limit 1;

  -- Select actor: prefer user row matching target company, or super admin user row
  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by (company_id = first_company_id) desc, is_super_admin desc, created_at asc
  limit 1;

  if not found then
    raise exception 'No active user account is linked to this login';
  end if;

  -- Update time entries: allow approving both 'submitted' and 'draft'
  update public.time_entries te
  set status = 'approved',
      approved_by = actor.id,
      approved_at = now(),
      notes = concat_ws(E'\n', nullif(te.notes, ''), nullif(btrim(coalesce(approval_notes, '')), '')),
      updated_at = now()
  where te.id = any(target_time_entry_ids)
    and te.status in ('submitted', 'draft')
    and te.deleted_at is null
    and (public.is_super_admin() or public.can_manage_time_record(te.company_id, te.employee_id));

  get diagnostics approved_count = row_count;

  -- Also update linked parent timesheets
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

-- 6. Update reject_managed_timesheets
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
  if auth.uid() is null then
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

  if not found then
    raise exception 'No active user account is linked to this login';
  end if;

  update public.time_entries te
  set status = 'rejected',
      notes = concat_ws(E'\n', nullif(te.notes, ''), 'Manager note: ' || clean_notes),
      updated_at = now()
  where te.id = any(target_time_entry_ids)
    and te.status in ('submitted', 'draft', 'approved')
    and te.deleted_at is null
    and (public.is_super_admin() or public.can_manage_time_record(te.company_id, te.employee_id));

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

-- 7. Update review_timesheet_correction_request
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
  if auth.uid() is null then
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

  if not found or not (public.is_super_admin() or public.can_manage_time_record(existing.company_id, existing.employee_id)) then
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
      review_notes = nullif(btrim(coalesce(manager_notes, '')), '')
  where id = existing.id
  returning * into correction;

  if approve_request then
    select *
      into entry
    from public.time_entries
    where id = correction.time_entry_id
      and company_id = correction.company_id
      and employee_id = correction.employee_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'Linked time entry could not be found';
    end if;

    if entry.status = 'locked' then
      raise exception 'Locked time entries cannot be changed';
    end if;

    update public.time_entries
    set clock_in = correction.proposed_clock_in,
        lunch_start = correction.proposed_lunch_start,
        lunch_end = correction.proposed_lunch_end,
        clock_out = correction.proposed_clock_out,
        status = 'submitted',
        submitted_at = coalesce(submitted_at, now()),
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          'Correction approved: ' || correction.reason
        ),
        updated_at = now()
    where id = entry.id
    returning * into entry;

    perform public.refresh_time_entry_calculations(entry.id);

    update public.timesheets
    set status = 'submitted',
        submitted_at = coalesce(submitted_at, now()),
        updated_at = now()
    where id = entry.timesheet_id
      and company_id = entry.company_id
      and status in ('draft', 'rejected', 'submitted');
  end if;

  update public.approval_requests
  set status = correction.status,
      approver_id = actor.id,
      actioned_at = correction.reviewed_at,
      notes = coalesce(correction.review_notes, notes)
  where company_id = correction.company_id
    and request_type = 'timesheet'
    and request_id = correction.id
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
    correction.company_id,
    actor.id,
    case when approve_request then 'approve' else 'reject' end,
    'timesheet_correction_requests',
    correction.id,
    to_jsonb(existing),
    to_jsonb(correction),
    correction.review_notes
  );

  return correction;
end;
$$;

grant execute on function public.review_timesheet_correction_request(uuid, boolean, text) to authenticated, service_role;

-- 8. Update review_timesheet_correction_requests (bulk)
create or replace function public.review_timesheet_correction_requests(
  target_correction_ids uuid[],
  approve_request boolean,
  manager_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  success_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if coalesce(array_length(target_correction_ids, 1), 0) = 0 then
    return 0;
  end if;

  foreach cid in array target_correction_ids
  loop
    perform public.review_timesheet_correction_request(cid, approve_request, manager_notes);
    success_count := success_count + 1;
  end loop;

  return success_count;
end;
$$;

grant execute on function public.review_timesheet_correction_requests(uuid[], boolean, text) to authenticated, service_role;

-- 9. Update review_managed_leave_request to guarantee super admin execution
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
  order by (company_id = existing.company_id) desc, is_super_admin desc, created_at asc
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

    -- Auto-create time entries for approved leave days
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
          leave_type_id,
          approved_by,
          approved_at
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
          'Approved leave: ' || coalesce(leave_type.name, 'Leave'),
          reviewed.leave_type_id,
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
    record_id,
    old_value,
    new_value,
    reason
  )
  values (
    reviewed.company_id,
    actor.id,
    case when approve_request then 'approve' else 'reject' end,
    'leave_requests',
    reviewed.id,
    to_jsonb(existing),
    to_jsonb(reviewed),
    reviewed.rejection_reason
  );

  return reviewed;
end;
$$;

grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated, service_role;

-- 10. Update leave_balances RLS policy so admins and super admins can view everyone's accruals
drop policy if exists "role scoped leave balances can view leave balances" on public.leave_balances;
create policy "role scoped leave balances can view leave balances"
on public.leave_balances for select
to authenticated
using (
  public.is_super_admin()
  or public.has_any_company_role(company_id, array['owner', 'hr_admin', 'payroll_viewer']::public.app_role[])
  or public.can_access_employee(company_id, employee_id)
);

-- 11. Ensure Doctor Khoza (super admin) has a user record in every active tenant company
do $$
declare
  target_company record;
  target_user_id uuid;
  owner_role_id uuid;
begin
  for target_company in
    select id, name from public.companies where is_active = true and deleted_at is null
  loop
    -- Insert or update user
    insert into public.users (
      company_id,
      auth_user_id,
      full_name,
      email,
      is_super_admin,
      status
    )
    values (
      target_company.id,
      '5a7c5218-1498-46d7-9172-4ed237fa50e9',
      'Doctor Khoza',
      'doctor@formalize.co.za',
      true,
      'active'
    )
    on conflict (company_id, auth_user_id)
    do update set
      is_super_admin = true,
      status = 'active',
      deleted_at = null
    returning id into target_user_id;

    -- Ensure owner role is assigned
    select id into owner_role_id
    from public.roles
    where company_id = target_company.id
      and key = 'owner';

    if owner_role_id is not null and target_user_id is not null then
      insert into public.user_roles (
        company_id,
        user_id,
        role_id,
        assigned_by
      )
      values (
        target_company.id,
        target_user_id,
        owner_role_id,
        target_user_id
      )
      on conflict do nothing;
    end if;
  end loop;
end;
$$;
