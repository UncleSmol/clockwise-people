insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.10.19-ui-rework-and-timesheet-engine',
  'Emerald UI Rework, Work Schedule Templates, Bulk Drafts, and Timesheet Pagination',
  'We redesigned the time picker and background to harmonize with the Clockwise People emerald brand palette, added work schedule rule template drafting with mandatory lunch breaks, launched a bulk draft uploader, and added full pagination to timesheets and correction requests.',
  array[
    'Emerald Brand Restyling: Transformed the time picker from the previous cyan/purple theme into our signature emerald green financial palette (#2E9B5F), removing Harmonized Aurora branding in favor of clean, accessible headers',
    'Subtle Background Harmony: Refined desktop and mobile luminous gradient backgrounds for a sleek, balanced, and distraction-free workspace',
    'Work Schedule Rule Drafting: Quick-load timesheet drafts pre-filled with standard daily hours, shift times, and meal intervals directly assigned to your employee work schedule rule',
    'Mandatory Lunch Break Policy: Enforced lunch break insertion (lunch start & lunch end) on all timesheet creation and edit flows to comply with company labor and break regulations',
    'Bulk Draft Uploader: Rapidly generate multiple draft timesheets across date ranges with 1-click presets (This Week, Last Week, Last 14 Days, This Month), automated weekend/holiday skipping, and pre-populated schedule rules',
    'Timesheets Tab Pagination: Added configurable pagination (6, 12, 24, 48 per page) with total count indicators, page jumping, and smooth auto-scrolling on the Timesheets tab',
    'Requests Tab Pagination: Enhanced the correction requests review list with matching responsive pagination and quick page size selection'
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
