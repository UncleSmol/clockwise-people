create or replace function public.normalized_schedule_paid_hours(
  schedule_start time,
  schedule_end time,
  schedule_lunch_minutes integer,
  configured_paid_hours numeric,
  fallback_paid_hours numeric
)
returns numeric
language plpgsql
stable
as $$
declare
  gross_hours numeric(8,2);
  lunch_hours numeric(8,2);
  derived_paid_hours numeric(8,2);
  configured numeric(8,2);
begin
  configured := nullif(configured_paid_hours, 0);
  lunch_hours := greatest(coalesce(schedule_lunch_minutes, 0), 0)::numeric / 60;

  if schedule_start is not null and schedule_end is not null then
    gross_hours := greatest(
      extract(epoch from (
        case
          when schedule_end >= schedule_start then
            ('2000-01-01 ' || schedule_end)::timestamp - ('2000-01-01 ' || schedule_start)::timestamp
          else
            ('2000-01-02 ' || schedule_end)::timestamp - ('2000-01-01 ' || schedule_start)::timestamp
        end
      )) / 3600,
      0
    )::numeric(8,2);
    derived_paid_hours := greatest(gross_hours - lunch_hours, 0)::numeric(8,2);

    if configured is null then
      return coalesce(nullif(derived_paid_hours, 0), fallback_paid_hours, 8)::numeric(8,2);
    end if;

    if lunch_hours > 0
      and gross_hours > 0
      and abs(configured - gross_hours) < 0.02
      and derived_paid_hours > 0 then
      return derived_paid_hours::numeric(8,2);
    end if;
  end if;

  return coalesce(configured, nullif(derived_paid_hours, 0), fallback_paid_hours, 8)::numeric(8,2);
end;
$$;

