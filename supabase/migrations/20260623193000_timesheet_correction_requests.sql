create table public.timesheet_correction_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  work_date date not null,
  original_clock_in time,
  original_lunch_start time,
  original_lunch_end time,
  original_clock_out time,
  proposed_clock_in time,
  proposed_lunch_start time,
  proposed_lunch_end time,
  proposed_clock_out time,
  reason text not null,
  status public.approval_status not null default 'submitted',
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint timesheet_correction_reason_not_blank check (btrim(reason) <> ''),
  constraint timesheet_correction_status_reviewed check (
    (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
    or (status not in ('approved', 'rejected') and reviewed_by is null and reviewed_at is null)
  ),
  constraint timesheet_correction_has_change check (
    proposed_clock_in is distinct from original_clock_in
    or proposed_lunch_start is distinct from original_lunch_start
    or proposed_lunch_end is distinct from original_lunch_end
    or proposed_clock_out is distinct from original_clock_out
  )
);

alter table public.timesheet_correction_requests enable row level security;

create trigger timesheet_correction_requests_set_updated_at
before update on public.timesheet_correction_requests
for each row execute function public.set_updated_at();

create index idx_timesheet_corrections_company_employee
on public.timesheet_correction_requests(company_id, employee_id, submitted_at desc);

create index idx_timesheet_corrections_entry
on public.timesheet_correction_requests(time_entry_id, submitted_at desc);

create index idx_timesheet_corrections_company_status
on public.timesheet_correction_requests(company_id, status, submitted_at desc);

create policy "role scoped timesheet corrections can view"
on public.timesheet_correction_requests for select
to authenticated
using (
  deleted_at is null
  and (
    public.can_access_employee(company_id, employee_id)
    or public.has_company_role(company_id, 'payroll_viewer')
  )
);

create policy "managers can review timesheet corrections"
on public.timesheet_correction_requests for update
to authenticated
using (
  status = 'submitted'
  and public.can_manage_time_record(company_id, employee_id)
)
with check (
  status in ('approved', 'rejected', 'cancelled')
  and public.can_manage_time_record(company_id, employee_id)
);

create or replace function public.submit_timesheet_correction_request(
  target_time_entry_id uuid,
  proposed_clock_in time,
  proposed_lunch_start time,
  proposed_lunch_end time,
  proposed_clock_out time,
  correction_reason text
)
returns public.timesheet_correction_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  entry public.time_entries%rowtype;
  company_timezone text;
  local_today date;
  correction public.timesheet_correction_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if btrim(coalesce(correction_reason, '')) = '' then
    raise exception 'A correction reason is required';
  end if;

  if (proposed_lunch_start is null) <> (proposed_lunch_end is null) then
    raise exception 'Lunch start and lunch end must be corrected together';
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
    and deleted_at is null;

  if not found then
    raise exception 'Time entry could not be found for this employee';
  end if;

  select timezone
    into company_timezone
  from public.companies
  where id = entry.company_id;

  company_timezone := coalesce(nullif(company_timezone, ''), 'UTC');
  local_today := (now() at time zone company_timezone)::date;

  if entry.work_date >= local_today then
    raise exception 'Only past time entries can be corrected';
  end if;

  if entry.status = 'cancelled' then
    raise exception 'Cancelled time entries cannot be corrected';
  end if;

  if entry.clock_in is not distinct from proposed_clock_in
    and entry.lunch_start is not distinct from proposed_lunch_start
    and entry.lunch_end is not distinct from proposed_lunch_end
    and entry.clock_out is not distinct from proposed_clock_out then
    raise exception 'At least one proposed time must be different';
  end if;

  if exists (
    select 1
    from public.timesheet_correction_requests existing
    where existing.time_entry_id = entry.id
      and existing.company_id = entry.company_id
      and existing.employee_id = entry.employee_id
      and existing.status = 'submitted'
      and existing.deleted_at is null
  ) then
    raise exception 'This time entry already has a submitted correction request';
  end if;

  insert into public.timesheet_correction_requests (
    company_id,
    employee_id,
    time_entry_id,
    payroll_period_id,
    work_date,
    original_clock_in,
    original_lunch_start,
    original_lunch_end,
    original_clock_out,
    proposed_clock_in,
    proposed_lunch_start,
    proposed_lunch_end,
    proposed_clock_out,
    reason,
    submitted_by
  )
  values (
    entry.company_id,
    entry.employee_id,
    entry.id,
    entry.payroll_period_id,
    entry.work_date,
    entry.clock_in,
    entry.lunch_start,
    entry.lunch_end,
    entry.clock_out,
    proposed_clock_in,
    proposed_lunch_start,
    proposed_lunch_end,
    proposed_clock_out,
    btrim(correction_reason),
    actor.id
  )
  returning * into correction;

  insert into public.approval_requests (
    company_id,
    request_type,
    request_id,
    submitted_by,
    status,
    notes
  )
  values (
    correction.company_id,
    'timesheet',
    correction.id,
    actor.id,
    'submitted',
    correction.reason
  );

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
    correction.company_id,
    actor.id,
    'submit',
    'timesheet_correction_requests',
    correction.id,
    to_jsonb(correction),
    correction.reason
  );

  return correction;
end;
$$;

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
  set status = case when approve_request then 'approved' else 'rejected' end,
      reviewed_by = actor.id,
      reviewed_at = now(),
      review_notes = nullif(btrim(coalesce(manager_notes, '')), '')
  where id = existing.id
  returning * into correction;

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

grant execute on function public.submit_timesheet_correction_request(uuid, time, time, time, time, text) to authenticated;
grant execute on function public.review_timesheet_correction_request(uuid, boolean, text) to authenticated;
