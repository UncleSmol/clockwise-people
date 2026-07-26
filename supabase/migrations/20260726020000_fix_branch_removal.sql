-- Fix blocking dependency: drop policy that references employees.branch_id
drop policy if exists "role scoped users can view users" on public.users;

-- Recreate without branch_manager branch-scoping (branches are being removed)
create policy "role scoped users can view users"
on public.users for select
to authenticated
using (
  public.has_any_company_role(company_id, array['owner', 'hr_admin']::public.app_role[])
  or auth_user_id = auth.uid()
);

-- Drop and recreate can_access_employee without branch_manager branch-scoping
-- (preserves owner/hr_admin, self-access, and direct-reports logic)
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
    public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[])
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

-- Drop and recreate can_manage_time_record without branch_manager branch-scoping
-- (preserves owner/hr_admin and direct-reports logic)
create or replace function public.can_manage_time_record(
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
    public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[])
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

-- Drop policies on user_branch_assignments (no longer useful without branches)
drop policy if exists "role scoped branch assignments can view branch assignments" on public.user_branch_assignments;
drop policy if exists "owners and hr admins can manage branch assignments" on public.user_branch_assignments;

-- Drop user_branch_assignments table (serves no purpose without branches)
drop table if exists public.user_branch_assignments;

-- Safely handle employees table: add workstation_id if missing, drop branch_id,
-- migrate data from branch_id if needed, then set workstation_id NOT NULL
do $$
begin
  -- Add workstation_id if the old migration's ADD COLUMN was rolled back
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'workstation_id'
  ) then
    alter table public.employees add column workstation_id uuid references public.company_workstations(id) on delete set null;

    -- Migrate data from branch_id to workstation_id
    update public.employees e
      set workstation_id = cw.id
      from public.company_workstations cw
      where cw.branch_id = e.branch_id
        and e.workstation_id is null;
  end if;

  -- Drop branch_id now that the blocking policy is gone
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'branch_id'
  ) then
    alter table public.employees drop column branch_id;
  end if;

  -- Set workstation_id NOT NULL (safe since data was migrated or already present)
  alter table public.employees alter column workstation_id set not null;
end $$;

-- Drop departments.branch_id if the old migration's DROP COLUMN was rolled back
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'departments' and column_name = 'branch_id'
  ) then
    -- Need the FK reference to still work, so add workstation_id first if missing
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'departments' and column_name = 'workstation_id'
    ) then
      alter table public.departments add column workstation_id uuid references public.company_workstations(id) on delete set null;

      update public.departments d
        set workstation_id = cw.id
        from public.company_workstations cw
        where cw.branch_id = d.branch_id;
    end if;

    alter table public.departments drop column branch_id;
  end if;
end $$;

-- Drop branches table (CASCADE removes all remaining FK constraints referencing it)
drop table if exists public.branches cascade;
