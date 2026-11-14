-- Migration: 20261114125500_provision_super_admin_across_all_companies.sql
-- Description: Ensures that when a super user is assigned, an employee record and user profile are created across all active companies.
-- Also backfills employee records for all current super users across all companies.

-- 1. Update is_super_admin_grantor to recognize postgres/supabase_admin DB roles during migrations/admin scripts
create or replace function public.is_super_admin_grantor()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_email text;
begin
  if current_user in ('postgres', 'supabase_admin') or auth.role() = 'service_role' then
    return true;
  end if;

  caller_email := coalesce(
    auth.jwt() ->> 'email',
    (
      select u.email
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.deleted_at is null
      limit 1
    )
  );

  return lower(coalesce(caller_email, '')) in ('doctor@formalize.co.za', 'admin@formalize.co.za');
end;
$$;

grant execute on function public.is_super_admin_grantor() to authenticated, service_role;

-- 2. Create provision_super_admin_across_companies
create or replace function public.provision_super_admin_across_companies(
  target_auth_user_id uuid,
  target_email text default null,
  target_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_company record;
  v_workstation_id uuid;
  v_schedule_id uuid;
  v_role_id uuid;
  v_app_user_id uuid;
  v_emp_id uuid;
  v_emp_num text;
  v_count integer := 0;
begin
  -- Resolve email and full name
  if target_email is not null and btrim(target_email) <> '' then
    v_email := lower(btrim(target_email));
  else
    select lower(btrim(email)) into v_email from auth.users where id = target_auth_user_id;
  end if;

  if target_name is not null and btrim(target_name) <> '' then
    v_name := btrim(target_name);
  else
    select coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(v_email, '@', 1))
      into v_name
    from auth.users
    where id = target_auth_user_id;
  end if;

  if v_name is null or v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  for v_company in select id, name from public.companies where deleted_at is null loop
    -- 1. Ensure public.users row exists
    insert into public.users (
      company_id,
      auth_user_id,
      full_name,
      email,
      is_super_admin,
      status
    )
    values (
      v_company.id,
      target_auth_user_id,
      v_name,
      v_email,
      true,
      'active'
    )
    on conflict (company_id, auth_user_id)
    do update set
      is_super_admin = true,
      status = 'active',
      full_name = coalesce(users.full_name, excluded.full_name),
      email = coalesce(users.email, excluded.email),
      updated_at = now()
    returning id into v_app_user_id;

    -- 2. Pick a workstation for this company
    select id into v_workstation_id
    from public.company_workstations
    where company_id = v_company.id
      and deleted_at is null
    order by created_at asc
    limit 1;

    if v_workstation_id is null then
      insert into public.company_workstations (company_id, name, latitude, longitude, radius_meters, is_active)
      values (v_company.id, 'Headquarters', -25.7479, 28.2293, 200, true)
      returning id into v_workstation_id;
    end if;

    -- Pick a work schedule if available
    select id into v_schedule_id
    from public.work_schedules
    where company_id = v_company.id
    order by created_at asc
    limit 1;

    -- 3. Check if employees row exists for this email or user in this company
    select id into v_emp_id
    from public.employees
    where company_id = v_company.id
      and (lower(email) = v_email or user_id = v_app_user_id)
      and deleted_at is null
    limit 1;

    if v_emp_id is null then
      v_emp_num := 'SA-' || upper(substr(md5(v_company.id::text || v_email), 1, 6));
      insert into public.employees (
        company_id,
        user_id,
        employee_number,
        full_name,
        email,
        workstation_id,
        work_schedule_id,
        start_date,
        employment_type,
        employment_status,
        compensation_type
      )
      values (
        v_company.id,
        v_app_user_id,
        v_emp_num,
        v_name,
        v_email,
        v_workstation_id,
        v_schedule_id,
        '2026-01-01'::date,
        'full_time',
        'active',
        'monthly'
      )
      returning id into v_emp_id;
    else
      update public.employees
      set user_id = v_app_user_id,
          workstation_id = coalesce(employees.workstation_id, v_workstation_id),
          work_schedule_id = coalesce(employees.work_schedule_id, v_schedule_id),
          employment_status = 'active',
          updated_at = now()
      where id = v_emp_id;
    end if;

    -- Update user's employee_id
    update public.users
    set employee_id = v_emp_id
    where id = v_app_user_id;

    -- 4. Workstation assignment
    if not exists (
      select 1 from public.employee_workstation_assignments
      where company_id = v_company.id and employee_id = v_emp_id and deleted_at is null
    ) then
      insert into public.employee_workstation_assignments (company_id, employee_id, workstation_id, is_active, effective_from)
      values (v_company.id, v_emp_id, v_workstation_id, true, '2026-01-01'::date);
    end if;

    -- 5. Role assignment (owner or hr_admin)
    select id into v_role_id
    from public.roles
    where company_id = v_company.id
      and key in ('owner', 'hr_admin')
    order by case key when 'owner' then 1 else 2 end
    limit 1;

    if v_role_id is not null then
      insert into public.user_roles (company_id, user_id, role_id)
      values (v_company.id, v_app_user_id, v_role_id)
      on conflict do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'companies_provisioned', v_count
  );
end;
$$;

grant execute on function public.provision_super_admin_across_companies(uuid, text, text) to authenticated, service_role;

-- Update set_user_super_admin_by_email to trigger provision_super_admin_across_companies
create or replace function public.set_user_super_admin_by_email(
  target_email text,
  grant_super_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(target_email));
  affected_count integer := 0;
  v_auth_id uuid;
begin
  if not public.is_super_admin_grantor() then
    raise exception 'Unauthorized: Only Doctor and Sizwe from Formalize can grant or revoke Super Admin privileges.';
  end if;

  if normalized_email = 'doctor@formalize.co.za' and grant_super_admin = false then
    raise exception 'Cannot revoke Super Admin privileges from Doctor Khoza.';
  end if;

  update public.users
  set is_super_admin = grant_super_admin,
      updated_at = now()
  where lower(email) = normalized_email;

  get diagnostics affected_count = row_count;

  if grant_super_admin then
    select id into v_auth_id
    from auth.users
    where lower(email) = normalized_email
    limit 1;

    if v_auth_id is not null then
      perform public.provision_super_admin_across_companies(v_auth_id, normalized_email);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', normalized_email,
    'is_super_admin', grant_super_admin,
    'updated_records', affected_count
  );
end;
$$;

-- Backfill all existing super admins across all companies
do $$
declare
  r record;
begin
  for r in
    select distinct au.id as auth_user_id, lower(au.email) as email,
      coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)) as name
    from auth.users au
    where lower(au.email) in ('doctor@formalize.co.za', 'admin@formalize.co.za', 'whitneyn.nkosi@gmail.com')
       or exists (
         select 1 from public.users pu where pu.auth_user_id = au.id and pu.is_super_admin = true
       )
  loop
    perform public.provision_super_admin_across_companies(r.auth_user_id, r.email, r.name);
  end loop;
end;
$$;
