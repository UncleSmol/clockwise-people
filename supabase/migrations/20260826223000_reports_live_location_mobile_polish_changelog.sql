insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.26-compliance-reports-live-location-mobile-polish',
  'Compliance & Payroll Reporting, Live Shift Location Tracking, and Mobile Card Layout Polish',
  'We introduced a complete Compliance & Payroll Reporting Center with multi-format exporters (PDF, Excel, CSV), Capacitor-powered live work-hours location tracking with >25m movement filtering and interactive route maps, calendar draft editing, and compact mobile card layouts.',
  array[
    'Compliance & Payroll Reporting Center: Generate Timesheet, Attendance & Punctuality, Leave & TOIL Accruals, and Absence reports by payroll period with KPI analytics strips and custom cycle configuration (Monthly, Semi-Monthly, Bi-Weekly, Weekly)',
    'Top-Tier Report Exporters: 1-click export to branded PDF documents, Excel spreadsheets (.xlsx) with metadata sheets, and RFC4180 CSV files',
    'Work-Hours Live Location Tracking: Track live shift locations with Capacitor native geolocation (and browser fallback) strictly while clocked in during scheduled work hours, automatically deactivating during breaks and off-shift',
    'Significant Movement Filter: Logs breadcrumbs only when movement exceeds 25 meters to optimize device battery and network usage',
    'Interactive Shift Route Maps: Visual Leaflet map showing chronological route polylines, start/lunch/waypoint/end markers, and workstation geofence boundary circles',
    'Live Geolocation Privacy Policy: Formally documented in the Policies workspace ensuring full transparency and POPIA compliance',
    'Calendar Direct Draft Editing: Edit and create timesheet drafts directly from the Detailed Calendar in My Time',
    'Mobile Card Optimization: Compact, viewport-fitting card layouts for reports and timesheets with hours neatly stacked below status indicators on mobile devices',
    'Dedicated Header Menu Button & Push Notifications: Improved navigation with a dedicated menu button beside the avatar and in-app push notification preferences'
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
