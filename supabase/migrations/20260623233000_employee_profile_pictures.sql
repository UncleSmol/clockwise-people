alter table public.employees
add column avatar_url text;

alter table public.employees
add constraint employees_avatar_url_http_check
check (
  avatar_url is null
  or avatar_url ~* '^https?://[^[:space:]]+$'
);

create or replace function public.update_own_employee_profile(
  profile_known_as text,
  profile_email text,
  profile_phone_number text,
  profile_avatar_url text
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  employee public.employees%rowtype;
  cleaned_avatar_url text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  cleaned_avatar_url := nullif(btrim(coalesce(profile_avatar_url, '')), '');

  if cleaned_avatar_url is not null
    and cleaned_avatar_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Profile picture must be a valid http or https link';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
    and employee_id is not null
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'No active employee profile is linked to this login';
  end if;

  update public.employees
  set known_as = nullif(btrim(coalesce(profile_known_as, '')), ''),
      email = nullif(btrim(coalesce(profile_email, '')), ''),
      phone_number = nullif(btrim(coalesce(profile_phone_number, '')), ''),
      avatar_url = cleaned_avatar_url,
      updated_at = now()
  where id = actor.employee_id
    and company_id = actor.company_id
    and deleted_at is null
  returning * into employee;

  if not found then
    raise exception 'Employee profile could not be found';
  end if;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    new_value,
    reason
  )
  values (
    employee.company_id,
    actor.id,
    'update',
    'employees',
    employee.id,
    jsonb_build_object(
      'known_as', employee.known_as,
      'email', employee.email,
      'phone_number', employee.phone_number,
      'avatar_url', employee.avatar_url
    ),
    'Employee updated own profile'
  );

  return employee;
end;
$$;

grant execute on function public.update_own_employee_profile(text, text, text, text) to authenticated;
