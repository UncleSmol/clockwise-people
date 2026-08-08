insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-flexible-clock-flow-and-manual-clock-in',
  'A more flexible daily clock and manual clock-in times',
  'Employees can now skip lunch and clock out directly, set a specific clock-in time when they start their shift, and end their shift any time without being forced through lunch steps.',
  array[
    'Clock out is now available directly after clock in, so employees who skip lunch can leave without starting lunch first.',
    'If an employee clocks out while on lunch, the lunch is closed automatically so the shift is not flagged as missing a clock out.',
    'When clocking in, employees can set a specific clock-in time instead of only using the current time (it still defaults to now and cannot be in the future).',
    'Lunch buttons still appear alongside clock out, so the flow now fits how you actually work your day.'
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
where version = '2026.8.8-flexible-clock-flow-and-manual-clock-in';