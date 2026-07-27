-- Fix refresh_time_entry_calculations still referencing entry.branch_id.
-- Also drops orphan column work_schedules.branch_id.

-- Step 1: Drop orphan column on work_schedules
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'work_schedules' and column_name = 'branch_id'
  ) then
    alter table public.work_schedules drop column branch_id;
  end if;
end $$;

-- Step 2: Recreate refresh_time_entry_calculations without branch_id refs
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
  elsif entry.clock_in is not null and entry.clock_out is not null then
    lunch := greatest(coalesce(scheduled_lunch_minutes, 0), 0)::numeric / 60;
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
