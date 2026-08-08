insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-mobile-responsive-pattern-background',
  'Crisper mobile experience and a new app background',
  'The whole app now works smoothly on phones down to 320px, timesheet cards are more compact, and every screen uses a subtle blueprint-style background pattern with the light theme only.',
  array[
    'The app now uses a light-only theme - the dark theme toggle has been removed everywhere.',
    'A subtle blueprint grid with dot markers and soft brand glows now sits behind every screen in the app.',
    'All buttons and form controls now meet a comfortable 40px touch target, so controls are easier to tap on phones.',
    'Timesheet records show compact icon chips for clock in, lunch, and clock out, using a short dash when a time was not recorded.',
    'Approval, correction, and submitted-timesheet cards are more compact and fit better on narrow screens.',
    'Calendar editing, geolocation, and map controls were enlarged and refined for small screens.',
    'Layouts stay clean on screens as small as 320px wide and scroll correctly on short phones.'
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
where version = '2026.8.8-mobile-responsive-pattern-background';