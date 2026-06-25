insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.25-modal-role-fixes',
  'Dashboard access and modals are cleaner',
  'Modal panels now stay below the navbar, and employee dashboards no longer show manager-only actions.',
  array[
    'Large modals now open below the dashboard navbar and keep their close or action controls visible.',
    'Timesheet detail modals scroll internally instead of hiding controls behind the navbar.',
    'Employee dashboard quick actions no longer show manage employees or manage branches links.',
    'Manager setup prompts are hidden from employee-only dashboard views.'
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