create or replace function public.recalculate_employee_period_fill_up(
  target_company_id uuid,
  target_employee_id uuid,
  target_payroll_period_id uuid,
  target_work_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  running_shortfall numeric(8,2) := 0;
  base_normal numeric(8,2);
  base_overtime numeric(8,2);
  applied_fill_up numeric(8,2);
  target_normal numeric(8,2);
  target_overtime numeric(8,2);
  clean_warning text;
begin
  for item in
    select
      te.id,
      te.paid_hours,
      te.normal_hours,
      te.overtime_hours,
      te.warning_notes,
      te.notes,
      coalesce(
        public.normalized_schedule_paid_hours(sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, cs.standard_daily_hours),
        cs.standard_daily_hours,
        8
      )::numeric(8,2) as scheduled_nt
    from public.time_entries te
    join public.employees e
      on e.id = te.employee_id
     and e.company_id = te.company_id
    left join public.company_settings cs
      on cs.company_id = te.company_id
    left join public.schedule_days sd
      on sd.work_schedule_id = coalesce((
          select assignments.work_schedule_id
          from public.employee_work_schedule_assignments assignments
          join public.work_schedules schedules
            on schedules.id = assignments.work_schedule_id
           and schedules.company_id = assignments.company_id
           and schedules.is_active
           and schedules.deleted_at is null
          where assignments.company_id = te.company_id
            and assignments.employee_id = te.employee_id
            and assignments.is_active
            and assignments.deleted_at is null
            and assignments.effective_from <= te.work_date
            and (assignments.effective_to is null or assignments.effective_to >= te.work_date)
          order by assignments.priority, assignments.effective_from desc
          limit 1
        ), e.work_schedule_id, (
          select ws.id
          from public.work_schedules ws
          where ws.company_id = te.company_id
            and ws.branch_id = te.branch_id
            and ws.scope = 'branch'
            and ws.is_active
            and ws.deleted_at is null
          order by ws.created_at desc
          limit 1
        ), (
          select ws.id
          from public.work_schedules ws
          where ws.company_id = te.company_id
            and ws.scope = 'company'
            and ws.is_active
            and ws.deleted_at is null
          order by ws.created_at desc
          limit 1
        ))
     and sd.day_of_week = extract(dow from te.work_date)::integer
     and sd.is_working_day
    where te.company_id = target_company_id
      and te.employee_id = target_employee_id
      and te.deleted_at is null
      and (
        (target_payroll_period_id is not null and te.payroll_period_id = target_payroll_period_id)
        or (
          target_payroll_period_id is null
          and te.payroll_period_id is null
          and te.work_date between date_trunc('month', target_work_date)::date
              and (date_trunc('month', target_work_date)::date + interval '1 month - 1 day')::date
        )
      )
    order by te.work_date, te.created_at, te.id
  loop
    base_normal := least(coalesce(item.paid_hours, 0), coalesce(item.scheduled_nt, 8))::numeric(8,2);
    base_overtime := greatest(coalesce(item.paid_hours, 0) - coalesce(item.scheduled_nt, 8), 0)::numeric(8,2);
    applied_fill_up := least(base_overtime, running_shortfall)::numeric(8,2);
    target_normal := (base_normal + applied_fill_up)::numeric(8,2);
    target_overtime := (base_overtime - applied_fill_up)::numeric(8,2);
    clean_warning := nullif(
      btrim(
        regexp_replace(
          coalesce(item.warning_notes, ''),
          'NT fill-up applied: [0-9]+(\.[0-9]+)?h of generated overtime was used to cover earlier normal-time shortfall\.',
          '',
          'g'
        )
      ),
      ''
    );

    if applied_fill_up > 0 then
      clean_warning := concat_ws(
        ' ',
        clean_warning,
        'NT fill-up applied: ' || applied_fill_up::text || 'h of generated overtime was used to cover earlier normal-time shortfall.'
      );
    end if;

    update public.time_entries
    set normal_hours = target_normal,
        overtime_hours = target_overtime,
        warning_notes = clean_warning,
        updated_at = now()
    where id = item.id;

    running_shortfall := greatest(
      running_shortfall + greatest(coalesce(item.scheduled_nt, 8) - base_normal, 0) - applied_fill_up,
      0
    )::numeric(8,2);
  end loop;
end;
$$;

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
      warning_notes = null,
      updated_at = now()
  where id = entry.id;

  perform public.recalculate_employee_period_fill_up(
    entry.company_id,
    entry.employee_id,
    entry.payroll_period_id,
    entry.work_date
  );
end;
$$;

create or replace function public.sync_company_public_holiday_time_entries(
  target_company_id uuid,
  target_year integer default extract(year from current_date)::integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  item record;
  target_schedule_id uuid;
  target_period_id uuid;
  target_timesheet_id uuid;
  scheduled_gross_hours numeric(6,2);
  scheduled_lunch_hours numeric(6,2);
  scheduled_paid_hours numeric(6,2);
  affected_count integer := 0;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  for item in
    select
      e.id as employee_id,
      e.branch_id,
      e.work_schedule_id,
      h.holiday_date,
      h.name as holiday_name
    from public.employees e
    join public.company_public_holidays h
      on h.company_id = e.company_id
     and h.deleted_at is null
     and h.is_paid
     and extract(year from h.holiday_date)::integer = target_year
    where e.company_id = target_company_id
      and e.employment_status = 'active'
      and e.deleted_at is null
  loop
    select assignments.work_schedule_id
      into target_schedule_id
    from public.employee_work_schedule_assignments assignments
    join public.work_schedules schedules
      on schedules.id = assignments.work_schedule_id
     and schedules.company_id = assignments.company_id
     and schedules.is_active
     and schedules.deleted_at is null
    where assignments.company_id = target_company_id
      and assignments.employee_id = item.employee_id
      and assignments.is_active
      and assignments.deleted_at is null
      and assignments.effective_from <= item.holiday_date
      and (assignments.effective_to is null or assignments.effective_to >= item.holiday_date)
    order by assignments.priority, assignments.effective_from desc
    limit 1;

    target_schedule_id := coalesce(target_schedule_id, item.work_schedule_id);

    if target_schedule_id is null then
      select ws.id
        into target_schedule_id
      from public.work_schedules ws
      where ws.company_id = target_company_id
        and ws.branch_id = item.branch_id
        and ws.scope = 'branch'
        and ws.is_active
        and ws.deleted_at is null
      order by ws.created_at desc
      limit 1;
    end if;

    if target_schedule_id is null then
      select ws.id
        into target_schedule_id
      from public.work_schedules ws
      where ws.company_id = target_company_id
        and ws.scope = 'company'
        and ws.is_active
        and ws.deleted_at is null
      order by ws.created_at desc
      limit 1;
    end if;

    scheduled_gross_hours := null;
    scheduled_lunch_hours := 0;
    scheduled_paid_hours := null;

    if target_schedule_id is not null then
      select
        case
          when sd.start_time is not null and sd.end_time is not null then
            greatest(
              extract(epoch from (
                case
                  when sd.end_time >= sd.start_time then
                    ('2000-01-01 ' || sd.end_time)::timestamp - ('2000-01-01 ' || sd.start_time)::timestamp
                  else
                    ('2000-01-02 ' || sd.end_time)::timestamp - ('2000-01-01 ' || sd.start_time)::timestamp
                end
              )) / 3600,
              0
            )::numeric(6,2)
          else null
        end,
        greatest(coalesce(sd.lunch_minutes, 0), 0)::numeric / 60,
        public.normalized_schedule_paid_hours(sd.start_time, sd.end_time, sd.lunch_minutes, sd.paid_hours, 8)
        into scheduled_gross_hours, scheduled_lunch_hours, scheduled_paid_hours
      from public.schedule_days sd
      where sd.work_schedule_id = target_schedule_id
        and sd.day_of_week = extract(dow from item.holiday_date)::integer
        and sd.is_working_day
      limit 1;
    end if;

    if target_schedule_id is null and extract(dow from item.holiday_date)::integer between 1 and 5 then
      scheduled_paid_hours := 8;
      scheduled_lunch_hours := 1;
      scheduled_gross_hours := 9;
    end if;

    if coalesce(scheduled_paid_hours, 0) <= 0 then
      continue;
    end if;

    scheduled_gross_hours := coalesce(scheduled_gross_hours, scheduled_paid_hours + scheduled_lunch_hours)::numeric(6,2);

    select id
      into target_period_id
    from public.payroll_periods
    where company_id = target_company_id
      and item.holiday_date between period_start and period_end
      and status in ('open', 'reopened')
      and deleted_at is null
    order by period_start desc
    limit 1;

    select id
      into target_timesheet_id
    from public.timesheets
    where company_id = target_company_id
      and employee_id = item.employee_id
      and (
        (target_period_id is not null and payroll_period_id = target_period_id)
        or (target_period_id is null and payroll_period_id is null)
      )
      and deleted_at is null
    order by created_at desc
    limit 1;

    if target_timesheet_id is null then
      insert into public.timesheets (
        company_id,
        employee_id,
        payroll_period_id,
        status,
        notes
      )
      values (
        target_company_id,
        item.employee_id,
        target_period_id,
        'draft',
        'Created for public holiday booking'
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
      gross_hours,
      lunch_hours,
      paid_hours,
      normal_hours,
      overtime_hours,
      missing_clocking,
      late_arrival,
      early_departure,
      notes,
      status,
      approved_by,
      approved_at
    )
    values (
      target_company_id,
      target_timesheet_id,
      item.employee_id,
      target_period_id,
      item.holiday_date,
      item.branch_id,
      scheduled_gross_hours,
      scheduled_lunch_hours,
      scheduled_paid_hours,
      scheduled_paid_hours,
      0,
      false,
      false,
      false,
      'Public holiday: ' || item.holiday_name,
      'approved',
      actor_id,
      now()
    )
    on conflict (company_id, employee_id, work_date)
    do update set
      timesheet_id = excluded.timesheet_id,
      payroll_period_id = excluded.payroll_period_id,
      branch_id = excluded.branch_id,
      gross_hours = excluded.gross_hours,
      lunch_hours = excluded.lunch_hours,
      paid_hours = excluded.paid_hours,
      normal_hours = excluded.normal_hours,
      overtime_hours = 0,
      missing_clocking = false,
      late_arrival = false,
      early_departure = false,
      notes = excluded.notes,
      status = 'approved',
      approved_by = actor_id,
      approved_at = now(),
      deleted_at = null,
      updated_at = now()
    where public.time_entries.deleted_at is not null
       or (
        public.time_entries.status in ('draft', 'approved')
        and public.time_entries.clock_in is null
        and public.time_entries.lunch_start is null
        and public.time_entries.lunch_end is null
        and public.time_entries.clock_out is null
        and coalesce(public.time_entries.notes, '') like 'Public holiday:%'
      );

    get diagnostics affected_count = row_count;
  end loop;

  return affected_count;
end;
$$;

do $$
declare
  item record;
begin
  for item in
    select distinct company_id, employee_id, payroll_period_id, work_date
    from public.time_entries
    where deleted_at is null
  loop
    perform public.recalculate_employee_period_fill_up(
      item.company_id,
      item.employee_id,
      item.payroll_period_id,
      item.work_date
    );
  end loop;
end;
$$;

grant execute on function public.normalized_schedule_paid_hours(time, time, integer, numeric, numeric) to authenticated;
grant execute on function public.recalculate_employee_period_fill_up(uuid, uuid, uuid, date) to authenticated;
grant execute on function public.refresh_time_entry_calculations(uuid) to service_role;
grant execute on function public.sync_company_public_holiday_time_entries(uuid, integer) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.26-nt-fill-up-holiday-hours',
  'Normal-time fill-up and holiday hours corrected',
  'Public holiday paid hours now use normal time, and overtime is reduced until earlier normal-time shortfalls are filled.',
  array[
    'Public holidays now pay normal time instead of the full shift span.',
    'Overtime now fills earlier normal-time shortfalls before accumulating.'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at,
    is_published = true,
    updated_at = now();
