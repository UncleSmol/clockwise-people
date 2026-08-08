insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-clock-in-clash-guard',
  'No overlapping clock shifts on the same day',
  'Clock shifts for the same person can no longer overlap - starting a second shift at a time that clashes with an already-recorded shift is blocked.',
  array[
    'Starting a shift at exactly the same time as another shift is no longer allowed.',
    'Starting a shift while another shift for the day is still running or was only just finished is blocked.',
    'Back-to-back shifts are still fine - you can clock out at noon and clock back in at noon.',
    'If a shift overlaps, the app shows you a clear message instead of saving a duplicate record.'
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
where version = '2026.8.8-clock-in-clash-guard';