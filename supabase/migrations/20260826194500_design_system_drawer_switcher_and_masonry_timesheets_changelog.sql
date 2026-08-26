insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.26-design-system-drawer-switcher-masonry-timesheets',
  'Design system overhaul, drawer quick-switcher, and masonry timesheets',
  'We upgraded the app with strong, distinct status colors, a top quick-switcher tab bar inside all drawer panels, a responsive masonry layout for timesheets, and draft timesheets that stay collapsed with a pulsing indicator until submitted.',
  array[
    'Drawer panels now include an instant top tab bar to switch between People, Approvals, Leave, Company, Policies, Account, and Attendance in 1 click without closing the drawer',
    'Employee Directory on the People tab now features real-time search and segmented status filter pills (Active, Probation, On Leave, Inactive)',
    'Timesheet cards under Review and adjust now use high-contrast status themes (Emerald for Approved, Amber for Draft, Navy for Submitted, Crimson for Rejected)',
    'Timesheet cards flow in a multi-column masonry layout so collapsed cards stack naturally underneath each other without leaving empty vertical gaps',
    'Draft timesheets are now collapsed by default with an active pulsing amber indicator until submitted or approved, with an expandable time editor on demand',
    'Removed the full-screen global loading overlay for a faster, distraction-free native app experience'
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
