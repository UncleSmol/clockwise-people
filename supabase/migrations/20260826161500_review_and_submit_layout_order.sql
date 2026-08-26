-- Changelog entry for reordering timesheet review and submit components
insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.26-review-before-submit-layout',
  'Timesheet Review & Submit Flow Update',
  'Reordered the Review & Submit view so that timesheet cards and correction forms appear first, followed by the submit form below.',
  array[
    'Moved the timesheet records list and correction editor above the submission form',
    'Streamlined the workflow so users review and adjust their timesheets before selecting and submitting them'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at;
