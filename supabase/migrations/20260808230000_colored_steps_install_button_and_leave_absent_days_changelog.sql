insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-colored-steps-install-button-and-leave-absent-days',
  'Colored My time steps, an install button, and leave for absent days',
  'The My time steps now use strong matching colors with their step numbers, an install button appears under Leave when the app is not installed yet, and leave requests can be filled in for days the employee was absent.',
  array[
    'The three My time steps now show strong colors and numbered circles on their headers: navy for clock, amber for review, and violet for leave',
    'An Install the app button with a download icon appears under the Leave step until the app is installed, and comes back after it is removed',
    'Leave can now cover days with no timesheets, as long as the day falls on a scheduled working day',
    'Days the employee was absent no longer stop a leave request with "The selected dates do not include working hours"'
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