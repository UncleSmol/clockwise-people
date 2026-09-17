insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.9.17-accurate-geolocation-workstations',
  'Pinpoint Geolocation, Editable Workstations, Map URL Parsing, and Multi-Engine Search',
  'We completely overhauled workstation geolocation to ensure pinpoint geofence accuracy: direct coordinate editing, Google Maps URL resolution (including mobile short links), multi-engine address search with Photon fallback, reverse geocoding, and one-click on-site GPS positioning.',
  array[
    'Direct Coordinate Editing: Enter or adjust high-precision Latitude and Longitude values directly in the workstation editor with real-time two-way synchronization to the interactive map pin',
    'Workstation Re-Editing & Active Selection: View and edit existing or last-set workstations with immediate UI updates, dedicated active selection indicators, and on-card coordinates',
    'Map URL & Short Link Resolution: Paste any Google Maps link (including mobile maps.app.goo.gl short links), Apple Maps, OpenStreetMap, or Waze URL to instantly extract coordinates and pin the location',
    'Smart Coordinate Parser: Automatically parses decimal pairs, Degrees Minutes Seconds (DMS), labeled coordinates, and cardinal formats with validation',
    'Multi-Engine Address Search: Combines OpenStreetMap Nominatim with a secondary Komoot Photon fallback engine for resilient POI, building, and landmark search with typo tolerance',
    'Reverse Geocoding: 1-click "Get address from pin" automatically populates street address and suburb from the selected map coordinates',
    'On-Site GPS "Locate Me": High-accuracy device GPS positioning button directly on the map with live accuracy readouts (±m)',
    'Server Cache Fix: Fixed dashboard server cache revalidation so updated and newly added workstations reflect instantly across the entire application'
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
