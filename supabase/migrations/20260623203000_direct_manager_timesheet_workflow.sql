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
    public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[])
    or (
      public.has_company_role(target_company_id, 'branch_manager')
      and exists (
        select 1
        from public.user_branch_assignments uba
        join public.employees e
          on e.branch_id = uba.branch_id
          and e.company_id = uba.company_id
        where uba.company_id = target_company_id
          and uba.user_id = public.current_app_user_id(target_company_id)
          and uba.revoked_at is null
          and e.id = target_employee_id
          and e.deleted_at is null
      )
    )
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

  if (proposed_lunch_start is null) <> (proposed_lunch_end is null) then
    raise exception 'Lunch start and lunch end must be saved together';
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
    'Employee saved draft timesheet'
  );

  return entry;
end;
$$;

create or replace function public.submit_own_timesheets(
  target_time_entry_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  submitted_count integer := 0;
begin
  if auth.uid() is null then
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
    and employee_id is not null
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'No active employee account is linked to this login';
  end if;

  update public.time_entries
  set status = 'submitted',
      submitted_at = now(),
      updated_at = now()
  where id = any(target_time_entry_ids)
    and company_id = actor.company_id
    and employee_id = actor.employee_id
    and status in ('draft', 'rejected')
    and deleted_at is null;

  get diagnostics submitted_count = row_count;

  update public.timesheets ts
  set status = 'submitted',
      submitted_at = coalesce(ts.submitted_at, now()),
      submitted_by = coalesce(ts.submitted_by, actor.id),
      updated_at = now()
  where ts.company_id = actor.company_id
    and ts.employee_id = actor.employee_id
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
    'Employee submitted timesheets in bulk'
  );

  return submitted_count;
end;
$$;

grant execute on function public.can_manage_time_record(uuid, uuid) to authenticated, service_role;
grant execute on function public.update_own_draft_time_entry(uuid, time, time, time, time, text) to authenticated;
grant execute on function public.submit_own_timesheets(uuid[]) to authenticated;

drop policy if exists "role scoped timesheet corrections can view"
on public.timesheet_correction_requests;

create policy "role scoped timesheet corrections can view"
on public.timesheet_correction_requests for select
to authenticated
using (
  deleted_at is null
  and (
    public.can_access_employee(company_id, employee_id)
    or public.can_manage_time_record(company_id, employee_id)
    or public.has_company_role(company_id, 'payroll_viewer')
  )
);
