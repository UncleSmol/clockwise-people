create or replace function public.create_company_work_schedule(
  target_company_id uuid,
  schedule_name text,
  work_start time,
  work_end time,
  lunch_minutes integer,
  working_days integer[],
  daily_hours numeric default null
)
returns public.work_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  schedule public.work_schedules%rowtype;
  day_index integer;
  computed_hours numeric(5,2);
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  if not public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can set work rules';
  end if;

  if btrim(coalesce(schedule_name, '')) = '' then
    raise exception 'Schedule name is required';
  end if;

  if work_start is null or work_end is null or work_end <= work_start then
    raise exception 'Enter valid working hours';
  end if;

  if coalesce(array_length(working_days, 1), 0) = 0 then
    raise exception 'Choose at least one working day';
  end if;

  if exists (
    select 1 from unnest(working_days) as selected_day
    where selected_day < 0 or selected_day > 6
  ) then
    raise exception 'Working days must be between Sunday and Saturday';
  end if;

  computed_hours := coalesce(
    daily_hours,
    greatest(
      extract(epoch from (work_end - work_start)) / 3600
      - (greatest(coalesce(lunch_minutes, 0), 0)::numeric / 60),
      0
    )
  )::numeric(5,2);

  insert into public.work_schedules (
    company_id,
    name,
    scope,
    standard_daily_hours
  )
  values (
    target_company_id,
    btrim(schedule_name),
    'company',
    computed_hours
  )
  returning * into schedule;

  for day_index in 0..6 loop
    insert into public.schedule_days (
      company_id,
      work_schedule_id,
      day_of_week,
      start_time,
      end_time,
      lunch_minutes,
      paid_hours,
      is_working_day
    )
    values (
      target_company_id,
      schedule.id,
      day_index,
      case when day_index = any(working_days) then work_start else null end,
      case when day_index = any(working_days) then work_end else null end,
      case when day_index = any(working_days) then greatest(coalesce(lunch_minutes, 0), 0) else 0 end,
      case when day_index = any(working_days) then computed_hours else 0 end,
      day_index = any(working_days)
    );
  end loop;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    new_value,
    reason
  )
  values (
    target_company_id,
    actor_id,
    'create',
    'work_schedules',
    schedule.id,
    to_jsonb(schedule),
    'Company work schedule created'
  );

  return schedule;
end;
$$;

create or replace function public.create_company_leave_type(
  target_company_id uuid,
  leave_name text,
  leave_category public.leave_category,
  paid_leave boolean,
  needs_attachment boolean,
  yearly_hours numeric default null
)
returns public.leave_types
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  leave_type public.leave_types%rowtype;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  if not public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can set leave rules';
  end if;

  if btrim(coalesce(leave_name, '')) = '' then
    raise exception 'Leave type name is required';
  end if;

  insert into public.leave_types (
    company_id,
    name,
    category,
    is_paid,
    requires_attachment,
    accrual_rules
  )
  values (
    target_company_id,
    btrim(leave_name),
    leave_category,
    paid_leave,
    needs_attachment,
    jsonb_build_object('yearly_hours', coalesce(yearly_hours, 0))
  )
  returning * into leave_type;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    new_value,
    reason
  )
  values (
    target_company_id,
    actor_id,
    'create',
    'leave_types',
    leave_type.id,
    to_jsonb(leave_type),
    'Company leave rule created'
  );

  return leave_type;
end;
$$;

create or replace function public.assign_employee_leave_balance(
  target_employee_id uuid,
  target_leave_type_id uuid,
  balance_hours numeric
)
returns public.leave_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  employee public.employees%rowtype;
  leave_type public.leave_types%rowtype;
  balance public.leave_balances%rowtype;
begin
  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if not found then
    raise exception 'Employee could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and company_id = employee.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.has_any_company_role(employee.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can assign leave balances';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = employee.company_id
    and deleted_at is null
    and is_active;

  if not found then
    raise exception 'Leave rule could not be found';
  end if;

  insert into public.leave_balances (
    company_id,
    employee_id,
    leave_type_id,
    balance_hours,
    adjusted_hours,
    as_of_date
  )
  values (
    employee.company_id,
    employee.id,
    leave_type.id,
    greatest(coalesce(balance_hours, 0), 0),
    greatest(coalesce(balance_hours, 0), 0),
    current_date
  )
  on conflict (company_id, employee_id, leave_type_id)
  do update set
    balance_hours = excluded.balance_hours,
    adjusted_hours = excluded.adjusted_hours,
    as_of_date = excluded.as_of_date,
    updated_at = now()
  returning * into balance;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    new_value,
    reason
  )
  values (
    employee.company_id,
    actor.id,
    'adjust',
    'leave_balances',
    balance.id,
    to_jsonb(balance),
    'Leave balance assigned'
  );

  return balance;
end;
$$;

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
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  leave_request public.leave_requests%rowtype;
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

  if coalesce(request_total_hours, 0) <= 0 then
    raise exception 'Leave hours must be more than zero';
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
    submitted_by
  )
  values (
    actor.company_id,
    actor.employee_id,
    leave_type.id,
    request_start_date,
    request_end_date,
    request_total_hours,
    nullif(btrim(coalesce(request_reason, '')), ''),
    nullif(btrim(coalesce(request_attachment_url, '')), ''),
    'submitted',
    now(),
    actor.id
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
    leave_request.reason
  );

  return leave_request;
end;
$$;

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
begin
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
    and company_id = existing.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.can_manage_time_record(existing.company_id, existing.employee_id) then
    raise exception 'You do not have permission to review this leave request';
  end if;

  if existing.status <> 'submitted' then
    raise exception 'Only submitted leave requests can be reviewed';
  end if;

  update public.leave_requests
  set status = case when approve_request then 'approved' else 'rejected' end,
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
    case when approve_request then 'approve' else 'reject' end,
    'leave_requests',
    reviewed.id,
    to_jsonb(existing),
    to_jsonb(reviewed),
    nullif(btrim(coalesce(manager_notes, '')), '')
  );

  return reviewed;
end;
$$;

grant execute on function public.create_company_work_schedule(uuid, text, time, time, integer, integer[], numeric) to authenticated;
grant execute on function public.create_company_leave_type(uuid, text, public.leave_category, boolean, boolean, numeric) to authenticated;
grant execute on function public.assign_employee_leave_balance(uuid, uuid, numeric) to authenticated;
grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text) to authenticated;
grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.24-work-rules-time-off',
  'Work rules and time off requests',
  'Managers can set working rules and time off rules, employees can request leave, and longer timesheet lists are grouped by week.',
  array[
    'Company admins can create work rules with working days, working hours, lunch time, and paid hours.',
    'Work rules can be assigned to employees from the employee form.',
    'Company admins can create time off rules and assign leave balances to employees.',
    'Employees can submit time off requests from their dashboard.',
    'Managers can approve or reject submitted time off requests.',
    'Employee timesheets group into collapsible weeks after seven records.'
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
