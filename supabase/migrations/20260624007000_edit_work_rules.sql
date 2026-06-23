create or replace function public.update_company_work_schedule(
  target_schedule_id uuid,
  schedule_name text,
  work_start time,
  work_end time,
  lunch_minutes integer,
  working_days integer[],
  daily_hours numeric default null,
  active_rule boolean default true
)
returns public.work_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  existing public.work_schedules%rowtype;
  updated public.work_schedules%rowtype;
  day_index integer;
  computed_hours numeric(5,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
    into existing
  from public.work_schedules
  where id = target_schedule_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Work rule could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and company_id = existing.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.has_any_company_role(existing.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can edit work rules';
  end if;

  if btrim(coalesce(schedule_name, '')) = '' then
    raise exception 'Schedule name is required';
  end if;

  if work_start is null or work_end is null or work_end <= work_start then
    raise exception 'Enter valid working hours';
  end if;

  if coalesce(array_length(working_days, 1), 0) = 0 then
    raise exception 'Choose at least one working day';
  end if;

  if exists (
    select 1 from unnest(working_days) as selected_day
    where selected_day < 0 or selected_day > 6
  ) then
    raise exception 'Working days must be between Sunday and Saturday';
  end if;

  computed_hours := coalesce(
    daily_hours,
    greatest(
      extract(epoch from (work_end - work_start)) / 3600
      - (greatest(coalesce(lunch_minutes, 0), 0)::numeric / 60),
      0
    )
  )::numeric(5,2);

  update public.work_schedules
  set name = btrim(schedule_name),
      standard_daily_hours = computed_hours,
      is_active = active_rule,
      updated_at = now()
  where id = existing.id
  returning * into updated;

  for day_index in 0..6 loop
    insert into public.schedule_days (
      company_id,
      work_schedule_id,
      day_of_week,
      start_time,
      end_time,
      lunch_minutes,
      paid_hours,
      is_working_day
    )
    values (
      updated.company_id,
      updated.id,
      day_index,
      case when day_index = any(working_days) then work_start else null end,
      case when day_index = any(working_days) then work_end else null end,
      case when day_index = any(working_days) then greatest(coalesce(lunch_minutes, 0), 0) else 0 end,
      case when day_index = any(working_days) then computed_hours else 0 end,
      day_index = any(working_days)
    )
    on conflict (work_schedule_id, day_of_week)
    do update set
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      lunch_minutes = excluded.lunch_minutes,
      paid_hours = excluded.paid_hours,
      is_working_day = excluded.is_working_day,
      updated_at = now();
  end loop;

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
    updated.company_id,
    actor.id,
    'update',
    'work_schedules',
    updated.id,
    to_jsonb(existing),
    to_jsonb(updated),
    'Work rule edited'
  );

  return updated;
end;
$$;

grant execute on function public.update_company_work_schedule(uuid, text, time, time, integer, integer[], numeric, boolean) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.24-edit-work-rules',
  'Work rules can be edited',
  'Company admins can now update existing work rules without creating duplicates.',
  array[
    'Admins can edit work rule names, working days, start and end times, lunch minutes, and paid hours.',
    'Changing a work rule updates the existing schedule days used by time and leave calculations.',
    'Work rule edits are audited in the database.'
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
