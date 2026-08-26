# Changelog

All notable changes to the ClockWise People platform are documented in this file.

## [Unreleased] - 2026-08-26

### Added
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
