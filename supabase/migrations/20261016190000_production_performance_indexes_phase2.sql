-- Phase 2 Production Performance & Concurrency Indexes
-- Covers high-frequency foreign keys, workstation assignments, payslips, leave balances, and department lookups.

-- 1. Company Payslips (High-volume payroll calculations & history lookups)
CREATE INDEX IF NOT EXISTS idx_company_payslips_company_period 
  ON public.company_payslips(company_id, period_start_date, period_end_date);

CREATE INDEX IF NOT EXISTS idx_company_payslips_employee_period 
  ON public.company_payslips(employee_id, period_start_date, period_end_date);

-- 2. Employee Workstation Assignments & Geofencing
CREATE INDEX IF NOT EXISTS idx_emp_workstation_assign_comp_active 
  ON public.employee_workstation_assignments(company_id, is_active) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_emp_workstation_assign_emp_active 
  ON public.employee_workstation_assignments(employee_id, is_active) 
  WHERE deleted_at IS NULL;

-- 3. Company Workstations
CREATE INDEX IF NOT EXISTS idx_company_workstations_comp_active 
  ON public.company_workstations(company_id, is_active) 
  WHERE deleted_at IS NULL;

-- 4. Departments
CREATE INDEX IF NOT EXISTS idx_departments_comp_active 
  ON public.departments(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_departments_workstation 
  ON public.departments(workstation_id);

-- 5. Employees foreign keys & status lookups
CREATE INDEX IF NOT EXISTS idx_employees_department 
  ON public.employees(company_id, department_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_workstation 
  ON public.employees(company_id, workstation_id) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_work_schedule 
  ON public.employees(company_id, work_schedule_id) 
  WHERE deleted_at IS NULL;

-- 6. Leave Balances
CREATE INDEX IF NOT EXISTS idx_leave_balances_comp_emp_type 
  ON public.leave_balances(company_id, employee_id, leave_type_id);

-- 7. Employee Work Schedule Assignments
CREATE INDEX IF NOT EXISTS idx_emp_sched_assign_comp_emp 
  ON public.employee_work_schedule_assignments(company_id, employee_id, is_active) 
  WHERE deleted_at IS NULL;
