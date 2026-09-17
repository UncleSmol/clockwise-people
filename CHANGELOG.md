# Changelog

All notable changes to the ClockWise People platform are documented in this file.

## [2026.09.17] - 2026-09-17

- **Database Architecture & Operational Lifecycles Blueprint** (`database_structure.json`):
  - Placed authoritative, comprehensive JSON document on the app root detailing all 33 PostgreSQL tables, primary keys, foreign keys, check constraints, default values, and nullable constraints.
  - Documents 9 domain modules (Foundation, Users, Employees, Attendance, Work Rules, Geolocation, Documents, Integrations, Audit) and 7 operational lifecycles (multi-tenant switching, geofence clocking, automated overtime calculation, leave reconciliation, corrections, migration pipeline, and realtime events).
- **Admin Timesheet & Leave Spreadsheet Migration Pipeline**:
  - **Dual-Format Engine & Automatic Interval Stitching** (`src/lib/time-tracking/timesheet-importer.ts`): Parses standard ClockWise People Excel templates and legacy QuickBooks Time / TSheets exports (such as `Tsepang.xlsx`). Automatically merges multi-row daily intervals, identifies the main unpaid lunch break, resolves earliest clock-in and latest clock-out, and extracts geofence audit flags.
  - **Comprehensive Leave Taken Recognition**: Automatically categorizes full-day and partial leave records (Annual Leave, Sick Leave, Family Responsibility Leave, Public Holidays, and Approved Days Off), linking directly to `public.leave_types` and populating `paid_hours` and `normal_hours` on `public.time_entries`.
  - **Automated Database Synchronization & Calculations** (`src/lib/time-tracking/migration-actions.ts`): Auto-creates parent `timesheets` if missing, updates employee `leave_balances` with taken hours, and executes PostgreSQL stored procedure `refresh_time_entry_calculations` to evaluate gross hours, lunch subtractions, normal hours, overtime thresholds, and attendance flags.
  - **Interactive Admin UI & Preview Console** (`src/components/time-tracking/TimesheetMigrationPanel.tsx`): Integrated into Company Setup on the dashboard. Features drag-and-drop spreadsheet upload, live format detection badge, summary KPI cards, diagnostics alert for unmatched entities, tabbed search table (All, Shifts, Leave, Warnings), and conflict resolution toggles (skip existing dates, deduct leave balances, auto-provision leave types).
  - **Downloadable Formatted Excel Template** (`/api/timesheet-template/download` & `workforce-clockins/clockwise_timesheets_template_with_leave.xlsx`): Multi-sheet workbook complete with `Timesheets` data sheet with sample shift and leave entries, `Field_Guide` operational instructions, and `Leave_Types_Reference` South African BCEA statutory categories.
- **Strict Multi-Company Workstation Isolation & Database Scoping**:
  - Re-engineered remote database procedures (`upsert_company_workstation` and `record_employee_time_event`) to enforce `target_company_id` scoping rather than resolving the user's first created company. Workstations, radius rules, and clock events are now strictly isolated per company.
  - Migrated misplaced workstation records (e.g. Alora Dental Care) to their correct company scope and purged cross-tenant duplicates.
  - Scoped active company resolution in `getActiveCompany()` and `getCurrentUserAccess()` to cookie-based tenancy for all multi-company members.
  - Bound component keys to `company.id` (`<CompanyGeolocationPanel key={company.id} />` & `<EmployeeTimeClock key={company.id} />`) to ensure instantaneous, clean state reset and prevent stale workstation state when switching companies.
- **Dynamic Real-Time Geofence Distance Readout & Accuracy Feedback**:
  - Added live distance evaluation (`liveDistanceMeters`) and geofence boundary validation (`liveIsInRange`) in `EmployeeTimeClock` (both strip and card views).
  - Displays real-time proximity in meters to the selected workstation with allowed radius limits prior to clocking, eliminating accidental out-of-range events.
- **Default Workstation Map View to Assigned Workstation**:
  - Automatically queries the active logged-in employee's workstation assignment and sets the map position, marker, geofence radius, and address inputs to their assigned workstation by default on initial page load (with fallback to the company's first workstation).
  - Added visual indicator showing active assignment and "Your assigned workstation" badge in the configured workstations list.
