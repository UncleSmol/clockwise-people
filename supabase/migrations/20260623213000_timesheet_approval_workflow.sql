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
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if coalesce(array_length(target_time_entry_ids, 1), 0) = 0 then
    raise exception 'Choose at least one timesheet to approve';
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

  update public.time_entries te
  set status = 'approved',
      approved_by = actor.id,
      approved_at = now(),
      notes = concat_ws(E'\n', nullif(te.notes, ''), nullif(btrim(coalesce(approval_notes, '')), '')),
      updated_at = now()
  where te.id = any(target_time_entry_ids)
    and te.status = 'submitted'
    and te.deleted_at is null
    and public.can_manage_time_record(te.company_id, te.employee_id);

  get diagnostics approved_count = row_count;

  update public.timesheets ts
  set status = 'approved',
      approved_by = actor.id,
      approved_at = now(),
      updated_at = now()
  where ts.status = 'submitted'
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
        and pending.status <> 'approved'
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
    'approve',
    'time_entries',
    jsonb_build_object('time_entry_ids', target_time_entry_ids, 'approved_count', approved_count),
    nullif(btrim(coalesce(approval_notes, '')), '')
  );

  return approved_count;
end;
$$;

grant execute on function public.review_timesheet_correction_request(uuid, boolean, text) to authenticated;
grant execute on function public.approve_managed_timesheets(uuid[], text) to authenticated;
