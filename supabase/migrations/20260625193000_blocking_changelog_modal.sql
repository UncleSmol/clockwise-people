insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-blocking-changelog',
  'Updates must be acknowledged',
  'Unread app updates now pause dashboard use until they are cleared.',
  array[
    'The changelog now opens as a blocking modal when there are unread updates.',
    'Dashboard controls stay unavailable until the user clears the update notice.',
    'Keyboard focus stays inside the update modal while it is open.'
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
