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
  set status = 'rejected',
      notes = concat_ws(E'\n', nullif(te.notes, ''), 'Manager note: ' || clean_notes),
      updated_at = now()
  where te.id = any(target_time_entry_ids)
    and te.status = 'submitted'
    and te.deleted_at is null
    and public.can_manage_time_record(te.company_id, te.employee_id);

  get diagnostics rejected_count = row_count;

  update public.timesheets ts
  set status = 'rejected',
      rejected_by = actor.id,
      rejected_at = now(),
      rejection_reason = clean_notes,
      updated_at = now()
  where ts.status in ('submitted', 'approved')
    and ts.deleted_at is null
    and exists (
      select 1
      from public.time_entries te
      where te.timesheet_id = ts.id
        and te.id = any(target_time_entry_ids)
        and te.status = 'rejected'
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
    'reject',
    'time_entries',
    jsonb_build_object('time_entry_ids', target_time_entry_ids, 'rejected_count', rejected_count),
    clean_notes
  );

  return rejected_count;
end;
$$;

grant execute on function public.reject_managed_timesheets(uuid[], text) to authenticated;