- **Admin Workstation Removal & Clean Unlinking**:
  - Added prominent "Remove" workstation action directly within the workstation edit form and list.
  - Includes browser confirmation dialog, soft deletion (`is_active = false, deleted_at = now()`), automatic unlinking of employee assignments, and graceful state reset.
- **Header Company Switcher Cleanup**:
  - Removed duplicate company selector in calendar workspace, retaining only the free-floating switcher.
- **Direct Coordinate Editing for Workstations** (`src/components/geolocation/CompanyGeolocationPanel.tsx`):
  - Added dedicated, fully interactive Latitude and Longitude input fields with real-time two-way synchronization to the Leaflet map marker and geofence radius.
  - Supports standard decimal degrees with high-precision input, direct typing, and validation.
- **Map URL & Coordinates Fallback Parser** (`src/lib/geolocation/location-parser.ts` & `src/lib/geolocation/actions.ts`):
  - Added unified location input parser supporting Google Maps URLs (including mobile `maps.app.goo.gl` short links resolved server-side), OpenStreetMap, Apple Maps, and Waze links.
  - Added support for Degrees Minutes Seconds (DMS), labeled coordinates (`lat: ..., lon: ...`), and cardinal coordinates (`S 26.2041, E 28.0473`).
- **Multi-Engine Resilient Address Search & Fallback**:
  - Integrated OpenStreetMap Nominatim with proper `User-Agent` headers and South Africa country bias.
  - Added secondary fallback to Komoot Photon geocoding engine for resilient POI, landmark, and building search with typo tolerance.
  - Automatic detection of coordinate pairs or map URLs pasted directly into the address search box.
- **One-Click Reverse Geocoding ("Get Address from Pin")**:
  - Automatically fetches street address, suburb, and city when moving the map pin, using GPS, or entering coordinates.
- **High-Accuracy GPS "Locate Me" Control** (`src/components/geolocation/WorkstationMap.tsx`):
  - Added on-site GPS location button with accuracy measurement readout (`±8m GPS accuracy`).
- **Workstation Selection & Re-Editing**:
  - Highlights currently selected workstation in the active workstations list with clear "Editing" indicator and "Edit" action button.
  - Displays coordinates and radius directly on workstation cards.

### Fixed
- **Workstation Server Cache Revalidation**:
  - Fixed cache invalidation in `saveCompanyWorkstation`, `deactivateCompanyWorkstation`, and `assignEmployeeWorkstation` to revalidate `/dashboard` alongside `/dashboard/company`, ensuring edited or newly created workstations reflect immediately without requiring a hard refresh.
- **Leaflet Map Rendering Glitch**:
  - Added `MapResizer` to call `invalidateSize()` when the Workstations `<details>` accordion expands, eliminating gray or misaligned map tiles.

## [2026.08.26] - 2026-08-26

### Added
- **Work-Hours Live Location Tracking & Significant Movement Engine** (`src/lib/geolocation/live-tracker.ts` & `LiveLocationTracker.tsx`):
  - **Work-Hours Only Tracking**: Location is tracked strictly and exclusively during scheduled work hours when an employee is actively clocked in.
  - **Automatic Off-Shift & Break Deactivation**: When an employee clocks out, goes on lunch/break, or is outside work hours, location tracking is completely terminated to guarantee employee privacy and POPIA compliance.
  - **25-Meter Significant Movement Filter**: Dynamically evaluates distance moved using the Haversine formula and logs waypoints only when the employee moves by at least 25 meters, optimizing device battery life and mobile network data.
  - **Capacitor Geolocation Native Bridge**: Integrates `@capacitor/geolocation` for native mobile execution with seamless web browser fallback.
- **Admin Timesheet Movement Route Map & Visual Breadcrumbs** (`src/components/time-tracking/TimesheetRouteMap.tsx`):
  - 1-click interactive Leaflet route map embedded in timesheet cards, approval queues, correction review, and team calendars.
  - Features color-coded waypoint markers for Clock In (Green), Lunch Events (Amber), Movement Changes >25m (Blue/Cyan), and Clock Out (Red), connected by a chronological polyline route with workstation geofence boundary circles.
