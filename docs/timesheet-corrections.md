# Timesheet Corrections

## Product Intent

Employees need a way to correct past time records without weakening payroll controls. The correction flow is append-only: an employee submits a proposed correction, the submitted request becomes locked for the employee, and the original time entry is not edited directly by employee UI.

This supports an auditable workflow where HR, owners, or branch managers can review the request while payroll-facing records remain traceable.

Employees can edit and save draft or rejected timesheets directly. Once a timesheet is submitted, employees use a correction request instead of editing the original record.

## Data Model

`public.timesheet_correction_requests` stores one immutable employee submission per correction attempt:

- `time_entry_id` links to the original `public.time_entries` row.
- `original_*` columns snapshot the recorded clock values at submission time.
- `proposed_*` columns store the employee's requested correction.
- `reason` is required.
- `status` uses the existing `public.approval_status` enum.
- `submitted_by`, `reviewed_by`, and timestamps keep the approval trail.

The original `time_entries` row remains the system record. Approved corrections are represented as reviewed correction records, not silent in-place employee edits.

## Database Enforcement

The migration `20260623193000_timesheet_correction_requests.sql` adds:

- RLS-scoped read access for the employee, managers with scoped access, and payroll viewers.
- No employee update policy after submission.
- Manager update policy for submitted requests only.
- `submit_timesheet_correction_request(...)` RPC for employee submissions.
- `review_timesheet_correction_request(...)` RPC for manager approval/rejection.
- Audit log writes on submit and review.
- Duplicate prevention for more than one active submitted correction on the same time entry.

The submission RPC enforces:

- Authenticated employee account required.
- Employee can only submit against their own time entry.
- Only past time entries can be corrected.
- Cancelled entries cannot be corrected.
- Lunch start and lunch end must be supplied together.
- At least one proposed time must differ from the original.

The migration `20260623203000_direct_manager_timesheet_workflow.sql` extends the workflow with:

- Direct-manager approval scope through `employees.manager_employee_id`.
- Draft timesheet editing through `public.update_own_draft_time_entry(...)`.
- Bulk employee submission through `public.submit_own_timesheets(...)`.
- Correction request visibility for assigned managers.

## Frontend Flow

Employee dashboard data still comes from one route-level query: `getEmployeeTimeState()`.

The dashboard passes recent time entries and correction requests to `EmployeeTimesheetCorrections`, which:

- Displays recent time records.
- Shows a simple `Timesheets` tab for editing drafts, saving, and bulk submitting.
- Shows a simple `Requests` tab for submitted-time corrections.
- Uses red states for warnings and green states for clean time records.
- Shows the latest correction request per submitted entry.
- Blocks another correction form while a submitted request is pending.
- Posts correction forms through the `submitTimesheetCorrection` server action.

The management dashboard loads submitted requests through `getCompanyTimesheetCorrectionQueue()` and renders `CompanyTimesheetCorrectionQueue`, which lets owner, HR admin, scoped branch manager, and assigned direct manager users approve or reject requests through `reviewTimesheetCorrection`.

Pure employee dashboards do not show the management review queue. Employees only see their own `Timesheets` and `Requests` tabs.

After a manager approves a correction request, the proposed times are applied to the submitted time entry and the entry stays in `submitted` status. It then appears in the management `Submitted timesheets` approval queue, where the manager can approve it for payroll review through `approve_managed_timesheets(...)`.

Managers can also reject submitted timesheets through `reject_managed_timesheets(...)`. A rejected timesheet becomes editable for the employee again, the manager note is kept on the time entry, and the employee can correct and resubmit it.

The server action only normalizes form input and calls the database RPC. Authorization and business rules remain enforced in Postgres.

## Role Responsibilities

- Employee: can submit a correction request for their own past time entries.
- Owner / HR Admin: can review correction requests for the company.
- Branch Manager: can review correction requests for employees in assigned branches.
- Assigned Manager: can review correction requests for employees directly assigned to them as manager.
- Payroll Viewer: can read correction history for payroll reporting, but cannot review.

## Future Expansion

When payroll reports are added, they should read approved correction requests alongside original time entries and show the approved proposed values as correction overlays. If the product later requires changing `time_entries`, that should be done by a manager-only RPC that writes a full audit log and should remain blocked for locked payroll periods.
