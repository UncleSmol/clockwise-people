insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.1-viewport-sidebar-and-avatar-fixes',
  'Sidebar and calendar avatar fixes',
  'Sidebars now open as proper overlays, page scrolling is no longer stuck after closing panels, and manager calendar avatars keep their round shape with status rings.',
  array[
    'Calendar and changelog sidebars now render as true full-screen overlays instead of being pushed into the page flow.',
    'Closing a sidebar no longer leaves the page stuck and unable to scroll, even when multiple panels overlap.',
    'Clicking outside a sidebar closes it; Escape still works.',
    'Manager calendar day cells now show clean round avatars with status-colored rings, with no square boxes clipping the legend colors.'
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
where version = '2026.8.1-viewport-sidebar-and-avatar-fixes';
