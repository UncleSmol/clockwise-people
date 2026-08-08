insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-global-action-loading-overlay',
  'A loading screen appears while the app talks to the server',
  'Any action you take that contacts the server now shows a full-screen loading overlay until the request finishes.',
  array[
    'A full-viewport overlay with the brand mark and spinner appears whenever a user action talks to the server',
    'The overlay covers the whole screen and stays until the request completes (with a short minimum duration)',
    'Background polling, realtime pushes, and prefetches stay silent so the screen never flashes on its own'
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