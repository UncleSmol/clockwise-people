-- Production Performance & Concurrency Indexes
-- Optimizes queries for hundreds of concurrent users across time tracking,
-- employee lookups, role checks, and dashboard queues.

-- 1. Time Entries (High frequency queries)
CREATE INDEX IF NOT EXISTS idx_time_entries_company_work_date 
  ON public.time_entries(company_id, work_date);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee_work_date 
  ON public.time_entries(employee_id, work_date DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_company_status_active 
  ON public.time_entries(company_id, status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_company_employee_date 
  ON public.time_entries(company_id, employee_id, work_date);

-- 2. Time Clock Events
CREATE INDEX IF NOT EXISTS idx_time_clock_events_company_work_date 
  ON public.time_clock_events(company_id, local_work_date);

CREATE INDEX IF NOT EXISTS idx_time_clock_events_employee_event_desc 
  ON public.time_clock_events(employee_id, event_at DESC);

-- 3. Employees
CREATE INDEX IF NOT EXISTS idx_employees_company_status 
  ON public.employees(company_id, employment_status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_manager 
  ON public.employees(company_id, manager_employee_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_user_company 
  ON public.employees(user_id, company_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_email_lookup 
  ON public.employees(lower(email), company_id) 
  WHERE deleted_at IS NULL;

-- 4. Users & Roles (Authentication & Access checks on every request)
CREATE INDEX IF NOT EXISTS idx_users_auth_active 
  ON public.users(auth_user_id, status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_company_active 
  ON public.users(company_id, status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_company_active 
  ON public.user_roles(user_id, company_id) 
  WHERE revoked_at IS NULL;

-- 5. Timesheet Correction Requests
CREATE INDEX IF NOT EXISTS idx_correction_requests_comp_status 
  ON public.timesheet_correction_requests(company_id, status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_correction_requests_emp_status 
  ON public.timesheet_correction_requests(employee_id, status) 
  WHERE deleted_at IS NULL;

-- 6. Leave Requests & Balances
CREATE INDEX IF NOT EXISTS idx_leave_requests_comp_status 
  ON public.leave_requests(company_id, status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_emp_dates 
  ON public.leave_requests(employee_id, start_date, end_date) 
  WHERE deleted_at IS NULL;

-- 7. Public Holidays & Schedules
CREATE INDEX IF NOT EXISTS idx_company_public_holidays_comp_date 
  ON public.company_public_holidays(company_id, holiday_date) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_days_lookup 
  ON public.schedule_days(work_schedule_id, day_of_week);
