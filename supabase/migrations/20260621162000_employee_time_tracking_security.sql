create type public.clock_event_type as enum (
  'clock_in',
  'lunch_start',
  'lunch_end',
  'clock_out'
);

create table public.time_clock_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  event_type public.clock_event_type not null,
  event_at timestamptz not null default now(),
  local_work_date date not null,
  local_event_time time not null,
  source text not null default 'web',
  device_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.time_clock_events enable row level security;

create index idx_time_clock_events_company_employee
on public.time_clock_events(company_id, employee_id, event_at desc);

create index idx_time_clock_events_entry
on public.time_clock_events(time_entry_id, event_at);

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
  select exists (
    select 1
    from public.users u
    join public.user_roles ur
      on ur.user_id = u.id
      and ur.company_id = u.company_id
      and ur.revoked_at is null
    join public.roles r
      on r.id = ur.role_id
      and r.company_id = u.company_id
    where u.auth_user_id = auth.uid()
      and u.company_id = target_company_id
      and u.status = 'active'
      and u.deleted_at is null
      and r.key = any(target_roles)
  );
$$;

create or replace function public.current_app_user_id(target_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.company_id = target_company_id
    and u.status = 'active'
    and u.deleted_at is null
  limit 1;
$$;

create or replace function public.current_employee_id(target_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.employee_id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.company_id = target_company_id
    and u.status = 'active'
    and u.deleted_at is null
    and u.employee_id is not null
  limit 1;
$$;

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
    public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[])
    or public.current_employee_id(target_company_id) = target_employee_id
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
    );
$$;

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
    );
$$;

