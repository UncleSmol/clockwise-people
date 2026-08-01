# ClockWise People — Developer Guide

ClockWise People is a multi-tenant workforce management application for South African
companies. Employees clock in/out from their browser with geolocation, review and submit
timesheets, request leave, and convert overtime to time off in lieu (TOIL). Managers review
submissions, approve leave, and see a live workforce overview.

## Stack

- **Next.js 16** (App Router, React Server Components, Turbopack)
- **TypeScript**, **Tailwind CSS**, **FullCalendar**
- **Supabase** (PostgreSQL, Auth, RLS, PostgREST)
- **Zod** for form validation, **React Hook Form** for complex forms, **TanStack Table** for registers
- React Compiler–compatible lint via `eslint-config-next` (`npm run lint`)

## Repository Layout

```
src/
  app/                  App Router routes (see Routes)
  components/           Client components, grouped by domain
    dashboard/          CalendarWorkspace shell, workspace context, panels
    time-tracking/      Clock, employee calendar, manager calendar and queues
    work-rules/         Leave, schedules, work rules, TOIL
    geolocation/        Workstation + geofence management
    foundation/         Departments
    employees/          Employee forms and register
    account/            Profile, company profile, password
    compliance/         Policies and documents
  lib/
    <domain>/
      schema.ts         Zod schemas + shared types
      queries.ts        Server-side view-model queries (React cache())
      actions.ts        Server actions ("use server")
    supabase/server.ts  Server Supabase client
    foundation/         Active-company and access helpers
supabase/
  migrations/           All SQL migrations, timestamped
docs/                   Product + architecture documentation
scripts/                Parsers and tooling (e.g. legacy import)
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/login` | Sign in |
| `/auth/create-company` | Provision a new company |
| `/auth/set-password` | Accept temporary credentials |
| `/auth/complete-invite` | Accept an employee invite |
| `/auth/callback` | OAuth / invite callback exchange |
| `/dashboard` | Main workspace (clock, calendar, panels) |
| `/dashboard/time` | Time tracking |
| `/dashboard/leave` | Leave workspace |
| `/dashboard/employees` | Employee register |
| `/dashboard/employees/[employeeId]` | Employee detail |
| `/dashboard/company` | Company setup |
| `/dashboard/account` | Account and settings |
| `/dashboard/documents` | Compliance and policies |
| `/health` | Production uptime check |

## Dashboard Workspace

The single `/dashboard` page composes the whole employee and manager experience.

### Employee view

- **Clocking engine** sits at the top (desktop) or is the primary **Clock tab** (mobile).
  - The employee picks a workstation for every event (defaults to their active assignment).
  - Actions: clock in, start/end lunch, clock out, and **switch workstation** mid-shift.
  - No-lunch days are detected from the employee's work schedule (`lunch_minutes <= 0`) and the
    lunch steps are skipped.
  - Location is captured for every event and validated against the picked workstation geofence.
    Out-of-range events are allowed but flagged and logged in `time_clock_events`.
- **Calendar engine** (Calendar tab on mobile): past-draft creation, fixing draft entries,
  viewing submitted days, public holidays, and a **quick submit** engine below the calendar that
  selects a contiguous date range.
- **Records / Requests tab** (mobile): submitted records and correction requests.
- A **"Request leave / TOIL"** button on the calendar opens the leave slide-in panel, which also
  includes **"Convert overtime to TOIL"** to accrue the current open payroll period's overtime.

### Manager view

- **My time / Team** toggle. Team mode shows the manager calendar for all employees with
  workstation names on days, leave requests, public holidays, and drill-down details.
- Slide-in **panels**: Leave and balances, Approvals and corrections (live workforce, correction
  queue, approval queue), People, Company setup, Account, Policies.

### Mobile

Three tabs (Clock / Calendar / Records) switch the section context; the clocking engine is the
center of focus. See `docs/dashboard-layout-and-clockin.md`.

## Core Domains

- **Company provisioning and auth** — owners are provisioned through a service-role RPC; employees
  are invited with pending invitations. See `docs/phase-1-architecture.md`.
- **Time tracking** — clocking, timesheets, payroll periods, corrections, manager approval.
  See `docs/timesheet-corrections.md` and `docs/dashboard-layout-and-clockin.md`.
- **Work rules and leave** — work schedules, leave types, balances, requests, TOIL.
  See `docs/work-rules-and-time-off.md`.
- **Geolocation and workstations** — workstations with geofences, employee assignments, and
  clock-event location history. See `docs/geolocation-workstations.md`.
