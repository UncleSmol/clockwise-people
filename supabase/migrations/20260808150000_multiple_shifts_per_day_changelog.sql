insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-multiple-shifts-per-day',
  'Clock in for more than one shift in a day',
  'You can now clock out and then clock back in again later the same day to record another shift, instead of being locked out until the next day.',
  array[
    'After clocking out, you can clock in again immediately - there is no longer a wait until the next day.',
    'Every completed shift in the same day is saved as its own timesheet record with its own clock in, lunch, and clock out times.',
    'Clock in while your current shift is still open still asks you to finish that shift first.',
    'The dashboard shows your most recent shift for today, and managers see each shift separately.'
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
where version = '2026.8.8-multiple-shifts-per-day';