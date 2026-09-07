-- SysAdmin Multi-Company Provisioning & Airtight Tenant Isolation Migration

-- 1. Helper function: is_super_admin()
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select true
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.is_super_admin = true
        and u.status = 'active'
        and u.deleted_at is null
      limit 1
    ),
    false
  );
$$;

grant execute on function public.is_super_admin() to authenticated, service_role;

-- 2. Tenant isolation: current_user_company_ids()
-- Super admins can view all active companies; standard employees remain strictly confined to their own company
create or replace function public.current_user_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.companies c
  where public.is_super_admin() = true
    and c.is_active = true
    and c.deleted_at is null
  union
  select u.company_id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
    and u.deleted_at is null;
$$;

grant execute on function public.current_user_company_ids() to authenticated, service_role;

-- 3. Tenant membership check: is_company_member(target_company_id)
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and u.deleted_at is null
      and (
        u.is_super_admin = true
        or u.company_id = target_company_id
      )
  );
$$;

grant execute on function public.is_company_member(uuid) to authenticated, service_role;

-- 4. Role checking functions: has_company_role & has_any_company_role
create or replace function public.has_company_role(target_company_id uuid, target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    left join public.user_roles ur
      on ur.user_id = u.id
      and ur.company_id = u.company_id
      and ur.revoked_at is null
    left join public.roles r
      on r.id = ur.role_id
      and r.company_id = u.company_id
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and u.deleted_at is null
      and (
        u.is_super_admin = true
        or (u.company_id = target_company_id and r.key = target_role)
      )
  );
$$;

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
    left join public.user_roles ur
      on ur.user_id = u.id
      and ur.company_id = u.company_id
      and ur.revoked_at is null
    left join public.roles r
      on r.id = ur.role_id
      and r.company_id = u.company_id
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and u.deleted_at is null
      and (
        u.is_super_admin = true
        or (u.company_id = target_company_id and r.key = any(target_roles))
      )
  );
$$;

grant execute on function public.has_company_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.has_any_company_role(uuid, public.app_role[]) to authenticated, service_role;

-- 5. Current app user fallback: current_app_user_id(target_company_id)
create or replace function public.current_app_user_id(target_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.id
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.company_id = target_company_id
        and u.status = 'active'
        and u.deleted_at is null
      limit 1
    ),
    (
      select u.id
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.is_super_admin = true
        and u.status = 'active'
        and u.deleted_at is null
      order by u.created_at asc
      limit 1
    )
  );
$$;

grant execute on function public.current_app_user_id(uuid) to authenticated, service_role;

-- 6. Resolve Supabase Advisory: Enable RLS on company_employee_number_counters
alter table public.company_employee_number_counters enable row level security;

drop policy if exists "company members can view employee number counters" on public.company_employee_number_counters;
create policy "company members can view employee number counters"
on public.company_employee_number_counters
for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "super admins and owners can manage employee number counters" on public.company_employee_number_counters;
create policy "super admins and owners can manage employee number counters"
on public.company_employee_number_counters
for all
to authenticated
using (
  public.is_super_admin()
  or public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
)
with check (
  public.is_super_admin()
  or public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
);

