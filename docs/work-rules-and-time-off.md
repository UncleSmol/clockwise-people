# Work Rules and Time Off

The backend already has the core tables for work schedules and leave:

- `work_schedules`
- `schedule_days`
- `leave_types`
- `leave_balances`
- `leave_requests`
- `approval_requests`

This feature uses those tables instead of introducing a separate rules model.

## Work Rules

Company admins create work rules from **Company setup**. A work rule creates one
`work_schedules` row and seven `schedule_days` rows. Working days receive the
configured start time, end time, lunch minutes, and paid hours. Non-working days
are stored as inactive schedule days.

Admins can assign a work rule to an employee from the employee form. The
assignment is stored on `employees.work_schedule_id`, which is already used by
time-entry calculations.

## Time Off Rules

Company admins create time off rules as `leave_types`. A rule stores:

- category
- paid or unpaid flag
- attachment requirement
- yearly hours in `accrual_rules`

Company admins can edit existing time off rules from Company setup. Edits update
the existing `leave_types` row, so employee balances stay linked to the same
rule. Changes are written through `public.update_company_leave_type(...)` and
audited in `audit_logs`.

Admins assign a rule to an employee by creating or updating a `leave_balances`
row. This gives the employee visible available hours for that leave type.

## Requests

Employees submit time off through `public.submit_own_leave_request(...)`.
Submitted requests are stored in `leave_requests` and mirrored into
`approval_requests` as `leave_request` approvals.

Employees do not enter leave hours manually. The dashboard calls
`public.calculate_own_leave_request_hours(leave_type_id, start_date, end_date)`
to show the employee a server-calculated total before they submit. The result
includes available balance, remaining balance, and public holidays inside the
selected dates. When the request is submitted,
`public.submit_own_leave_request(...)` recalculates the hours again on the
server and stores that calculated total.

Leave hour calculation uses the employee's assigned `work_schedule_id` to decide
which days are working days. If the employee has no direct schedule, the latest
active company schedule is used. Normal Monday to Friday leave days deduct
exactly 8 hours per working day. Saturdays use the configured Saturday hours
from the employee or company work rule, because Saturday shifts are often
shorter. If there is no schedule, the fallback is Monday to Friday at 8 hours
per day.

Public holidays are stored in `company_public_holidays`. Any selected date that
matches a company public holiday is excluded from the requested leave hours.
Non-working days are also excluded.

Employees can only request time off from the balance they have for the selected
leave type. If the calculated hours are greater than the available balance, the
UI shows a warning and the backend rejects the request as well.

Managers review submitted requests through
`public.review_managed_leave_request(...)`. The same manager scope used for
timesheets is reused here through `public.can_manage_time_record(...)`, so
owners, HR admins, branch managers, and direct managers can review the employees
they are allowed to manage.

Approved requests reduce the matching leave balance by the approved hours and
increase taken hours.

## Employee Timesheet Grouping

Employee timesheets stay flat while there are fewer than seven records. Once the
employee has at least seven records, the UI groups entries into collapsible
weeks so older records stay easy to scan.
