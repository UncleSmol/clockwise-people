insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-manager-timesheet-review',
  'Manager timesheet review is more detailed',
  'Managers can open calendar timesheets and review time, leave, lunch, and location details before approval.',
  array[
    'Managers can click company calendar timesheet events to open the full timesheet detail view.',
    'Submitted timesheet approvals now show NT, OT, paid time off, and lunch breakdowns.',
    'Timesheet review now includes the full clock-event location history for the shift.',
    'Location history shows geofence status, workstation distance, coordinates, and GPS accuracy when available.'
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