-- 7. Update provision_employee_account to support Super Admin execution across companies
create or replace function public.provision_employee_account(
  target_employee_id uuid,
  target_auth_user_id uuid,
  provisioned_by_auth_user_id uuid,
  target_role_key public.app_role default 'employee'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_employee public.employees%rowtype;
  app_user_id uuid;
  target_role_id uuid;
  provisioner_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can provision employee accounts';
  end if;

  select *
    into target_employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Employee record could not be found';
  end if;

  if target_employee.email is null or btrim(target_employee.email) = '' then
    raise exception 'Employee must have an email address before account creation';
  end if;

  if target_employee.user_id is not null then
    raise exception 'Employee already has account access';
  end if;

  -- Locate provisioner user record (either admin of this company or super admin)
  select u.id
    into provisioner_user_id
  from public.users u
  left join public.user_roles ur on ur.user_id = u.id and ur.company_id = u.company_id
  left join public.roles r on r.id = ur.role_id and r.company_id = u.company_id
  where u.auth_user_id = provisioned_by_auth_user_id
    and u.deleted_at is null
    and u.status = 'active'
    and (
      (u.company_id = target_employee.company_id and r.key in ('owner', 'hr_admin'))
      or u.is_super_admin = true
    )
  order by (u.company_id = target_employee.company_id) desc, u.created_at asc
  limit 1;

  if provisioner_user_id is null then
    raise exception 'You do not have permission to create employee accounts';
  end if;

  select id
    into target_role_id
  from public.roles
  where company_id = target_employee.company_id
    and key = target_role_key;

  if target_role_id is null then
    raise exception 'Target role does not exist for company';
  end if;

  insert into public.users (
    company_id,
    auth_user_id,
    full_name,
    email,
    employee_id,
    status
  )
  values (
    target_employee.company_id,
    target_auth_user_id,
    target_employee.full_name,
    target_employee.email,
    target_employee.id,
    'active'
  )
  on conflict (company_id, auth_user_id)
  do update set
    full_name = excluded.full_name,
    email = excluded.email,
    employee_id = excluded.employee_id,
    status = 'active',
    deleted_at = null,
    updated_at = now()
  returning id into app_user_id;

  insert into public.user_roles (
    company_id,
    user_id,
    role_id,
    assigned_by
  )
  values (
    target_employee.company_id,
    app_user_id,
    target_role_id,
    provisioner_user_id
  )
  on conflict do nothing;

  update public.employees
  set user_id = app_user_id,
      updated_at = now()
  where id = target_employee.id
    and company_id = target_employee.company_id;

  update public.user_invitations
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where company_id = target_employee.company_id
    and employee_id = target_employee.id
    and status = 'pending';

  return app_user_id;
end;
$$;

revoke all on function public.provision_employee_account(uuid, uuid, uuid, public.app_role)
from public, anon, authenticated;

grant execute on function public.provision_employee_account(uuid, uuid, uuid, public.app_role)
to service_role;

-- 8. SysAdmin RPC: create_company_by_sysadmin
create or replace function public.create_company_by_sysadmin(
  company_name text,
  company_country text default 'South Africa',
  company_timezone text default 'Africa/Johannesburg',
  company_payroll_cycle text default 'monthly',
  company_registration_number text default null,
  company_trading_name text default null,
  company_industry text default null,
  company_contact_email text default null,
  company_contact_phone text default null,
  workstation_name text default 'Headquarters',
  workstation_address text default null,
  workstation_lat numeric default -26.2041000,
  workstation_lng numeric default 28.0473000,
  workstation_radius integer default 150,
  work_schedule_name text default 'Standard 40h',
  creator_auth_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_creator_auth_id uuid;
  new_company_id uuid;
  new_workstation_id uuid;
  new_schedule_id uuid;
  creator_user_id uuid;
  owner_role_id uuid;
  creator_name text := 'SysAdmin';
  creator_email text := '';
begin
  target_creator_auth_id := coalesce(creator_auth_id, auth.uid());

  -- Caller must be super admin or service role
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Only System Administrators can create companies via this procedure.';
  end if;

  if btrim(company_name) = '' then
    raise exception 'Company name is required.';
  end if;

  -- Find creator details
  if target_creator_auth_id is not null then
    select full_name, email
      into creator_name, creator_email
    from public.users
    where auth_user_id = target_creator_auth_id
    order by is_super_admin desc, created_at asc
    limit 1;
  end if;

  -- 1. Create Company
  -- (Trigger companies_seed_defaults creates default roles + company_settings)
  insert into public.companies (
    name,
    country,
    timezone,
    payroll_cycle,
    registration_number,
    trading_name,
    industry,
    contact_email,
    contact_phone
  )
  values (
    btrim(company_name),
    coalesce(nullif(btrim(company_country), ''), 'South Africa'),
    coalesce(nullif(btrim(company_timezone), ''), 'Africa/Johannesburg'),
    coalesce(nullif(btrim(company_payroll_cycle), ''), 'monthly'),
    nullif(btrim(company_registration_number), ''),
    nullif(btrim(company_trading_name), ''),
    nullif(btrim(company_industry), ''),
    nullif(btrim(company_contact_email), ''),
    nullif(btrim(company_contact_phone), '')
  )
  returning id into new_company_id;

  -- 2. Create Default Workstation
  insert into public.company_workstations (
    company_id,
    name,
    address,
    latitude,
    longitude,
    radius_meters,
    is_active
  )
  values (
    new_company_id,
    coalesce(nullif(btrim(workstation_name), ''), 'Headquarters'),
    nullif(btrim(workstation_address), ''),
    coalesce(workstation_lat, -26.2041000),
    coalesce(workstation_lng, 28.0473000),
    coalesce(workstation_radius, 150),
    true
  )
  returning id into new_workstation_id;

  -- 3. Create Default Work Schedule
  insert into public.work_schedules (
    company_id,
    name,
    scope,
    standard_monthly_hours,
    standard_daily_hours,
    is_active
  )
  values (
    new_company_id,
    coalesce(nullif(btrim(work_schedule_name), ''), 'Standard 40h'),
    'company',
    173.33,
    8.00,
    true
  )
  returning id into new_schedule_id;

  -- 4. Create Schedule Days (Monday - Friday 08:00 - 17:00, 60m lunch, 8h paid)
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
  values
    (new_company_id, new_schedule_id, 1, '08:00', '17:00', 60, 8.00, true), -- Mon
    (new_company_id, new_schedule_id, 2, '08:00', '17:00', 60, 8.00, true), -- Tue
    (new_company_id, new_schedule_id, 3, '08:00', '17:00', 60, 8.00, true), -- Wed
    (new_company_id, new_schedule_id, 4, '08:00', '17:00', 60, 8.00, true), -- Thu
    (new_company_id, new_schedule_id, 5, '08:00', '17:00', 60, 8.00, true), -- Fri
    (new_company_id, new_schedule_id, 6, null, null, 0, 0.00, false),        -- Sat
    (new_company_id, new_schedule_id, 0, null, null, 0, 0.00, false);        -- Sun

  -- 5. Seed employee number counter
  insert into public.company_employee_number_counters (
    company_id,
    next_number
  )
  values (
    new_company_id,
    1
  )
  on conflict (company_id) do nothing;

  -- 6. Link SysAdmin user to the new company
  if target_creator_auth_id is not null then
    insert into public.users (
      company_id,
      auth_user_id,
      full_name,
      email,
      is_super_admin,
      status
    )
    values (
      new_company_id,
      target_creator_auth_id,
      coalesce(creator_name, 'Doctor Khoza'),
      coalesce(creator_email, 'doctor@formalize.co.za'),
      true,
      'active'
    )
    on conflict (company_id, auth_user_id)
    do update set
      is_super_admin = true,
      status = 'active',
      deleted_at = null
    returning id into creator_user_id;

    select id into owner_role_id
    from public.roles
    where company_id = new_company_id
      and key = 'owner';

    if owner_role_id is not null then
      insert into public.user_roles (
        company_id,
        user_id,
        role_id,
        assigned_by
      )
      values (
        new_company_id,
        creator_user_id,
        owner_role_id,
        creator_user_id
      )
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'company_id', new_company_id,
    'workstation_id', new_workstation_id,
    'schedule_id', new_schedule_id
  );
end;
$$;

grant execute on function public.create_company_by_sysadmin(
  text, text, text, text, text, text, text, text, text,
  text, text, numeric, numeric, integer, text, uuid
) to authenticated, service_role;
