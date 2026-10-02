-- Migration: Assign Employee Roles & Manager Permissions
-- Grants Managers (branch_manager) alongside Super Admin, Owner, and HR Admin
-- the capability to view, manage, and assign roles to company employees,
-- while explicitly preventing standard employees and payroll viewers from doing so.

-- 1. Update RLS policy on public.user_roles for SELECT
drop policy if exists "role scoped user roles can view user roles" on public.user_roles;
create policy "role scoped user roles can view user roles"
on public.user_roles for select
to authenticated
using (
  public.is_super_admin()
  or public.has_any_company_role(company_id, array['owner', 'hr_admin', 'branch_manager']::public.app_role[])
  or user_id = public.current_app_user_id(company_id)
);

-- 2. Update RLS policy on public.user_roles for ALL (insert, update, delete)
drop policy if exists "owners and hr admins can manage user roles" on public.user_roles;
drop policy if exists "admins managers and hr can manage user roles" on public.user_roles;
create policy "admins managers and hr can manage user roles"
on public.user_roles for all
to authenticated
using (
  public.is_super_admin()
  or public.has_any_company_role(company_id, array['owner', 'hr_admin', 'branch_manager']::public.app_role[])
)
with check (
  public.is_super_admin()
  or public.has_any_company_role(company_id, array['owner', 'hr_admin', 'branch_manager']::public.app_role[])
);

-- 3. Update public.can_access_employee to include branch_manager in company employee visibility
create or replace function public.can_access_employee(
  target_company_id uuid,
  target_employee_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or public.has_any_company_role(target_company_id, array['owner', 'hr_admin', 'branch_manager']::public.app_role[])
    or public.current_employee_id(target_company_id) = target_employee_id
    or exists (
      select 1
      from public.users manager_user
      join public.employees managed_employee
        on managed_employee.manager_employee_id = manager_user.employee_id
        and managed_employee.company_id = manager_user.company_id
        and managed_employee.deleted_at is null
      where manager_user.auth_user_id = auth.uid()
        and manager_user.company_id = target_company_id
        and manager_user.status = 'active'
        and manager_user.deleted_at is null
        and manager_user.employee_id is not null
        and managed_employee.id = target_employee_id
    );
$$;

grant execute on function public.can_access_employee(uuid, uuid) to authenticated, service_role;

-- 4. Update provision_employee_account to support branch_manager provisioning
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

  -- Locate provisioner user record (admin/owner, hr_admin, branch_manager, or super admin)
  select u.id
    into provisioner_user_id
  from public.users u
  left join public.user_roles ur on ur.user_id = u.id and ur.company_id = u.company_id
  left join public.roles r on r.id = ur.role_id and r.company_id = u.company_id
  where u.auth_user_id = provisioned_by_auth_user_id
    and u.deleted_at is null
    and u.status = 'active'
    and (
      (u.company_id = target_employee.company_id and r.key in ('owner', 'hr_admin', 'branch_manager'))
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

grant execute on function public.provision_employee_account(uuid, uuid, uuid, public.app_role) to service_role;

-- 5. Stored Procedure: assign_employee_role
create or replace function public.assign_employee_role(
  target_employee_id uuid,
  target_role_key public.app_role,
  assigned_by_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_emp public.employees%rowtype;
  assigner_user public.users%rowtype;
  target_role_rec public.roles%rowtype;
  is_assigner_super_admin boolean := false;
  has_assigner_role boolean := false;
begin
  select *
    into target_emp
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Employee record not found');
  end if;

  -- Verify assigner user
  select *
    into assigner_user
  from public.users
  where auth_user_id = assigned_by_auth_user_id
    and deleted_at is null
    and status = 'active'
  order by (company_id = target_emp.company_id) desc, created_at asc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Assigner user record not found');
  end if;

  is_assigner_super_admin := coalesce(assigner_user.is_super_admin, false);

  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = assigner_user.id
      and ur.company_id = target_emp.company_id
      and ur.revoked_at is null
      and r.key in ('owner', 'hr_admin', 'branch_manager')
  ) into has_assigner_role;

  if not is_assigner_super_admin and not has_assigner_role then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized: Only superadmins, managers, and HR can assign roles');
  end if;

  -- Only superadmin or owner can assign owner role
  if target_role_key = 'owner' then
    if not is_assigner_super_admin and not exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = assigner_user.id
        and ur.company_id = target_emp.company_id
        and ur.revoked_at is null
        and r.key = 'owner'
    ) then
      return jsonb_build_object('ok', false, 'error', 'Only owners or superadmins can grant the owner role');
    end if;
  end if;

  -- Find role in target company
  select *
    into target_role_rec
  from public.roles
  where company_id = target_emp.company_id
    and key = target_role_key;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Target role is not configured for company');
  end if;

  if target_emp.user_id is not null then
    -- Revoke existing active roles
    update public.user_roles
    set revoked_at = now()
    where company_id = target_emp.company_id
      and user_id = target_emp.user_id
      and revoked_at is null;

    -- Insert new role
    insert into public.user_roles (
      company_id,
      user_id,
      role_id,
      assigned_by,
      assigned_at
    )
    values (
      target_emp.company_id,
      target_emp.user_id,
      target_role_rec.id,
      assigner_user.id,
      now()
    );
  end if;

  -- Update pending invitations if any
  update public.user_invitations
  set role_key = target_role_key,
      updated_at = now()
  where company_id = target_emp.company_id
    and employee_id = target_emp.id
    and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'message', format('Successfully assigned role "%s" to %s', target_role_rec.name, target_emp.full_name)
  );
end;
$$;

grant execute on function public.assign_employee_role(uuid, public.app_role, uuid) to authenticated, service_role;
