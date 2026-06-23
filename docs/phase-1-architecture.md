# Phase 1 Architecture

Phase 1 covers invite/provisioned auth, company setup, branch setup, department setup, and employee registration.

## Data Boundary

- Client components do not decide tenant scope.
- Companies are provisioned by an administrator through backend/service-role operations.
- Server-side query modules resolve the active company through the authenticated Supabase session and RLS.
- Server actions attach `company_id` during writes after resolving the active company on the backend.
- User-facing code uses the anon key and Supabase cookies. The service role key must not be used by dashboard UI paths.
- Public users cannot create companies through RLS.

## Provisioning Flow

- An administrator creates the Supabase Auth user.
- The backend calls `public.provision_company_owner()` with the service role to create the company, app user row, and owner role assignment atomically.
- The owner signs in with assigned credentials and manages branches, departments, and employees for that company.

## Employee Invitation Flow

- Owners and HR admins create employee records before employee login accounts exist.
- Employee detail pages can create a pending `public.user_invitations` record and send a Supabase Auth invite from a server action.
- Resending an invite cancels any existing pending invite for that employee before creating a new pending invite.
- Only one pending invitation can exist per employee, enforced by a partial unique database index.
- Old invite links cannot be accepted after a newer invite is sent because the old invitation is no longer pending.
- The invite redirect points to `/auth/callback?inviteId=...`.
- The callback exchanges the Supabase Auth code, verifies the authenticated email, then calls `public.accept_user_invitation()` with the service role.
- `public.accept_user_invitation()` creates/updates `public.users`, assigns the invited role, links `public.users.employee_id`, links `public.employees.user_id`, and marks the invitation accepted.
- Manual employee/user linking is not part of normal application use.

## Timesheet Correction Flow

- Employees submit past time-entry corrections through `public.submit_timesheet_correction_request()`.
- Correction requests are append-only employee submissions stored in `public.timesheet_correction_requests`.
- Submitted correction requests are locked for employees; they cannot edit the request after submission.
- Original `public.time_entries` records are not changed by employee correction UI.
- Owner, HR admin, and scoped branch manager review is handled by `public.review_timesheet_correction_request()`.
- Employees assigned as `manager_employee_id` can review requests for their direct reports.
- Employees can save draft/rejected timesheets and submit selected timesheets in bulk.
- See `docs/timesheet-corrections.md` for the full product and technical flow.

## Work Rules and Time Off

- Company admins can create work schedules and time off rules from Company setup.
- Work schedules use the existing `work_schedules` and `schedule_days` tables.
- Company admins can edit existing work schedules through `public.update_company_work_schedule()`.
- Time off rules use `leave_types`; employee assignments use `leave_balances`.
- Company admins can edit existing `leave_types` through `public.update_company_leave_type()`.
- Employees preview leave hours through `public.calculate_own_leave_request_hours()`, including available balance and skipped public holidays.
- Employees submit leave through `public.submit_own_leave_request()`, which recalculates hours server-side.
- Leave requests greater than the employee's available leave balance are blocked by the UI and by the database function.
- Public holidays use `company_public_holidays` and are excluded from leave hour totals.
- Managers review leave through `public.review_managed_leave_request()`.
- See `docs/work-rules-and-time-off.md` for the full flow.

## Query Pattern

- Pages request one route-level view model from `/lib/**/queries.ts`.
- Query modules use React `cache()` for request-level de-duplication.
- Related Phase 1 data is fetched in parallel where possible.
- Mutations call `revalidatePath()` for the affected dashboard route.

## Client State

- Local storage is only used for presentation preferences, such as table density.
- Business data, tenant identifiers, permissions, and employee records are not stored in local storage.

## Spec-Aligned Libraries

- Next.js App Router and Server Components for route data loading.
- Supabase Auth, PostgreSQL, and RLS for backend security.
- React Hook Form and Zod for form validation.
- TanStack Table for employee register tables.
- Tailwind CSS for the design system.
