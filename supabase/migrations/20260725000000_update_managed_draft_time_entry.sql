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

  if (proposed_lunch_start is null) <> (proposed_lunch_end is null) then
    raise exception 'Lunch start and lunch end must be saved together';
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

  if entry.status not in ('draft', 'rejected') then
    raise exception 'Only draft or rejected timesheets can be edited by a manager';
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

  perform public.refresh_time_entry_calculations(entry.id);

  select *
    into entry
  from public.time_entries
  where id = entry.id;

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
    entry.company_id,
    actor.id,
    'update',
    'time_entries',
    entry.id,
    to_jsonb(entry),
    'Manager edited timesheet from calendar'
  );

  return entry;
end;
$$;

create or replace function public.delete_managed_draft_time_entry(
  target_time_entry_id uuid,
  target_employee_id uuid
)
returns boolean
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

  if entry.status not in ('draft', 'rejected') then
    raise exception 'Only draft or rejected timesheets can be deleted';
  end if;

  update public.time_entries
  set deleted_at = now(),
      updated_at = now()
  where id = entry.id;

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
    entry.company_id,
    actor.id,
    'delete',
    'time_entries',
    entry.id,
    to_jsonb(entry),
    'Manager deleted timesheet from calendar'
  );

  return true;
end;
$$;

grant execute on function public.update_managed_draft_time_entry(uuid, uuid, time, time, time, time, text) to authenticated;
grant execute on function public.delete_managed_draft_time_entry(uuid, uuid) to authenticated;
