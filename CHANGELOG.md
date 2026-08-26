# Changelog

All notable changes to the ClockWise People platform are documented in this file.

## [Unreleased] - 2026-08-26

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
