insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.8-mobile-my-time-and-block-company-switcher',
  'My time mobile fixes and a block-style company switcher',
  'The My time tab no longer squeezes shifts sideways on phones, and the floating admin company switcher now collapses to a small block that expands on click and stays freely draggable.',
  array[
    'My time: on smaller screens, every timesheet row now wraps its times into two tidy columns instead of four squeezed ones - nothing gets cut off on the right edge anymore.',
    'My time: timesheet time chips align, wrap, and shrink like the Team tab so both tabs feel the same on phones.',
    'Company switcher (admins only): the floating panel opens as a slim block with the company icon and name instead of a full-width dropdown.',
    'Click the block to expand the company selector, and click the up arrow to collapse it back down.',
    'The switcher block stays freely draggable anywhere on the screen, and dragging no longer accidentally expands or collapses it.'
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
where version = '2026.8.8-mobile-my-time-and-block-company-switcher';