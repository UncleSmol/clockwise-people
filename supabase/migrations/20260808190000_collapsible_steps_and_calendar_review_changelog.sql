insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-collapsible-my-time-and-calendar-review',
  'Collapsible My time steps and calendar review for admins',
  'The My time steps now collapse into sections with color-coded badges, clocking into a second shift works again, and admins can approve submitted timesheets right from the calendar.',
  array[
    'My time: the three steps now sit in separate capped sections with bold color accents - Clock in and out (dark), Review and adjust (amber), and Leave and accruals (violet).',
    'My time: Review and adjust and Leave and accruals start collapsed by default to keep the tab clean; the Clock in and out section stays open so you can start the day immediately.',
    'Each collapsed step still shows a summary badge, so drafts, pending approvals, and pending leave requests stay visible without opening the section.',
    'Time clock: the workstation picker no longer goes grey after a shift, so logging another shift on the same day works again.',
    'Leave advisor: the request form, date labels, and buttons no longer overflow past the card on phones.',
    'Review (admins): submitted timesheets can now be approved or rejected in bulk straight from the calendar - pick the employee, select submitted records in the sidebar, leave an optional note, and approve or reject them all at once.'
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
where version = '2026.8.8-collapsible-my-time-and-calendar-review';