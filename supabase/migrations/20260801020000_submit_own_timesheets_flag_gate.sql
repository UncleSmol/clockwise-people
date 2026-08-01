-- Submission flag gate: employees must acknowledge timesheets that need
-- attention (missing clocking, late arrival, early departure, or zero paid
-- hours despite clock data) before they can be submitted in bulk.
--
-- Adds an acknowledged_ids parameter to submit_own_timesheets. The database
-- enforces the gate so the UI checkbox can never be bypassed.

drop function if exists public.submit_own_timesheets(uuid[]);

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

  -- Enforce the flag gate before any state changes.
  for entry_record in
    select te.id,
           te.missing_clocking,
           te.late_arrival,
           te.early_departure,
           te.clock_in,
           te.paid_hours
    from public.time_entries te
    where te.company_id = actor.company_id
      and te.employee_id = actor.employee_id
      and te.id = any(target_time_entry_ids)
      and te.status in ('draft', 'rejected')
      and te.deleted_at is null
  loop
    if entry_record.missing_clocking
       or entry_record.late_arrival
       or entry_record.early_departure
       or (entry_record.clock_in is not null and entry_record.paid_hours <= 0) then
      if not (acknowledged_ids @> array[entry_record.id]) then
        raise exception 'Flag the timesheets that need attention before submitting';
      end if;
    end if;
  end loop;

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

grant execute on function public.submit_own_timesheets(uuid[], uuid[]) to authenticated;
