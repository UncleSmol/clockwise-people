-- 20261007180000_super_admin_grantor_permissions.sql
-- Allow Super Admin role to be assigned to any email domain (Gmail, Yahoo, etc.)
-- Enforce that ONLY Doctor (doctor@formalize.co.za) and Sizwe (admin@formalize.co.za) can assign or revoke Super Admin privileges.
-- Ensure non-super admins (even with @formalize.co.za emails) can never toggle between companies.

-- 1. Drop the check constraint restricting is_super_admin exclusively to @formalize.co.za users
alter table public.users
  drop constraint if exists users_super_admin_formalize_email_chk;

-- 2. Restore is_super_admin() function so any user flagged with is_super_admin = true has universal access
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

-- 3. Ensure Doctor Khoza and Sizwe Hlatshwayo are actively configured as Super Admins
update public.users
set is_super_admin = true
where lower(email) in ('doctor@formalize.co.za', 'admin@formalize.co.za');

-- 4. Helper function: is_super_admin_grantor()
-- Verifies whether current session belongs to Doctor or Sizwe from Formalize, or is executing via service_role
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
  if auth.role() = 'service_role' then
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

-- 5. Row-level trigger on public.users to strictly enforce that only Doctor or Sizwe can alter is_super_admin
create or replace function public.enforce_super_admin_grantor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If is_super_admin is being set to true on insert, or changed on update
  if (TG_OP = 'INSERT' and NEW.is_super_admin = true) or
     (TG_OP = 'UPDATE' and NEW.is_super_admin is distinct from OLD.is_super_admin) then

    if not public.is_super_admin_grantor() then
      raise exception 'Unauthorized: Only Doctor and Sizwe from Formalize can grant or revoke Super Admin privileges.';
    end if;

    -- Prevent demoting Doctor Khoza from root Super Admin
    if TG_OP = 'UPDATE' and lower(OLD.email) = 'doctor@formalize.co.za' and NEW.is_super_admin = false then
      raise exception 'Cannot revoke Super Admin privileges from Doctor Khoza.';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists users_enforce_super_admin_grantor on public.users;
create trigger users_enforce_super_admin_grantor
  before insert or update of is_super_admin on public.users
  for each row
  execute function public.enforce_super_admin_grantor();

-- 6. RPC: set_user_super_admin_by_email
-- Atomically assigns or revokes is_super_admin across all user records for a specific email
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

  return jsonb_build_object(
    'ok', true,
    'email', normalized_email,
    'is_super_admin', grant_super_admin,
    'updated_records', affected_count
  );
end;
$$;

grant execute on function public.set_user_super_admin_by_email(text, boolean) to authenticated, service_role;
