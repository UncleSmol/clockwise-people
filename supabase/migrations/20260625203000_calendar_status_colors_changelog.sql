insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-calendar-status-colors',
  'Calendar status colors are clearer',
  'Timesheet calendars now use distinct colors and legends for holidays and timesheet status.',
  array[
    'Public holidays are highlighted with the holiday color on employee and company calendars.',
    'Draft, submitted, approved, and rejected timesheets now each have their own calendar color.',
    'Calendar legends explain each status color directly in the Time workspace.',
    'The company timesheet calendar now includes public holiday markers.'
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
