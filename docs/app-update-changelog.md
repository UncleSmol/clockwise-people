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

The latest production changelog is `2026.10.19-ui-rework-and-timesheet-engine`. It aligns the time picker and background with the Clockwise People emerald green brand system, adds work schedule rule template drafting with mandatory lunch breaks, provides a bulk draft uploader across date ranges, and adds configurable pagination on both Timesheets and Correction Requests tabs. It follows `2026.9.17-accurate-geolocation-workstations`, which introduced pinpoint geolocation, editable coordinates, and reverse geocoding. Prior updates include `2026.8.9-file-uploads-for-avatars-logos-and-attachments`, `2026.8.8-colored-steps-install-button-and-leave-absent-days`, `2026.8.8-timesheet-grid-and-navbar-profile-menu`, and previous releases.
