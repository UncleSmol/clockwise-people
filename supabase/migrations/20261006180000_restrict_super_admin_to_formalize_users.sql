-- 20261006180000_restrict_super_admin_to_formalize_users.sql
-- Restrict Super Admin (cross-tenant company switching and provisioning) exclusively to @formalize.co.za accounts

-- 1. Demote any non-formalize accounts that may have is_super_admin set to true (safety net)
update public.users
set is_super_admin = false
where is_super_admin = true
  and lower(email) not like '%@formalize.co.za';

-- 2. Add a CHECK constraint to public.users guaranteeing is_super_admin can only be true for @formalize.co.za users
alter table public.users
  drop constraint if exists users_super_admin_formalize_email_chk;

alter table public.users
  add constraint users_super_admin_formalize_email_chk
  check (is_super_admin = false or lower(email) like '%@formalize.co.za');

-- 3. Update public.is_super_admin() security definer function to require @formalize.co.za domain
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
        and lower(u.email) like '%@formalize.co.za'
        and u.status = 'active'
        and u.deleted_at is null
      limit 1
    ),
    false
  );
$$;

grant execute on function public.is_super_admin() to authenticated, service_role;
