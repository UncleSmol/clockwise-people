alter table public.companies
  add column if not exists trading_name text,
  add column if not exists tax_number text,
  add column if not exists vat_number text,
  add column if not exists industry text,
  add column if not exists website_url text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text;

alter table public.companies
  drop constraint if exists companies_website_url_valid,
  drop constraint if exists companies_contact_email_valid;

alter table public.companies
  add constraint companies_website_url_valid
    check (website_url is null or website_url ~* '^https?://[^[:space:]]+$'),
  add constraint companies_contact_email_valid
    check (contact_email is null or contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

create or replace function public.update_company_profile(
  target_company_id uuid,
  company_name text,
  company_registration_number text default null,
  company_trading_name text default null,
  company_tax_number text default null,
  company_vat_number text default null,
  company_industry text default null,
  company_website_url text default null,
  company_contact_email text default null,
  company_contact_phone text default null,
  company_address_line_1 text default null,
  company_address_line_2 text default null,
  company_city text default null,
  company_province text default null,
  company_postal_code text default null,
  company_country text default null,
  company_timezone text default null,
  company_payroll_cycle text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  existing public.companies%rowtype;
  updated public.companies%rowtype;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  if not public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can update company profile details';
  end if;

  select *
    into existing
  from public.companies
  where id = target_company_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Company could not be found';
  end if;

  if btrim(coalesce(company_name, '')) = '' then
    raise exception 'Company name is required';
  end if;

  if nullif(btrim(coalesce(company_website_url, '')), '') is not null
    and company_website_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Website must be a valid http or https link';
  end if;

  if nullif(btrim(coalesce(company_contact_email, '')), '') is not null
    and company_contact_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Contact email is not valid';
  end if;

  update public.companies
  set name = btrim(company_name),
      registration_number = nullif(btrim(coalesce(company_registration_number, '')), ''),
      trading_name = nullif(btrim(coalesce(company_trading_name, '')), ''),
      tax_number = nullif(btrim(coalesce(company_tax_number, '')), ''),
      vat_number = nullif(btrim(coalesce(company_vat_number, '')), ''),
      industry = nullif(btrim(coalesce(company_industry, '')), ''),
      website_url = nullif(btrim(coalesce(company_website_url, '')), ''),
      contact_email = nullif(btrim(coalesce(company_contact_email, '')), ''),
      contact_phone = nullif(btrim(coalesce(company_contact_phone, '')), ''),
      address_line_1 = nullif(btrim(coalesce(company_address_line_1, '')), ''),
      address_line_2 = nullif(btrim(coalesce(company_address_line_2, '')), ''),
      city = nullif(btrim(coalesce(company_city, '')), ''),
      province = nullif(btrim(coalesce(company_province, '')), ''),
      postal_code = nullif(btrim(coalesce(company_postal_code, '')), ''),
      country = coalesce(nullif(btrim(coalesce(company_country, '')), ''), country),
      timezone = coalesce(nullif(btrim(coalesce(company_timezone, '')), ''), timezone),
      payroll_cycle = coalesce(nullif(btrim(coalesce(company_payroll_cycle, '')), ''), payroll_cycle),
      updated_at = now()
  where id = target_company_id
  returning * into updated;

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
    target_company_id,
    actor_id,
    'update',
    'companies',
    updated.id,
    to_jsonb(existing),
    to_jsonb(updated),
    'Company profile details updated from account'
  );

  return updated;
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
end;
$$;

update public.time_entries
set updated_at = now()
where deleted_at is null
  and paid_hours > 0
  and overtime_hours > paid_hours * 0.5;

do $$
declare
  item record;
begin
  for item in
    select id
    from public.time_entries
    where deleted_at is null
      and paid_hours > 0
      and overtime_hours > paid_hours * 0.5
  loop
    perform public.refresh_time_entry_calculations(item.id);
  end loop;
end;
$$;

grant execute on function public.update_company_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-company-profile-overtime',
  'Company profile and overtime fixes',
  'Company admins can maintain company profile details from Account, and overtime calculation now guards against invalid work-rule hours.',
  array[
    'Company admins can update registration, tax, contact, website, and address details from Account.',
    'Company profile updates are audited in Supabase.',
    'Overtime calculation now falls back to standard daily hours when a work rule has an invalid low paid-hours value.',
    'Existing suspicious overtime rows are recalculated during migration.'
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
