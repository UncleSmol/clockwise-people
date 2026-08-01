insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.1-mobile-notifications-and-holiday-color',
  'Mobile notifications and calendar legend fixes',
  'The notification panel now fits mobile screens and public holidays use their own distinct color on the timesheet calendars.',
  array[
    'The notification panel opens as a full-width sheet on mobile so it no longer overflows the screen.',
    'Public holidays now use a dedicated violet color so they no longer look identical to submitted entries in the calendar legend.'
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
where version = '2026.8.1-mobile-notifications-and-holiday-color';
