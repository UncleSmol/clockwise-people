drop policy if exists "authenticated users can create companies" on public.companies;

create or replace function public.seed_company_default_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roles (company_id, name, key, description, is_system)
  values
    (new.id, 'Company Owner / Super Admin', 'owner', 'Tenant-level control over setup, users, rules, reports, and billing.', true),
    (new.id, 'HR Admin', 'hr_admin', 'Operational control over employees, leave, timesheets, TOIL, overtime, and reports.', true),
    (new.id, 'Branch Manager', 'branch_manager', 'Branch-scoped approval and reporting.', true),
    (new.id, 'Payroll Viewer', 'payroll_viewer', 'Read-only access to locked payroll-ready reports.', true),
    (new.id, 'Employee', 'employee', 'Self-service time, leave, balances, and approvals.', true);

  insert into public.company_settings (company_id)
  values (new.id);

  return new;
end;
$$;

create or replace function public.provision_company_owner(
  company_name text,
  owner_auth_user_id uuid,
  owner_full_name text,
  owner_email text,
  company_registration_number text default null,
  company_country text default 'South Africa',
  company_timezone text default 'Africa/Johannesburg',
  company_payroll_cycle text default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  owner_user_id uuid;
  owner_role_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can provision company owners';
  end if;

  if btrim(company_name) = '' then
    raise exception 'Company name is required';
  end if;

  if owner_auth_user_id is null then
    raise exception 'Owner auth user id is required';
  end if;

  if btrim(owner_full_name) = '' then
    raise exception 'Owner full name is required';
  end if;

  if btrim(owner_email) = '' then
    raise exception 'Owner email is required';
  end if;

  insert into public.companies (
    name,
    registration_number,
    country,
    timezone,
    payroll_cycle
  )
  values (
    btrim(company_name),
    nullif(btrim(company_registration_number), ''),
    btrim(company_country),
    btrim(company_timezone),
    btrim(company_payroll_cycle)
  )
  returning id into new_company_id;

  insert into public.users (
    company_id,
    auth_user_id,
    full_name,
    email
  )
  values (
    new_company_id,
    owner_auth_user_id,
    btrim(owner_full_name),
    btrim(owner_email)
  )
  returning id into owner_user_id;

  select id
    into owner_role_id
  from public.roles
  where company_id = new_company_id
    and key = 'owner';

  insert into public.user_roles (
    company_id,
    user_id,
    role_id,
    assigned_by
  )
  values (
    new_company_id,
    owner_user_id,
    owner_role_id,
    owner_user_id
  );

  return new_company_id;
end;
$$;

revoke all on function public.provision_company_owner(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.provision_company_owner(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;
