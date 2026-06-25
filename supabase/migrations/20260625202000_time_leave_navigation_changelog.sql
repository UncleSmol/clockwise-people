insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-time-leave-nav',
  'Time and leave have dedicated workspaces',
  'Time tracking and leave requests now live on their own dashboard pages with direct navigation.',
  array[
    'Added a dedicated Time page for employee clocking, personal timesheet calendars, manager review queues, and a company timesheet calendar.',
    'Added a dedicated Leave page for employee leave submissions and manager approval queues.',
    'Moved clocking and leave workflows out of the main dashboard so the dashboard remains a company overview.',
    'Added Time and Leave links to the desktop and mobile navigation.'
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
