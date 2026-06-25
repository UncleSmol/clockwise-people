insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-compliance-location-clock',
  'Location clocking and compliance documents are clearer',
  'Employees can clock from the dashboard with required location capture, and policy documents are available in the app.',
  array[
    'Added a dashboard quick clock section for employee-linked accounts.',
    'Clocking now requires browser location permission before the clock event is submitted.',
    'Clocking cards show the captured latitude, longitude, and GPS accuracy when available.',
    'Added a Documents area with location data, monitoring, privacy, retention, security, and acceptable use policies.'
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
