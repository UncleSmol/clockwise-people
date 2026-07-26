insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.7.26-form-icons-branch-removal-employee-calc',
  'Form icons, branch removal, and employee auto-calc',
  'Icons added across all forms, branches fully replaced by workstations, and hourly rate auto-calculates from monthly salary.',
  array[
    'Added icons to all input fields across employee, company profile, work rules, and setup forms.',
    'Removed all branches() auto-joins from employee queries.',
    'Dropped branches table, employees.branch_id, and user_branch_assignments.',
    'Employee hourly rate now auto-calculates: monthly_salary / standard_monthly_hours.',
    'Employee employee_number type corrected to text.',
    'Company setup panel restructured with collapsible sections.',
    'Removed inline helper texts from EmployeeForm.'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at,
    is_published = true,
    updated_at = now();

update public.app_updates
set published_at = now(),
    updated_at = now()
where version = '2026.7.26-form-icons-branch-removal-employee-calc';
