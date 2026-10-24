-- Loosen lunch requirements and support partial day Time Off in leave requests

-- 1. Loosen update_own_draft_time_entry: allow saving lunch_start alone (to complete lunch_end later)
create or replace function public.update_own_draft_time_entry(
  target_time_entry_id uuid,
  proposed_clock_in time,
  proposed_lunch_start time,
  proposed_lunch_end time,
  proposed_clock_out time,
  entry_notes text default null
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  entry public.time_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  -- Loosened lunch check: allow entering lunch_start alone, but require lunch_start if lunch_end is provided
  if proposed_lunch_start is null and proposed_lunch_end is not null then
    raise exception 'Lunch in time is required if lunch out is provided';
  end if;

  if proposed_lunch_start is not null and proposed_lunch_end is not null and proposed_lunch_end <= proposed_lunch_start then
    raise exception 'Lunch out time must be after lunch in time';
  end if;

  if proposed_clock_in is not null and proposed_clock_out is not null and proposed_clock_out <= proposed_clock_in then
    raise exception 'Clock out time must be after clock in time';
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

  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id
    and company_id = actor.company_id
    and employee_id = actor.employee_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Time entry could not be found for this employee';
  end if;

  if entry.status not in ('draft', 'rejected') then
    raise exception 'Submitted time entries need a correction request';
  end if;

  update public.time_entries
  set clock_in = proposed_clock_in,
      lunch_start = proposed_lunch_start,
      lunch_end = proposed_lunch_end,
      clock_out = proposed_clock_out,
      notes = nullif(btrim(coalesce(entry_notes, '')), ''),
      status = 'draft',
      updated_at = now()
  where id = entry.id
  returning * into entry;

  perform public.refresh_time_entry(entry.id);

  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id;

  return entry;
end;
$$;

-- 2. Loosen update_managed_draft_time_entry: allow saving lunch_start alone
create or replace function public.update_managed_draft_time_entry(
  target_time_entry_id uuid,
  target_employee_id uuid,
  proposed_clock_in time default null,
  proposed_lunch_start time default null,
  proposed_lunch_end time default null,
  proposed_clock_out time default null,
  entry_notes text default null
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  entry public.time_entries%rowtype;
  employee public.employees%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if proposed_lunch_start is null and proposed_lunch_end is not null then
    raise exception 'Lunch in time is required if lunch out is provided';
  end if;

  if proposed_lunch_start is not null and proposed_lunch_end is not null and proposed_lunch_end <= proposed_lunch_start then
    raise exception 'Lunch out time must be after lunch in time';
  end if;

  if proposed_clock_in is not null and proposed_clock_out is not null and proposed_clock_out <= proposed_clock_in then
    raise exception 'Clock out time must be after clock in time';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'No active user account is linked to this login';
  end if;

  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if not found then
    raise exception 'Employee record could not be found';
  end if;

  if not public.can_manage_time_record(employee.company_id, employee.id) then
    raise exception 'You do not have permission to manage this employee timesheet';
  end if;

  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id
    and company_id = employee.company_id
    and employee_id = employee.id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Time entry could not be found for this employee';
  end if;

  update public.time_entries
  set clock_in = proposed_clock_in,
      lunch_start = proposed_lunch_start,
      lunch_end = proposed_lunch_end,
      clock_out = proposed_clock_out,
      notes = nullif(btrim(coalesce(entry_notes, '')), ''),
      updated_at = now()
  where id = entry.id
  returning * into entry;

  perform public.refresh_time_entry(entry.id);

  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id;

  return entry;
end;
$$;

-- 3. Update submit_own_leave_request to support explicit partial day Time Off hours (request_total_hours)
create or replace function public.submit_own_leave_request(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date,
  request_total_hours numeric,
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

  -- Support partial day Time Off when requested hours are specified (> 0)
  if request_total_hours is not null and request_total_hours > 0 then
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
    raise exception 'The selected dates or time off do not include valid hours';
  end if;

  if calculated_hours > available_hours then
    raise exception 'You only have % hours available for % leave', available_hours, leave_type.name;
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
        when request_total_hours is not null and request_total_hours > 0 then concat('Time off hours: ', calculated_hours)
        else concat('Calculated leave hours: ', calculated_hours)
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

grant execute on function public.update_own_draft_time_entry(uuid, time, time, time, time, text) to authenticated;
grant execute on function public.update_managed_draft_time_entry(uuid, uuid, time, time, time, time, text) to authenticated;
grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text, boolean) to authenticated;
grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text) to authenticated;