create or replace function public.is_own_employee_record(
  target_company_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_employee_id(target_company_id) = target_employee_id;
$$;

create or replace function public.refresh_time_entry_calculations(target_time_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.time_entries%rowtype;
  target_schedule_id uuid;
  scheduled_start time;
  scheduled_end time;
  scheduled_paid_hours numeric(6,2);
  gross numeric(6,2) := 0;
  lunch numeric(6,2) := 0;
  paid numeric(6,2) := 0;
begin
  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id;

  if not found then
    raise exception 'Time entry not found';
  end if;

  select coalesce(
    e.work_schedule_id,
    (
      select ws.id
      from public.work_schedules ws
      where ws.company_id = entry.company_id
        and ws.branch_id = entry.branch_id
        and ws.scope = 'branch'
        and ws.is_active
        and ws.deleted_at is null
      order by ws.created_at desc
      limit 1
    ),
    (
      select ws.id
      from public.work_schedules ws
      where ws.company_id = entry.company_id
        and ws.scope = 'company'
        and ws.is_active
        and ws.deleted_at is null
      order by ws.created_at desc
      limit 1
    )
  )
    into target_schedule_id
  from public.employees e
  where e.id = entry.employee_id
    and e.company_id = entry.company_id;

  if target_schedule_id is not null then
    select sd.start_time, sd.end_time, nullif(sd.paid_hours, 0)
      into scheduled_start, scheduled_end, scheduled_paid_hours
    from public.schedule_days sd
    where sd.work_schedule_id = target_schedule_id
      and sd.day_of_week = extract(dow from entry.work_date)::integer
      and sd.is_working_day
    limit 1;
  end if;

  if entry.clock_in is not null and entry.clock_out is not null then
    gross := greatest(
      extract(epoch from (
        case
          when entry.clock_out >= entry.clock_in then
            ('2000-01-01 ' || entry.clock_out)::timestamp - ('2000-01-01 ' || entry.clock_in)::timestamp
          else
            ('2000-01-02 ' || entry.clock_out)::timestamp - ('2000-01-01 ' || entry.clock_in)::timestamp
        end
      )) / 3600,
      0
    )::numeric(6,2);
  end if;

  if entry.lunch_start is not null and entry.lunch_end is not null then
    lunch := greatest(
      extract(epoch from (
        case
          when entry.lunch_end >= entry.lunch_start then
            ('2000-01-01 ' || entry.lunch_end)::timestamp - ('2000-01-01 ' || entry.lunch_start)::timestamp
          else
            ('2000-01-02 ' || entry.lunch_end)::timestamp - ('2000-01-01 ' || entry.lunch_start)::timestamp
        end
      )) / 3600,
      0
    )::numeric(6,2);
  end if;

  paid := greatest(gross - lunch, 0)::numeric(6,2);
  scheduled_paid_hours := coalesce(scheduled_paid_hours, 8)::numeric(6,2);

  update public.time_entries
  set gross_hours = gross,
      lunch_hours = lunch,
      paid_hours = paid,
      normal_hours = least(paid, scheduled_paid_hours)::numeric(6,2),
      overtime_hours = greatest(paid - scheduled_paid_hours, 0)::numeric(6,2),
      missing_clocking = (
        clock_in is null
        or clock_out is null
        or (lunch_start is not null and lunch_end is null)
      ),
      late_arrival = (
        scheduled_start is not null
        and clock_in is not null
        and clock_in > (scheduled_start + interval '5 minutes')::time
      ),
      early_departure = (
        scheduled_end is not null
        and clock_out is not null
        and clock_out < scheduled_end
      ),
      updated_at = now()
  where id = entry.id;
end;
$$;

create or replace function public.record_employee_time_event(
  requested_event public.clock_event_type,
  device_metadata jsonb default '{}'::jsonb
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  employee public.employees%rowtype;
  company_timezone text;
  local_now timestamp;
  local_date date;
  local_time time;
  target_period_id uuid;
  target_timesheet_id uuid;
  entry public.time_entries%rowtype;
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

  select *
    into employee
  from public.employees
  where id = actor.employee_id
    and company_id = actor.company_id
    and employment_status = 'active'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Active employee record could not be found';
  end if;

  select timezone
    into company_timezone
  from public.companies
  where id = employee.company_id;

  company_timezone := coalesce(nullif(company_timezone, ''), 'UTC');
  local_now := now() at time zone company_timezone;
  local_date := local_now::date;
  local_time := local_now::time;

  select id
    into target_period_id
  from public.payroll_periods
  where company_id = employee.company_id
    and local_date between period_start and period_end
    and status in ('open', 'reopened')
    and deleted_at is null
  order by period_start desc
  limit 1;

  select *
    into entry
  from public.time_entries
  where company_id = employee.company_id
    and employee_id = employee.id
    and work_date = local_date
    and deleted_at is null
  for update;

  if not found then
    select id
      into target_timesheet_id
    from public.timesheets
    where company_id = employee.company_id
      and employee_id = employee.id
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
        employee.company_id,
        employee.id,
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
      branch_id,
      status
    )
    values (
      employee.company_id,
      target_timesheet_id,
      employee.id,
      target_period_id,
      local_date,
      employee.branch_id,
      'draft'
    )
    returning * into entry;
  end if;

  if entry.status not in ('draft', 'rejected') then
    raise exception 'This time entry can no longer be edited';
  end if;

  if requested_event = 'clock_in' then
    if entry.clock_in is not null then
      raise exception 'You have already clocked in for today';
    end if;

    update public.time_entries
    set clock_in = local_time,
        updated_at = now()
    where id = entry.id
    returning * into entry;
  elsif requested_event = 'lunch_start' then
    if entry.clock_in is null then
      raise exception 'Clock in before starting lunch';
    end if;

    if entry.lunch_start is not null then
      raise exception 'Lunch has already been started';
    end if;

    if entry.clock_out is not null then
      raise exception 'Cannot start lunch after clocking out';
    end if;

    update public.time_entries
    set lunch_start = local_time,
        updated_at = now()
    where id = entry.id
    returning * into entry;
  elsif requested_event = 'lunch_end' then
    if entry.lunch_start is null then
      raise exception 'Start lunch before ending lunch';
    end if;

    if entry.lunch_end is not null then
      raise exception 'Lunch has already been ended';
    end if;

    if entry.clock_out is not null then
      raise exception 'Cannot end lunch after clocking out';
    end if;

    update public.time_entries
    set lunch_end = local_time,
        updated_at = now()
    where id = entry.id
    returning * into entry;
  elsif requested_event = 'clock_out' then
    if entry.clock_in is null then
      raise exception 'Clock in before clocking out';
    end if;

    if entry.clock_out is not null then
      raise exception 'You have already clocked out for today';
    end if;

    if entry.lunch_start is not null and entry.lunch_end is null then
      raise exception 'End lunch before clocking out';
    end if;

    update public.time_entries
    set clock_out = local_time,
        updated_at = now()
    where id = entry.id
    returning * into entry;
  else
    raise exception 'Unsupported time event';
  end if;

  perform public.refresh_time_entry_calculations(entry.id);

  insert into public.time_clock_events (
    company_id,
    employee_id,
    time_entry_id,
    event_type,
    event_at,
    local_work_date,
    local_event_time,
    device_metadata,
    created_by
  )
  values (
    entry.company_id,
    entry.employee_id,
    entry.id,
    requested_event,
    now(),
    local_date,
    local_time,
    coalesce(device_metadata, '{}'::jsonb),
    actor.id
  );

  select *
    into entry
  from public.time_entries
  where id = entry.id;

  return entry;
end;
$$;

drop policy if exists "company members can view users" on public.users;
create policy "role scoped users can view users"
on public.users for select
to authenticated
using (
  public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
  or auth_user_id = auth.uid()
  or (
    public.has_company_role(company_id, 'branch_manager')
    and exists (
      select 1
      from public.user_branch_assignments uba
      join public.employees e on e.id = users.employee_id and e.company_id = users.company_id
      where uba.company_id = users.company_id
        and uba.user_id = public.current_app_user_id(users.company_id)
        and uba.branch_id = e.branch_id
        and uba.revoked_at is null
    )
  )
);

drop policy if exists "company members can view employees" on public.employees;
create policy "role scoped employees can view employees"
on public.employees for select
to authenticated
using (
  deleted_at is null
  and public.can_access_employee(company_id, id)
);

drop policy if exists "company members can view timesheets" on public.timesheets;
drop policy if exists "company members can manage timesheets" on public.timesheets;
create policy "role scoped timesheets can view timesheets"
on public.timesheets for select
to authenticated
using (
  deleted_at is null
  and (
    public.can_access_employee(company_id, employee_id)
    or public.has_company_role(company_id, 'payroll_viewer')
  )
);

create policy "employees can create own draft timesheets"
on public.timesheets for insert
to authenticated
with check (
  status = 'draft'
  and public.is_own_employee_record(company_id, employee_id)
);

create policy "employees can update own draft timesheets"
on public.timesheets for update
to authenticated
using (
  status in ('draft', 'rejected')
  and public.is_own_employee_record(company_id, employee_id)
)
with check (
  status in ('draft', 'submitted', 'cancelled')
  and public.is_own_employee_record(company_id, employee_id)
);

create policy "managers can manage accessible timesheets"
on public.timesheets for all
to authenticated
using (public.can_manage_time_record(company_id, employee_id))
with check (public.can_manage_time_record(company_id, employee_id));

drop policy if exists "company members can view time entries" on public.time_entries;
drop policy if exists "company members can manage time entries" on public.time_entries;
create policy "role scoped time entries can view time entries"
on public.time_entries for select
to authenticated
using (
  deleted_at is null
  and (
    public.can_access_employee(company_id, employee_id)
    or public.has_company_role(company_id, 'payroll_viewer')
  )
);

create policy "employees can create own draft time entries"
on public.time_entries for insert
to authenticated
with check (
  status = 'draft'
  and public.is_own_employee_record(company_id, employee_id)
);

create policy "employees can update own draft time entries"
on public.time_entries for update
to authenticated
using (
  status in ('draft', 'rejected')
  and public.is_own_employee_record(company_id, employee_id)
)
with check (
  status in ('draft', 'submitted', 'cancelled')
  and public.is_own_employee_record(company_id, employee_id)
);

create policy "managers can manage accessible time entries"
on public.time_entries for all
to authenticated
using (public.can_manage_time_record(company_id, employee_id))
with check (public.can_manage_time_record(company_id, employee_id));

drop policy if exists "company members can view leave balances" on public.leave_balances;
create policy "role scoped leave balances can view leave balances"
on public.leave_balances for select
to authenticated
using (
  public.can_access_employee(company_id, employee_id)
  or public.has_company_role(company_id, 'payroll_viewer')
);

drop policy if exists "company members can view leave requests" on public.leave_requests;
drop policy if exists "company members can manage leave requests" on public.leave_requests;
create policy "role scoped leave requests can view leave requests"
on public.leave_requests for select
to authenticated
using (public.can_access_employee(company_id, employee_id));

create policy "employees can manage own draft leave requests"
on public.leave_requests for all
to authenticated
using (
  status in ('draft', 'rejected')
  and public.is_own_employee_record(company_id, employee_id)
)
with check (
  status in ('draft', 'submitted', 'cancelled')
  and public.is_own_employee_record(company_id, employee_id)
);

drop policy if exists "company members can view overtime records" on public.overtime_records;
create policy "role scoped overtime records can view overtime records"
on public.overtime_records for select
to authenticated
using (
  public.can_access_employee(company_id, employee_id)
  or public.has_company_role(company_id, 'payroll_viewer')
);

drop policy if exists "company members can view toil transactions" on public.toil_transactions;
create policy "role scoped toil transactions can view toil transactions"
on public.toil_transactions for select
to authenticated
using (
  public.can_access_employee(company_id, employee_id)
  or public.has_company_role(company_id, 'payroll_viewer')
);

drop policy if exists "company members can view approval requests" on public.approval_requests;
drop policy if exists "company members can manage approval requests" on public.approval_requests;
create policy "role scoped approval requests can view approval requests"
on public.approval_requests for select
to authenticated
using (
  public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
  or submitted_by = public.current_app_user_id(company_id)
  or approver_id = public.current_app_user_id(company_id)
);

create policy "company members can create own approval requests"
on public.approval_requests for insert
to authenticated
with check (
  submitted_by = public.current_app_user_id(company_id)
  and public.is_company_member(company_id)
);

drop policy if exists "company members can view monthly summaries" on public.monthly_summaries;
create policy "role scoped monthly summaries can view monthly summaries"
on public.monthly_summaries for select
to authenticated
using (
  public.can_access_employee(company_id, employee_id)
  or public.has_company_role(company_id, 'payroll_viewer')
);

drop policy if exists "company members can view user roles" on public.user_roles;
create policy "role scoped user roles can view user roles"
on public.user_roles for select
to authenticated
using (
  public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
  or user_id = public.current_app_user_id(company_id)
);

drop policy if exists "company members can view branch assignments" on public.user_branch_assignments;
create policy "role scoped branch assignments can view branch assignments"
on public.user_branch_assignments for select
to authenticated
using (
  public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
  or user_id = public.current_app_user_id(company_id)
);

create policy "role scoped clock events can view clock events"
on public.time_clock_events for select
to authenticated
using (
  public.can_access_employee(company_id, employee_id)
  or public.has_company_role(company_id, 'payroll_viewer')
);

create policy "employees can create own clock events"
on public.time_clock_events for insert
to authenticated
with check (public.is_own_employee_record(company_id, employee_id));

create policy "managers can manage accessible clock events"
on public.time_clock_events for all
to authenticated
using (public.can_manage_time_record(company_id, employee_id))
with check (public.can_manage_time_record(company_id, employee_id));

grant execute on function public.has_any_company_role(uuid, public.app_role[]) to authenticated, service_role;
grant execute on function public.current_app_user_id(uuid) to authenticated, service_role;
grant execute on function public.current_employee_id(uuid) to authenticated, service_role;
grant execute on function public.can_access_employee(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_time_record(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_own_employee_record(uuid, uuid) to authenticated, service_role;
grant execute on function public.record_employee_time_event(public.clock_event_type, jsonb) to authenticated;
grant execute on function public.refresh_time_entry_calculations(uuid) to service_role;
