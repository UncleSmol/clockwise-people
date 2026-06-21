create or replace function public.provision_employee_account(
  target_employee_id uuid,
  target_auth_user_id uuid,
  provisioned_by_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_employee public.employees%rowtype;
  app_user_id uuid;
  employee_role_id uuid;
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

  select u.id
    into provisioner_user_id
  from public.users u
  join public.user_roles ur on ur.user_id = u.id and ur.company_id = u.company_id
  join public.roles r on r.id = ur.role_id and r.company_id = u.company_id
  where u.company_id = target_employee.company_id
    and u.auth_user_id = provisioned_by_auth_user_id
    and u.deleted_at is null
    and u.status = 'active'
    and r.key in ('owner', 'hr_admin')
  limit 1;

  if provisioner_user_id is null then
    raise exception 'You do not have permission to create employee accounts';
  end if;

  select id
    into employee_role_id
  from public.roles
  where company_id = target_employee.company_id
    and key = 'employee';

  if employee_role_id is null then
    raise exception 'Employee role does not exist for company';
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
    employee_role_id,
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

revoke all on function public.provision_employee_account(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.provision_employee_account(uuid, uuid, uuid)
to service_role;
