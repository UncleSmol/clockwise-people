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
    and company_id = existing.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.can_manage_time_record(existing.company_id, existing.employee_id) then
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
    (case when approve_request then 'approve' else 'reject' end)::public.audit_action,
    'timesheet_correction_requests',
    correction.id,
    to_jsonb(existing),
    to_jsonb(correction),
    correction.review_notes
  );

  return correction;
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
    (case when approve_request then 'approve' else 'reject' end)::public.audit_action,
    'leave_requests',
    reviewed.id,
    to_jsonb(existing),
    to_jsonb(reviewed),
    nullif(btrim(coalesce(manager_notes, '')), '')
  );

  return reviewed;
end;
$$;

grant execute on function public.review_timesheet_correction_request(uuid, boolean, text) to authenticated;
grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated;
