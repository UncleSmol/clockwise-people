insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.7.27-warm-theme-mobile-super-admin',
  'Warm theme, mobile responsiveness, and super admin',
  'Warmed the colour palette, improved mobile browsing, and enabled employee features for super admin.',
  array[
    'Warmed the colour palette throughout — cream backgrounds, warm off-white surfaces, and taupe borders for a more natural, human feel.',
    'Added subtle purple accent bar to cards for visual character.',
    'Added viewport meta tag so mobile browsers render at actual device width instead of a zoomed-out virtual viewport.',
    'Made the services menu button more prominent on mobile with a visible label.',
    'Calendar now defaults to week view on mobile for easier browsing without cramped cells.',
    'Added tighter mobile breakpoint (480px) with compact calendar cells, smaller fonts, and denser events.',
    'Enabled clock-in, leave submission, and self-service features for super admin accounts.',
    'Adjusted all Supabase local ports to avoid Windows reserved port ranges.'
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