- **Live Location Governance & POPIA Policy** (`src/components/compliance/ComplianceDocuments.tsx`):
  - Formally documented the Live Work-Hours Geolocation Policy in the **Policies and documents** workspace, establishing zero off-duty monitoring.
- **Compliance & Payroll Reporting Center** (`src/components/reports/CompanyReportsWorkspace.tsx`):
  - **Timesheets & Payroll Reports**: Pull and audit full timesheet logs by payroll period with breakdown of normal hours, 1.5x overtime, 2.0x Sunday/holiday overtime, holiday hours, gross paid hours, and manager approval sign-offs.
  - **Attendance & Punctuality Analytics**: Track employee scheduled vs worked days, on-time arrivals, late arrivals, missing clockings, geofence compliance rate %, and overall punctuality scores.
  - **Leave & TOIL Accruals Summary**: Monitor opening balances, period earned hours, taken hours, adjustments, closing balances in hours/days, and projected year-end accruals.
  - **Absence & Leave Log**: Review all employee absence history, leave categories, reasons, paid/unpaid statuses, and approval records.
  - **Mobile-Optimized Timesheet & Report Card Layouts** (`EmployeeTimesheetCorrections.tsx` & `CompanyReportsWorkspace.tsx`):
  - **Timesheet Cards on Mobile**: Hours are stacked neatly below the status indicator badge (`Approved` / `Draft` / `Rejected` / `Submitted`), eliminating horizontal stretching and wrapping.
  - **Reports Workspace on Mobile**: Full data tables automatically switch to compact, responsive cards tailored for mobile phone viewports with zero horizontal scrolling.
- **Top-Tier Multi-Format Exporters**: Built-in 1-click **PDF export** (using `jspdf` and `jspdf-autotable` with company branding, KPI summary strip, and paginated tables), **Excel export** (using `xlsx` with multi-column metadata sheets), **RFC4180 CSV export**, and print-ready views.
- **Company Payroll Period Setup Engine** (`src/lib/reports/payroll-periods.ts` & `PayrollPeriodSettingsForm.tsx`): Configure payroll cycles (Monthly, Semi-Monthly, Bi-Weekly, Weekly), anchor dates, start days of month/week, and pay day disbursement offsets with live period previews.
- **Calendar Direct Draft Editing & Creation** (`src/components/time-tracking/EmployeeTimesheetCorrections.tsx`):
  - Clicking any draft or rejected timesheet on the Detailed Calendar in the **My Time** tab instantly expands and focuses the inline draft editor directly beneath the calendar.
  - Allows full editing of Clock In, Lunch Start, Lunch End, Clock Out, and Notes, with direct Save Draft, Delete, or Submit capabilities.
  - Clicking any past work day with no entry enables a 1-click **Create Past Draft** action.
- **Smart Grid Layout System & Text Wrapping Protection**:
  - Implemented responsive auto-fit container grids (`grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5`) across all queue cards (Timesheet Approvals, Correction Requests, Leave Requests, and Live Workforce).
  - Upgraded inner metric boxes with container-aware auto-fit layouts (`grid-cols-2 min-[440px]:grid-cols-4 gap-1.5`) and strict `truncate whitespace-nowrap` protection, ensuring labels like `Clock In`, `Lunch`, `Clock Out`, and `Total Paid` never wrap awkwardly or break layout across different screen sizes.
- **Push Notifications Settings & Device Sync** (`src/components/account/PushNotificationSettings.tsx` & `public/sw.js`):
  - Added push notification management to the **Account & Settings** workspace panel.
  - Allows 1-click permission enrollment with service worker registration, test notification trigger, and customizable preference toggles (Shift Reminders, Timesheet Alerts, Approvals & Leave Updates).
