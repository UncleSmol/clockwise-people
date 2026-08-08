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

The latest seeded production changelog is `2026.8.8-flexible-clock-flow-and-manual-clock-in`. It covers the flexible daily clock flow (clock out without lunch, auto-close open lunch on clock out) and the option to set a manual clock-in time. The prior update, `2026.8.8-mobile-responsive-pattern-background`, covered the mobile responsiveness polish (compact timesheet cards, 40px touch targets, 320px-wide support) and the new blueprint-pattern app background with a light-only theme.
