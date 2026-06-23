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
    or (
      public.has_company_role(target_company_id, 'branch_manager')
      and exists (
        select 1
        from public.user_branch_assignments uba
        join public.employees e
          on e.branch_id = uba.branch_id
          and e.company_id = uba.company_id
        where uba.company_id = target_company_id
          and uba.user_id = public.current_app_user_id(target_company_id)
          and uba.revoked_at is null
          and e.id = target_employee_id
          and e.deleted_at is null
      )
    )
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
