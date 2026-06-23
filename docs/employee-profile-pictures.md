# Employee Profile Pictures

Employees can maintain lightweight profile details from **Account**:

- preferred name
- work email
- phone number
- profile picture link

Profile pictures are link-only for now. The database stores the value on
`public.employees.avatar_url` and enforces `http://` or `https://` URLs. Empty
values are saved as `null`.

Employees update their own profile through
`public.update_own_employee_profile(...)`. The function is security-definer and
only updates the employee row linked to the active authenticated user. It does
not allow employees to edit payroll, employment, branch, department, manager, or
legal name fields.

The same avatar field is selected anywhere employee identity is displayed:

- account profile
- employee dashboard
- employee directory
- employee detail page
- live workforce
- manager correction requests
- manager timesheet approvals

The frontend uses a shared `EmployeeAvatar` component. It renders the linked
image when available and falls back to initials if the link is blank or fails to
load.
