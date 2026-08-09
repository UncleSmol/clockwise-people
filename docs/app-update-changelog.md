# App Update Changelog

ClockWise People shows a compact changelog notice when a signed-in user has not seen newly published app updates.

## Backend

`public.app_updates` stores published update notes:

- `version` identifies the release.
- `title` and `summary` explain the update in plain language.
- `changes` stores the visible bullet list.
- `published_at` controls display order.
- `is_published` lets updates be drafted or hidden.

`public.app_update_reads` stores per-company, per-user read receipts. A user sees each published update once per company until they dismiss it.

The dashboard calls:

- `public.get_unseen_app_updates(company_id)` to load unseen updates.
- `public.mark_app_updates_seen(company_id, update_ids)` when the user closes the modal.

## Frontend

`DashboardLayout` loads unseen updates and renders `AppUpdateChangelog`. The changelog component is keyed by the unread update ids, so a reload or server refresh with unread updates mounts a fresh notice for that unread batch.

The notice appears on the first dashboard load after new updates are published. It is a blocking modal, so users must clear unread updates before interacting with dashboard content. If a user has multiple unread updates, the app groups them into one notice and sends all unread update ids to `mark_app_updates_seen` when the user dismisses it. This prevents a returning user from receiving one popup per missed release.

## Current Production Notes

The latest seeded production changelog is `2026.8.8-colored-steps-install-button-and-leave-absent-days`. It colors the three My time step headers (navy clock, amber review, violet leave) with white step numbers in matching-tone circles, adds an "Install the app" download button under the Leave step that appears only while the app is not installed and returns after it is uninstalled, and lets leave requests cover days with no timesheets: an absent day on a scheduled working day no longer triggers "The selected dates do not include working hours". It follows `2026.8.8-timesheet-grid-and-navbar-profile-menu`. It lays timesheet and correction-request cards out on a responsive grid (one column on phones growing to two and three columns on larger screens), moves the admin services menu into the top navigation bar, puts Sign out inside that top-bar menu, and replaces the sign-out button with the user profile image. It follows `2026.8.8-global-action-loading-overlay`. It adds a full-screen loading overlay that appears whenever a user action talks to the server and stays until the request finishes, while background polling, realtime pushes, and prefetches stay silent so the screen never flashes on its own. It follows `2026.8.8-collapsible-my-time-and-calendar-review`. It splits the My time tab into three color-coded collapsible sections (navy clock, amber review, violet leave), keeps the Clock in and out section open by default while collapsing the other two, shows attention badges on every collapsed step, fixes the workstation picker so extra shifts on the same day can be logged, keeps the leave advisor from overflowing its card on phones, and lets admins approve or reject submitted timesheets in bulk straight from the calendar. It follows `2026.8.8-mobile-my-time-and-block-company-switcher`, which fixed the My time tab on small screens (timesheet rows wrap into two tidy columns instead of four squeezed ones, matching the Team tab) and collapsed the admin company switcher into a compact, freely draggable block. That followed `2026.8.8-clock-in-clash-guard`, which blocked overlapping or duplicate clock shifts on the same day (previous release `2026.8.8-multiple-shifts-per-day` enabled several shifts per day). Prior updates were `2026.8.8-flexible-clock-flow-and-manual-clock-in` (clock out without lunch, manual clock-in times) and `2026.8.8-mobile-responsive-pattern-background` (mobile responsiveness polish, 40px touch targets, 320px-wide support, blueprint-pattern background, light-only theme).
