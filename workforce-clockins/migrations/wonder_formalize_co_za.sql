-- ============================================================
-- Migration: Legacy timesheet data for wonder@formalize.co.za
-- Company ID: c096fb54-7018-43cb-8a4d-72f67004c785
-- Generated: 2026-07-29T18:10:37.249Z
-- Records: 84
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
  WHERE LOWER(email) = LOWER('wonder@formalize.co.za')
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  IF v_employee_id IS NULL THEN
    RAISE WARNING 'Employee not found: wonder@formalize.co.za — skipping migration';
    RETURN;
  END IF;

  -- Create parent timesheet for migrated entries
  INSERT INTO public.timesheets (company_id, employee_id, status, notes)
  VALUES (v_company_id, v_employee_id, 'draft', 'Migrated from legacy time tracker')
  RETURNING id INTO v_timesheet_id;

  -- Entry 1: 2025-12-01 09:00-17:08
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-01',
    '09:00', '13:03', '14:03', '17:08',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 2: 2025-12-02 07:45-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-02',
    '07:45', '14:06', '15:06', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 3: 2025-12-03 08:48-19:42
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-03',
    '08:48', '14:13', '15:13', '19:42',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 4: 2025-12-04 08:03-17:03
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-04',
    '08:03', '12:33', '13:33', '17:03',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 5: 2025-12-05 07:58-07:58
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-05',
    '07:58', NULL, NULL, '07:58',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 6: 2025-12-08 15:55-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-08',
    '15:55', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 7: 2025-12-09 07:45-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-09',
    '07:45', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 8: 2025-12-11 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-11',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 9: 2025-12-12 08:25-16:55
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-12',
    '08:25', '11:58', '16:31', '16:55',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 10: 2025-12-13 08:04-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-13',
    '08:04', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 11: 2025-12-15 (3.8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-15',
    NULL, NULL, NULL, NULL,
    3.80, 0, 3.80, 3.80, 0,
    false, false, false,
    'approved',
    'Time-off: 3.8h'
  );

  -- Entry 12: 2025-12-16 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-16',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 13: 2025-12-17 08:01-08:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-17',
    '08:01', NULL, NULL, '08:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 14: 2025-12-18 08:06-08:06
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-18',
    '08:06', NULL, NULL, '08:06',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 15: 2025-12-19 08:17-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-19',
    '08:17', NULL, NULL, '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 16: 2025-12-22 08:02-17:05
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-22',
    '08:02', NULL, NULL, '17:05',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 17: 2025-12-24 08:07-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-24',
    '08:07', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 18: 2025-12-25 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-25',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 19: 2025-12-26 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-26',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 20: 2025-12-27 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-27',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 21: 2025-12-29 16:32-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-29',
    '16:32', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 22: 2026-01-01 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-01',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 23: 2026-01-02 08:02-08:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-02',
    '08:02', NULL, NULL, '08:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 24: 2026-01-03 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-03',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 25: 2026-01-05 08:12-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-05',
    '08:12', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 26: 2026-01-06 14:52-17:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-06',
    '14:52', '13:52', '14:52', '17:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 27: 2026-01-07 17:02-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-07',
    '17:02', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 28: 2026-01-12 14:30-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-12',
    '14:30', '13:30', '14:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 29: 2026-01-13 14:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-13',
    '14:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 30: 2026-01-19 16:05-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-19',
    '16:05', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 31: 2026-01-21 15:58-15:58
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-21',
    '15:58', NULL, NULL, '15:58',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 32: 2026-01-23 13:55-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-23',
    '13:55', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 33: 2026-01-27 14:15-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-27',
    '14:15', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 34: 2026-02-06 15:15-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-06',
    '15:15', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 35: 2026-02-07 00:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-07',
    '00:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 36: 2026-02-09 15:02-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-09',
    '15:02', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 37: 2026-02-10 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-10',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 38: 2026-02-11 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-11',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 39: 2026-02-16 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-16',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 40: 2026-02-17 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-17',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 41: 2026-02-18 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-18',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 42: 2026-02-23 14:08-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-23',
    '14:08', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 43: 2026-02-27 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-27',
    '08:00', '10:30', '11:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 44: 2026-03-05 15:11-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-05',
    '15:11', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 45: 2026-03-06 16:22-16:59
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-06',
    '16:22', NULL, NULL, '16:59',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 46: 2026-03-08 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-08',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 47: 2026-03-10 08:02-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-10',
    '08:02', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 48: 2026-03-11 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-11',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 49: 2026-03-18 08:00-08:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-18',
    '08:00', NULL, NULL, '08:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 50: 2026-03-19 08:03-18:19
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-19',
    '08:03', '14:37', '15:33', '18:19',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 51: 2026-03-20 08:03-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-20',
    '08:03', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 52: 2026-03-21 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-21',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 53: 2026-03-23 15:21-15:21
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-23',
    '15:21', NULL, NULL, '15:21',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 54: 2026-03-25 16:56-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-25',
    '16:56', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 55: 2026-03-26 14:16-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-26',
    '14:16', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 56: 2026-03-30 08:00-14:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-30',
    '08:00', NULL, NULL, '14:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 57: 2026-04-01 16:59-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-01',
    '16:59', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 58: 2026-04-03 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-03',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 59: 2026-04-04 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-04',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 60: 2026-04-06 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-06',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 61: 2026-04-08 16:24-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-08',
    '16:24', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 62: 2026-04-09 15:41-00:16
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-09',
    '15:41', NULL, NULL, '00:16',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 63: 2026-04-13 08:00-14:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-13',
    '08:00', NULL, NULL, '14:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 64: 2026-04-14 07:57-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-14',
    '07:57', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 65: 2026-04-15 14:08-14:08
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-15',
    '14:08', NULL, NULL, '14:08',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 66: 2026-04-16 15:52-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-16',
    '15:52', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 67: 2026-04-20 14:56-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-20',
    '14:56', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 68: 2026-04-21 07:54-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-21',
    '07:54', NULL, NULL, '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 69: 2026-04-22 14:04-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-22',
    '14:04', '13:04', '14:04', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 70: 2026-04-23 14:18-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-23',
    '14:18', '13:18', '14:18', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 71: 2026-04-29 13:45-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-29',
    '13:45', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 72: 2026-05-05 16:36-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-05',
    '16:36', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 73: 2026-05-13 13:02-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-13',
    '13:02', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 74: 2026-05-15 14:11-17:09
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-15',
    '14:11', '13:11', '14:11', '17:09',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 75: 2026-05-16 07:50-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-16',
    '07:50', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 76: 2026-05-21 13:09-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-21',
    '13:09', '12:09', '13:09', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 77: 2026-05-25 08:02-17:09
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-25',
    '08:02', '14:06', '15:06', '17:09',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 78: 2026-07-02 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-02',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 79: 2026-07-03 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-03',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 80: 2026-07-04 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-04',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 81: 2026-07-05 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-05',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 82: 2026-07-06 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-06',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 83: 2026-07-07 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-07',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 84: 2026-07-08 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-08',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

END $$;

COMMIT;