- **Overtime** — overtime tracking and holiday pay. See `docs/company-profile-and-overtime.md`.
- **Company profile, logo, and employee pictures** — see the corresponding feature docs.
- **App updates / changelog** — see `docs/app-update-changelog.md`.

## Data Model

Core tables (all in `public`):

| Table | Purpose |
| --- | --- |
| `companies`, `company_settings` | Tenant and settings |
| `users`, `roles`, `user_roles`, `permissions`, `role_permissions` | Auth, roles, access control |
| `employees`, `departments`, `work_schedules`, `schedule_days` | Employee records and work rules |
| `company_workstations`, `employee_workstation_assignments` | Physical locations and geofences |
| `payroll_periods`, `timesheets`, `time_entries` | Payroll windows and daily time records |
| `time_clock_events` | Per-event clocking, location, geofence data |
| `timesheet_correction_requests` | Employee correction submissions |
| `leave_types`, `leave_balances`, `leave_requests`, `toil_transactions` | Leave and TOIL |
| `company_public_holidays` | Paid/unpaid holidays (auto-booked entries) |
| `user_invitations` | Pending employee invites |
| `audit_logs` | Append-only audit trail |
| `app_updates`, `app_update_reads` | In-app changelog |
| `overtime_records`, `monthly_summaries`, `approval_requests` | Reporting and workflow support |

Cross-cutting rules:

- Every company-scoped table has `company_id`, `deleted_at` (soft delete), `created_at`,
  `updated_at` via `set_updated_at()` trigger.
- Employees soft-delete instead of hard delete so history is preserved.
- Server actions always resolve the active company and employee from the authenticated session and
  attach `company_id` on the backend. Client components never decide tenant scope.
- RLS is enabled on business tables; privileged writes happen inside `security definer` functions.

## Security Model

- Roles: `owner`, `hr_admin`, `branch_manager`, `payroll_viewer`, `employee`.
- Capabilities are derived server-side by `getCurrentUserAccess()` and enforced in both queries
  (manager-only data) and actions.
- Critical mutations are RPC functions with `security definer` that re-check actor identity and
  scope (`company_id`, `employee_id`) inside the function.
- RLS policies gate direct table access; e.g. `is_company_member`, `has_any_company_role`.
- The service-role key is used only by provisioning/backend flows, never by dashboard UI.

## Development

```powershell
npm install
npm run dev        # Next.js dev server (webpack)
npm run build      # production build (must pass before committing)
npm run lint       # eslint (must pass before committing)
```

Local development uses `.env` for Supabase URL and anon key.

## Database Migrations

All schema changes live in `supabase/migrations/` as timestamped SQL:

```
YYYYMMDDHHMMSS_<slug>.sql
```

Apply with the Supabase CLI (`npx supabase db push`) or the project's usual deployment flow.
Migrations are the source of truth; no schema drift is expected outside them.

### Migration conventions

- Use `create or replace function` / `drop function if exists` when changing RPC signatures so the
  new signature replaces the old one cleanly.
- Guard enum value additions in a `do $$ ... $$` block with `pg_enum` checks.
- Recompute-derived data (e.g. `refresh_time_entry_calculations`) in `do $$ ... $$` blocks and
  reconcile parent rows, then leave a comment describing what the migration fixes.
- Grant `execute` on new/changed RPCs to `authenticated` (and `service_role` where needed).
- Data-fix migrations should be idempotent so they can be applied safely on existing data.

## Changelog Process

Every user-visible change requires a commit message with a `CHANGELOG` block and a migration that
seeds `public.app_updates`. See `docs/changelog-workflow.md` for the exact format and the quick
`scripts/commit.ps1` workflow.

## Feature Documentation Index

- `docs/README.md` — this guide
- `docs/dashboard-layout-and-clockin.md` — dashboard layout, clocking overhaul, workstation picker,
  no-lunch days, range submission with flag gate, leave/TOIL
- `docs/phase-1-architecture.md` — provisioning, invites, corrections, work rules, scale readiness
- `docs/timesheet-corrections.md` — correction request flow
- `docs/work-rules-and-time-off.md` — schedules, leave types, balances, requests
- `docs/geolocation-workstations.md` — workstations, geofences, assignment model
- `docs/company-profile-and-overtime.md` — company profile and overtime rules
- `docs/company-logo-branding.md` — logo and branding
- `docs/employee-profile-pictures.md` — employee photos
- `docs/production-scale-readiness.md` — scale-up plan and status
- `docs/app-update-changelog.md` — in-app changelog backend and UI
- `docs/changelog-workflow.md` — commit format and release process
