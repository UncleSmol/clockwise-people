-- Migration: 20261028000000_flexible_lunch_and_submission_notes.sql
-- Description:
-- 1. Loosen lunch enforcement in refresh_time_entry_calculations: do NOT auto-deduct scheduled lunch
--    when an employee did not take lunch (lunch_start and lunch_end are null). Lunch defaults to 0.
-- 2. Provide alias refresh_time_entry -> refresh_time_entry_calculations.
-- 3. Loosen update_own_draft_time_entry to allow saving completely lunch-free drafts.
-- 4. In submit_own_timesheets, allow submitting timesheets with no lunch.

-- 1. Recreate refresh_time_entry_calculations with flexible lunch (no forced lunch deduction)
create or replace function public.refresh_time_entry_calculations(target_time_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  entry public.time_entries%rowtype;
  company_setting public.company_settings%rowtype;
  target_schedule_id uuid;
  scheduled_start time;
  scheduled_end time;
  scheduled_lunch_minutes integer := 0;
  scheduled_paid_hours numeric(6,2);
  standard_paid_hours numeric(6,2);
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

  select *
    into company_setting
  from public.company_settings
  where company_id = entry.company_id;

  standard_paid_hours := coalesce(company_setting.standard_daily_hours, 8)::numeric(6,2);

  select coalesce(
    (
      select assignments.work_schedule_id
      from public.employee_work_schedule_assignments assignments
      join public.work_schedules schedules
        on schedules.id = assignments.work_schedule_id
       and schedules.company_id = assignments.company_id
       and schedules.is_active
       and schedules.deleted_at is null
      where assignments.company_id = entry.company_id
        and assignments.employee_id = entry.employee_id
        and assignments.is_active
        and assignments.deleted_at is null
        and assignments.effective_from <= entry.work_date
        and (assignments.effective_to is null or assignments.effective_to >= entry.work_date)
      order by assignments.priority, assignments.effective_from desc
      limit 1
    ),
    e.work_schedule_id,
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
    select sd.start_time, sd.end_time, sd.lunch_minutes,
           public.normalized_schedule_paid_hours(sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, standard_paid_hours)
      into scheduled_start, scheduled_end, scheduled_lunch_minutes, scheduled_paid_hours
    from public.schedule_days sd
    where sd.work_schedule_id = target_schedule_id
      and sd.day_of_week = extract(dow from entry.work_date)::integer
      and sd.is_working_day
    limit 1;
  end if;

  scheduled_paid_hours := coalesce(scheduled_paid_hours, standard_paid_hours)::numeric(6,2);

  if scheduled_paid_hours < greatest(standard_paid_hours * 0.5, 4)::numeric(6,2) then
    scheduled_paid_hours := standard_paid_hours;
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

  -- Flexible lunch: only deduct lunch if actual lunch was recorded (lunch_start and lunch_end).
  -- Do not auto-deduct scheduled lunch if employee worked through lunch or skipped lunch.
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
  else
    lunch := 0;
  end if;

  paid := greatest(gross - lunch, 0)::numeric(6,2);

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

grant execute on function public.refresh_time_entry_calculations(uuid) to authenticated;

-- 2. Create alias function refresh_time_entry -> refresh_time_entry_calculations
create or replace function public.refresh_time_entry(target_time_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_time_entry_calculations(target_time_entry_id);
end;
$$;

grant execute on function public.refresh_time_entry(uuid) to authenticated;

-- 3. Loosen update_own_draft_time_entry: allow null lunch times and ensure refresh_time_entry_calculations is called
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

  -- Flexible lunch validation: allow lunch times to be null (no lunch).
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

  perform public.refresh_time_entry_calculations(entry.id);

  select *
    into entry
  from public.time_entries
  where id = target_time_entry_id;

  return entry;
end;
$$;

grant execute on function public.update_own_draft_time_entry(uuid, time, time, time, time, text) to authenticated;
