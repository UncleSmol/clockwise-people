create or replace function public.clear_app_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cleared_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where read_at is null
    and company_id in (select public.current_user_company_ids())
    and (
      user_id = public.current_app_user_id(company_id)
      or employee_id = public.current_employee_id(company_id)
    );

  get diagnostics cleared_count = row_count;

  return cleared_count;
end;
$$;

grant execute on function public.clear_app_notifications() to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.1-clear-all-notifications',
  'Clear all notifications',
  'Notifications can now be dismissed all at once with a single button.',
  array[
    'A Clear all button marks every unread notification as read.',
    'The clear action covers both the header notification bell and the dashboard action center.'
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

update public.app_updates
set published_at = now(),
    updated_at = now()
where version = '2026.8.1-clear-all-notifications';
