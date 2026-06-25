insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.26-account-admin-nav-notifications',
  'Account admin tools and navbar notifications',
  'Admin tools moved into Account, and notifications are available from the navbar.',
  array[
    'Company and employee admin links now live in Account.',
    'Unread notifications can be opened from the navbar.'
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
