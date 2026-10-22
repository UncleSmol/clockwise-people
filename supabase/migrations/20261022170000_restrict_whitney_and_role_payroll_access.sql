-- 20261022170000_restrict_whitney_and_role_payroll_access.sql
-- Restrict Super Admin Whitney Nkosi (whitneyn.nkosi@gmail.com) from viewing employee records, sensitive personal data, and payslips
-- Allow Whitney to continue switching companies and assisting with time management administration across all branches
-- Expand employee record visibility and payslip generator access to Payroll Viewer, HR Admin, Manager, Company Owner, and Unrestricted Super Admins

-- 1. Helper function to check if caller is an unrestricted Super Admin (Doctor Khoza or Sizwe Hlatshwayo)
create or replace function public.is_unrestricted_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_email text;
begin
  if auth.role() = 'service_role' then
    return true;
  end if;

  if not public.is_super_admin() then
    return false;
  end if;

  caller_email := lower(coalesce(
    auth.jwt() ->> 'email',
    (
      select u.email
      from public.users u
      where u.auth_user_id = auth.uid()
        and u.deleted_at is null
      limit 1
    ),
    ''
  ));

  -- Whitney is a restricted Super Admin: permitted for time tracking and company switching,
  -- but strictly prohibited from accessing employee records, personal data, and payslips.
  if caller_email = 'whitneyn.nkosi@gmail.com' or caller_email like 'whitney%' then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.is_unrestricted_super_admin() to authenticated, service_role;

-- 2. Update company_payslips RLS policy
-- Grant access to Unrestricted Super Admins AND tenant roles (owner, hr_admin, payroll_viewer)
drop policy if exists "super_admin_manage_payslips" on public.company_payslips;
drop policy if exists "authorized_payroll_manage_payslips" on public.company_payslips;

create policy "authorized_payroll_manage_payslips"
  on public.company_payslips
  for all
  using (
    public.is_unrestricted_super_admin()
    or public.has_any_company_role(company_id, array['owner', 'hr_admin', 'payroll_viewer']::public.app_role[])
  )
  with check (
    public.is_unrestricted_super_admin()
    or public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
  );

-- 3. Update public.can_access_employee function to include payroll_viewer
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
    or public.has_any_company_role(target_company_id, array['owner', 'hr_admin', 'branch_manager', 'payroll_viewer']::public.app_role[])
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

-- 4. Update employee table select policy to enforce Whitney restriction on employee personal records
drop policy if exists "role scoped employees can view employees" on public.employees;

create policy "role scoped employees can view employees"
on public.employees for select
to authenticated
using (
  deleted_at is null
  and (
    -- Unrestricted Super Admins (Doctor, Sizwe)
    public.is_unrestricted_super_admin()
    -- Tenant roles: Owner, HR Admin, Branch Manager, Payroll Viewer
    or public.has_any_company_role(company_id, array['owner', 'hr_admin', 'branch_manager', 'payroll_viewer']::public.app_role[])
    -- Self record access
    or public.current_employee_id(company_id) = id
    -- Direct manager access
    or exists (
      select 1
      from public.users manager_user
      where manager_user.auth_user_id = auth.uid()
        and manager_user.company_id = company_id
        and manager_user.status = 'active'
        and manager_user.deleted_at is null
        and manager_user.employee_id is not null
        and manager_user.employee_id = manager_employee_id
    )
  )
);
