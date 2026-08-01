insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.1-dashboard-clocking-toil-sidebars',
  'Clocking overhaul, TOIL, and viewport sidebars',
  'Dashboard rebuilt with mobile tabs, workstation picker and mid-shift switching, no-lunch days, flagged submission gate, overtime-to-TOIL, and a fix for calendar overlays.',
  array[
    'Dashboard now has mobile tabs (Clock / Calendar / Records) and managers can toggle between My time and Team.',
    'Clock in with a workstation picker; switch workstations mid-shift while clocked in.',
    'Days with no lunch break skip the lunch steps (clock in to clock out).',
    'Out-of-range clocking is allowed but flagged, with warnings on the clock and submission lists.',
    'Timesheet submission uses a contiguous range selector; flagged days must be acknowledged before submitting.',
    'Legacy imported timesheets with hardcoded zero hours are recomputed and reconciled.',
    'Convert the current open payroll period''s overtime to TOIL in the leave panel.',
    'Calendar panels, dashboards, and the changelog now open as proper viewport overlays instead of being trapped inside their sections.',
    'Manager calendar day cells show up to six employee avatars with a +N overflow; clicking one opens that employee''s day entry.'
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
where version = '2026.8.1-dashboard-clocking-toil-sidebars';
