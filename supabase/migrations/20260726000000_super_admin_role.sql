-- Super admin support
-- 1. Add is_super_admin column to users table
alter table public.users
  add column is_super_admin boolean not null default false;

-- 2. Create the formalize company (system parent for super admin)
--    The trigger companies_seed_defaults will fire and create roles + company_settings
do $$
begin
  if not exists (select 1 from public.companies where name = 'formalize') then
    insert into public.companies (name, country, timezone, payroll_cycle)
    values ('formalize', 'South Africa', 'Africa/Johannesburg', 'monthly');
  end if;
end;
$$;

-- 3. Insert super admin user (no employee_id needed)
insert into public.users (company_id, auth_user_id, full_name, email, is_super_admin, status)
select
  c.id,
  '5a7c5218-1498-46d7-9172-4ed237fa50e9',
  'Doctor Khoza',
  'doctor@formalize.co.za',
  true,
  'active'
from public.companies c
where c.name = 'formalize'
on conflict (company_id, auth_user_id) do update set is_super_admin = true;

-- 4. Assign owner role on formalize company
insert into public.user_roles (company_id, user_id, role_id, assigned_by)
select
  u.company_id,
  u.id,
  r.id,
  u.id
from public.users u
join public.roles r on r.company_id = u.company_id and r.key = 'owner'
where u.auth_user_id = '5a7c5218-1498-46d7-9172-4ed237fa50e9'
  and u.is_super_admin = true
on conflict do nothing;

-- 5. Update permission functions to bypass for super admins

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
    left join public.user_roles ur on ur.user_id = u.id and ur.company_id = u.company_id and ur.revoked_at is null
    left join public.roles r on r.id = ur.role_id and r.company_id = u.company_id
    where u.auth_user_id = auth.uid()
      and u.company_id = target_company_id
      and u.status = 'active'
      and u.deleted_at is null
      and (u.is_super_admin = true or r.key = target_role)
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
      and u.company_id = target_company_id
      and u.status = 'active'
      and u.deleted_at is null
      and (u.is_super_admin = true or r.key = any(target_roles))
  );
$$;

grant execute on function public.has_company_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.has_any_company_role(uuid, public.app_role[]) to authenticated, service_role;
