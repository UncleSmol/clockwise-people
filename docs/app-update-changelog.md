# App Update Changelog

ClockWise People shows a changelog modal when a signed-in user has not seen newly published app updates.

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

`DashboardLayout` loads unseen updates and renders `AppUpdateChangelog`.

The modal appears on first dashboard load after a new update is published. Closing it records the update as seen, so it does not show again for that user unless another update is published.
