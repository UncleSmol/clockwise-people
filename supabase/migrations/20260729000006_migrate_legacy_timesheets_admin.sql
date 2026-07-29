-- ============================================================
-- Migration: Legacy timesheet data for admin@formalize.co.za
-- Company ID: c096fb54-7018-43cb-8a4d-72f67004c785
-- Generated: 2026-07-29T18:10:37.261Z
-- Records: 5
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_company_id CONSTANT uuid := 'c096fb54-7018-43cb-8a4d-72f67004c785';
  v_employee_id uuid;
  v_timesheet_id uuid;
BEGIN

  -- Look up employee by email (case-insensitive)
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE LOWER(email) = LOWER('admin@formalize.co.za')
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  IF v_employee_id IS NULL THEN
    RAISE WARNING 'Employee not found: admin@formalize.co.za — skipping migration';
    RETURN;
  END IF;

  -- Create parent timesheet for migrated entries
  INSERT INTO public.timesheets (company_id, employee_id, status, notes)
  VALUES (v_company_id, v_employee_id, 'draft', 'Migrated from legacy time tracker')
  RETURNING id INTO v_timesheet_id;

  -- Entry 1: 2025-12-01 13:58-16:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-01',
    '13:58', NULL, NULL, '16:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 2: 2025-12-02 08:02-17:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-02',
    '08:02', '14:51', '15:51', '17:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 3: 2025-12-03 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-03',
    '08:00', '11:30', '12:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 4: 2025-12-04 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-04',
    '08:00', '10:30', '11:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 5: 2026-05-15 16:29-19:06
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-15',
    '16:29', NULL, NULL, '19:06',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

END $$;

COMMIT;
