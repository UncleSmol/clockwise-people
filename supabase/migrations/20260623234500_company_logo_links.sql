alter table public.companies
add column logo_url text;

alter table public.companies
add constraint companies_logo_url_http_check
check (
  logo_url is null
  or logo_url ~* '^https?://[^[:space:]]+$'
);

create or replace function public.update_company_logo(
  target_company_id uuid,
  company_logo_url text
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  company public.companies%rowtype;
  cleaned_logo_url text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  if not public.has_any_company_role(target_company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can update the company logo';
  end if;

  cleaned_logo_url := nullif(btrim(coalesce(company_logo_url, '')), '');

  if cleaned_logo_url is not null
    and cleaned_logo_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Company logo must be a valid http or https link';
  end if;

  update public.companies
  set logo_url = cleaned_logo_url,
      updated_at = now()
  where id = target_company_id
    and deleted_at is null
  returning * into company;

  if not found then
    raise exception 'Company could not be found';
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
    company.id,
    actor_id,
    'update',
    'companies',
    company.id,
    jsonb_build_object('logo_url', company.logo_url),
    'Company logo updated'
  );

  return company;
end;
$$;

grant execute on function public.update_company_logo(uuid, text) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.23-branding-changelog',
  'Profiles, branding, and quieter updates',
  'Employees can add profile pictures, admins can set a company logo, and unread update notes now appear together in one compact notice.',
  array[
    'Employees can update their profile details and add a public profile picture link.',
    'Profile pictures now appear across employee, manager, timesheet, and approval screens.',
    'Company admins can add or clear a company logo from Company setup.',
    'The company logo appears in the app header and mobile drawer.',
    'Unread changelogs are grouped into one notice so returning users are not shown multiple popups.'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at,
    is_published = true,
    updated_at = now();
