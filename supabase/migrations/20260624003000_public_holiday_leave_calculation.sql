create table public.company_public_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  is_paid boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint company_public_holidays_name_not_blank check (btrim(name) <> ''),
  constraint company_public_holidays_unique unique (company_id, holiday_date)
);

alter table public.company_public_holidays enable row level security;

create trigger company_public_holidays_set_updated_at
before update on public.company_public_holidays
for each row execute function public.set_updated_at();

create index idx_company_public_holidays_company_date
on public.company_public_holidays(company_id, holiday_date);

grant select, insert, update, delete on public.company_public_holidays to authenticated;

create policy "company members can view public holidays"
on public.company_public_holidays for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage public holidays"
on public.company_public_holidays for all
to authenticated
using (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]))
with check (public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[]));

create or replace function public.create_company_public_holiday(
  target_company_id uuid,
  holiday_name text,
  target_holiday_date date,
  paid_holiday boolean default true
)
returns public.company_public_holidays
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  holiday public.company_public_holidays%rowtype;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  if not public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can manage public holidays';
  end if;

  if btrim(coalesce(holiday_name, '')) = '' then
    raise exception 'Holiday name is required';
  end if;

  insert into public.company_public_holidays (
    company_id,
    holiday_date,
    name,
    is_paid
  )
  values (
    target_company_id,
    target_holiday_date,
    btrim(holiday_name),
    paid_holiday
  )
  on conflict (company_id, holiday_date)
  do update set
    name = excluded.name,
    is_paid = excluded.is_paid,
    deleted_at = null,
    updated_at = now()
  returning * into holiday;

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
    target_company_id,
    actor_id,
    'update',
    'company_public_holidays',
    holiday.id,
    to_jsonb(holiday),
    'Company public holiday saved'
  );

  return holiday;
end;
$$;

create or replace function public.calculate_employee_leave_request_hours(
  target_employee_id uuid,
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
  target_schedule_id uuid;
  total_hours numeric(8,2) := 0;
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

    daily_hours := coalesce(
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
    'total_hours', total_hours,
    'working_days', working_days,
    'public_holidays', public_holiday_count,
    'non_working_days', non_working_days,
    'days', detail
  );
end;
$$;

create or replace function public.calculate_own_leave_request_hours(
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
    request_start_date,
    request_end_date
  );
  calculated_hours := (calculated->>'total_hours')::numeric(8,2);

  if calculated_hours <= 0 then
    raise exception 'The selected dates do not include working hours';
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

grant execute on function public.create_company_public_holiday(uuid, text, date, boolean) to authenticated;
grant execute on function public.calculate_employee_leave_request_hours(uuid, date, date) to authenticated;
grant execute on function public.calculate_own_leave_request_hours(date, date) to authenticated;
grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.24-leave-hour-calculation',
  'Time off hours now calculate automatically',
  'Leave requests now calculate hours from work rules and skip company public holidays.',
  array[
    'Employees no longer type requested leave hours manually.',
    'The server calculates leave hours from the employee work schedule.',
    'Public holidays and non-working days are excluded from leave hour totals.',
    'Company admins can add public holidays from Company setup.'
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
