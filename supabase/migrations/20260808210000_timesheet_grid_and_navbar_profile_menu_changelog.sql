insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-timesheet-grid-and-navbar-profile-menu',
  'Timesheets on a grid and a profile menu in the top bar',
  'Timesheet and request cards now flow into a responsive grid, and the top bar shows your profile image with the admin menu and sign out behind it.',
  array[
    'Timesheet and correction-request cards now sit in a responsive grid instead of a single column',
    'The admin services menu moves into the top navigation bar',
    'The sign out action is now inside the top-bar menu',
    'The navigation sign-out button is replaced with the user profile image'
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