- **Dedicated Header Menu Button** (`src/components/DashboardNavigation.tsx`):
  - Separated menu opening functionality from the user profile avatar into an explicit, accessible **Menu** button (`Menu` icon + label + `ChevronDown`).
  - Profile avatar is now a clean visual identity badge with live WebSocket connectivity indicators.
- **Live Clocked-In Colleagues on Calendars** (`src/components/time-tracking/EmployeeTimesheetCorrections.tsx` & `CompanyTimesheetCalendar.tsx`):
  - Added a live attendance strip on both personal timesheets/calendar and team calendar workspace.
  - Displays colleagues currently active on shift or on lunch with live status badges, avatars, and clock-in times.
- **Drawer Workspace Quick-Switcher Tab Bar** (`src/components/dashboard/CalendarWorkspace.tsx`):
  - Added an instant top segmented navigation bar in the sidebar drawer header.
  - Allows 1-click switching between workspace panels (**People**, **Approvals**, **Leave**, **Company**, **Policies**, **Account**, **Attendance**) without needing to close the drawer and reopen the user profile avatar menu.
- **Masonry Multi-Column Stacking for Timesheet Cards** (`src/components/time-tracking/EmployeeTimesheetCorrections.tsx`):
  - Implemented responsive multi-column masonry layout (`columns-1 sm:columns-2 xl:columns-3 gap-3`) with `break-inside-avoid`.
  - Solved uneven grid height issues by naturally stacking shorter collapsed cards underneath each other beneath tall expanded editors.
- **Pulsing Indicator for Draft Timesheets** (`src/components/time-tracking/EmployeeTimesheetCorrections.tsx`):
  - Draft cards are now collapsed by default with an active pulsing amber glow (`ring-2 ring-amber-400/50 animate-pulse`) and radar ping dot (`animate-ping`).
  - Pulsing effect automatically stops once the timesheet is submitted or approved.
  - Added an expandable time editor toggle (`Edit` / `Collapse`) on draft cards.
- **Search & Status Filters on Employee Directory** (`src/components/employees/EmployeeTable.tsx`):
  - Added real-time search filtering across name, email, department, role, and payroll ID.
  - Added segmented status filter pills (`All`, `Active`, `Probation`, `On Leave`, `Inactive`) with dynamic counter badges.
- **In-App App Update Changelog Migration** (`supabase/migrations/20260826194500_design_system_drawer_switcher_and_masonry_timesheets_changelog.sql`):
  - Pushed database changelog record to Supabase for the in-app `AppUpdateChangelog` notification modal.

### Changed
- **Removed Global Action Loader Completely** (`src/app/layout.tsx`):
  - Removed `GlobalActionLoader` and global fetch interceptors completely for faster, non-blocking native navigation.
- **Uniform Card Styling Across the Entire App**:
  - Unified all card containers with consistent `border-2`, `rounded-lg`, and solid status colors across Personal Timesheets, Management Approvals, Correction Requests, Leave Requests, and Employee Directories.
- **Strong Color Distinctions & Solid Status Badges**:
  - Replaced faint/light pastel washes with high-contrast status colors:
    - **Approved / Compliant**: Solid emerald (`bg-emerald-600 text-white`) with high-contrast paid summaries.
    - **Draft / Action Required**: Solid amber (`bg-amber-500 text-white`) with live pulsing indicators.
    - **Submitted / Complete**: Solid dark navy (`bg-slate-900 text-white`) with emerald clock accents.
    - **Rejected / Exception**: Solid crimson (`bg-rose-600 text-white`) with manager note alert banners.
- **Timesheet Metric Boxes Overhaul**:
  - Structured all time points (**Clock In**, **Lunch Start**, **Lunch End**, **Clock Out**, **Total Paid**) into crisp white metric boxes (`bg-white border border-border rounded-md shadow-2xs`).
- **My Team Calendar & Workforce View** (`src/components/time-tracking/CompanyTimesheetCalendar.tsx`):
  - Upgraded header metrics (Total Shifts, Submitted, Approved, Exceptions) into bold high-contrast status cards.
  - Upgraded calendar view buttons (Daily, Weekly, Payroll Period, Monthly) and legend pills into crisp segmented controls.
