create or replace function public.calculate_employee_leave_request_hours(
  target_employee_id uuid,
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  employee public.employees%rowtype;
  company_setting public.company_settings%rowtype;
  leave_type public.leave_types%rowtype;
  leave_balance public.leave_balances%rowtype;
  target_schedule_id uuid;
  total_hours numeric(8,2) := 0;
  available_hours numeric(8,2) := 0;
  working_days integer := 0;
  public_holiday_count integer := 0;
  non_working_days integer := 0;
  detail jsonb := '[]'::jsonb;
  current_day date;
  schedule_day public.schedule_days%rowtype;
  holiday public.company_public_holidays%rowtype;
  daily_hours numeric(8,2);
begin
  if request_end_date < request_start_date then
    raise exception 'End date must be after start date';
  end if;

  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if not found then
    raise exception 'Employee could not be found';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = employee.company_id
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Time off type could not be found';
  end if;

  select *
    into leave_balance
  from public.leave_balances
  where company_id = employee.company_id
    and employee_id = employee.id
    and leave_type_id = leave_type.id;

  available_hours := coalesce(leave_balance.balance_hours, 0);

  select *
    into company_setting
  from public.company_settings
  where company_id = employee.company_id;

  target_schedule_id := employee.work_schedule_id;

  if target_schedule_id is null then
    select ws.id
      into target_schedule_id
    from public.work_schedules ws
    where ws.company_id = employee.company_id
      and ws.scope = 'company'
      and ws.is_active
      and ws.deleted_at is null
    order by ws.created_at desc
    limit 1;
  end if;

  for current_day in
    select generate_series(request_start_date, request_end_date, interval '1 day')::date
  loop
    select *
      into holiday
    from public.company_public_holidays cph
    where cph.company_id = employee.company_id
      and cph.holiday_date = current_day
      and cph.deleted_at is null
    limit 1;

    if found then
      public_holiday_count := public_holiday_count + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'public_holiday',
        'label', holiday.name
      ));
      continue;
    end if;

    schedule_day := null;

    if target_schedule_id is not null then
      select *
        into schedule_day
      from public.schedule_days sd
      where sd.work_schedule_id = target_schedule_id
        and sd.day_of_week = extract(dow from current_day)::integer
      limit 1;

      if not found or not coalesce(schedule_day.is_working_day, false) then
        non_working_days := non_working_days + 1;
        detail := detail || jsonb_build_array(jsonb_build_object(
          'date', current_day,
          'hours', 0,
          'reason', 'non_working_day'
        ));
        continue;
      end if;
    end if;

    if target_schedule_id is null and extract(dow from current_day)::integer in (0, 6) then
      non_working_days := non_working_days + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'non_working_day'
      ));
      continue;
    end if;

    daily_hours := case
      when schedule_day.start_time is not null and schedule_day.end_time is not null then
        greatest(
          extract(epoch from (schedule_day.end_time - schedule_day.start_time)) / 3600
          - (greatest(coalesce(schedule_day.lunch_minutes, 0), 0)::numeric / 60),
          0
        )::numeric(8,2)
      else null
    end;

    daily_hours := coalesce(
      nullif(daily_hours, 0),
      nullif(schedule_day.paid_hours, 0),
      company_setting.standard_daily_hours,
      8
    );

    total_hours := total_hours + daily_hours;
    working_days := working_days + 1;
    detail := detail || jsonb_build_array(jsonb_build_object(
      'date', current_day,
      'hours', daily_hours,
      'reason', 'working_day'
    ));
  end loop;

  return jsonb_build_object(
    'available_hours', available_hours,
    'days', detail,
    'exceeds_balance', total_hours > available_hours,
    'leave_type_name', leave_type.name,
    'non_working_days', non_working_days,
    'public_holidays', public_holiday_count,
    'remaining_hours', available_hours - total_hours,
    'total_hours', total_hours,
    'working_days', working_days
  );
end;
$$;

create or replace function public.calculate_own_leave_request_hours(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
begin
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

  return public.calculate_employee_leave_request_hours(
    actor.employee_id,
    target_leave_type_id,
    request_start_date,
    request_end_date
  );
end;
$$;

create or replace function public.submit_own_leave_request(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date,
  request_total_hours numeric,
  request_reason text default null,
  request_attachment_url text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  leave_request public.leave_requests%rowtype;
  calculated jsonb;
  calculated_hours numeric(8,2);
  available_hours numeric(8,2);
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

  if request_end_date < request_start_date then
    raise exception 'End date must be after start date';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = actor.company_id
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Leave type could not be found';
  end if;

  if leave_type.requires_attachment
    and btrim(coalesce(request_attachment_url, '')) = '' then
    raise exception 'This leave type needs an attachment link';
  end if;

  if nullif(btrim(coalesce(request_attachment_url, '')), '') is not null
    and request_attachment_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Attachment must be a valid http or https link';
  end if;

  calculated := public.calculate_employee_leave_request_hours(
    actor.employee_id,
    leave_type.id,
    request_start_date,
    request_end_date
  );
  calculated_hours := (calculated->>'total_hours')::numeric(8,2);
  available_hours := (calculated->>'available_hours')::numeric(8,2);

  if calculated_hours <= 0 then
    raise exception 'The selected dates do not include working hours';
  end if;

  if calculated_hours > available_hours then
    raise exception 'You only have % hours available for % leave', available_hours, leave_type.name;
  end if;

  insert into public.leave_requests (
    company_id,
    employee_id,
    leave_type_id,
    start_date,
    end_date,
    total_hours,
    reason,
    attachment_url,
    status,
    submitted_at,
    submitted_by
  )
  values (
    actor.company_id,
    actor.employee_id,
    leave_type.id,
    request_start_date,
    request_end_date,
    calculated_hours,
    nullif(btrim(coalesce(request_reason, '')), ''),
    nullif(btrim(coalesce(request_attachment_url, '')), ''),
    'submitted',
    now(),
    actor.id
  )
  returning * into leave_request;

  insert into public.approval_requests (
    company_id,
    request_type,
    request_id,
    submitted_by,
    status,
    notes
  )
  values (
    leave_request.company_id,
    'leave_request',
    leave_request.id,
    actor.id,
    'submitted',
    concat_ws(E'\n', leave_request.reason, concat('Calculated leave hours: ', calculated_hours))
  );

  return leave_request;
end;
$$;

grant execute on function public.calculate_employee_leave_request_hours(uuid, uuid, date, date) to authenticated;
grant execute on function public.calculate_own_leave_request_hours(uuid, date, date) to authenticated;
grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.24-leave-balance-checks',
  'Time off requests check available balances',
  'The app now blocks time off requests that exceed available balances and shows public holidays in the calculation.',
  array[
    'Employees can only request time off from the balance they have available.',
    'Leave hour calculation now derives hours from working start and end times.',
    'Public holidays inside the selected dates are shown in the request calculation.',
    'Requests that exceed the employee balance show a clear warning and cannot be submitted.'
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
