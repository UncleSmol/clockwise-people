-- ============================================================
-- Migration: Legacy timesheet data for tintswalo@formalize.co.za
-- Company ID: c096fb54-7018-43cb-8a4d-72f67004c785
-- Generated: 2026-07-29T18:10:37.259Z
-- Records: 155
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
  WHERE LOWER(email) = LOWER('tintswalo@formalize.co.za')
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  IF v_employee_id IS NULL THEN
    RAISE WARNING 'Employee not found: tintswalo@formalize.co.za — skipping migration';
    RETURN;
  END IF;

  -- Create parent timesheet for migrated entries
  INSERT INTO public.timesheets (company_id, employee_id, status, notes)
  VALUES (v_company_id, v_employee_id, 'draft', 'Migrated from legacy time tracker')
  RETURNING id INTO v_timesheet_id;

  -- Entry 1: 2025-12-01 08:00-17:00 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-01',
    '08:00', '11:11', '15:17', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    'Includes 5h time-off from legacy system'
  );

  -- Entry 2: 2025-12-02 08:04-17:05
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-02',
    '08:04', '15:00', '16:00', '17:05',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 3: 2025-12-03 08:00-17:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-03',
    '08:00', '15:05', '15:45', '17:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 4: 2025-12-04 08:00-14:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-04',
    '08:00', '14:02', NULL, '14:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 5: 2025-12-05 08:00-17:07
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-05',
    '08:00', '10:35', '14:09', '17:07',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 6: 2025-12-06 08:02-12:42
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-06',
    '08:02', NULL, NULL, '12:42',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 7: 2025-12-08 08:15-17:17
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-08',
    '08:15', '12:03', '12:54', '17:17',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 8: 2025-12-09 08:04-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-09',
    '08:04', '11:42', '16:09', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 9: 2025-12-10 08:01-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-10',
    '08:01', '12:31', '13:31', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 10: 2025-12-11 12:06-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-11',
    '12:06', '12:11', '13:11', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 11: 2025-12-12 08:02-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-12',
    '08:02', '13:00', '13:32', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 12: 2025-12-13 08:04-13:00
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
    'approved',
    NULL
  );

  -- Entry 13: 2025-12-15 00:00-17:06
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-15',
    '00:00', '13:03', '14:01', '17:06',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 14: 2025-12-16 (8h)
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

  -- Entry 15: 2025-12-17 08:01-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-17',
    '08:01', '14:25', '15:03', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 16: 2025-12-18 08:00-14:31
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-18',
    '08:00', '14:31', NULL, '14:31',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 17: 2025-12-19 08:02-08:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-19',
    '08:02', NULL, NULL, '08:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 18: 2025-12-20 08:00-08:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-20',
    '08:00', NULL, NULL, '08:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 19: 2025-12-22 08:07-08:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-22',
    '08:07', '14:00', '14:50', '08:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 20: 2025-12-23 08:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-23',
    '08:00', '14:49', '15:49', '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 21: 2025-12-24 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-24',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 22: 2025-12-25 (8h)
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

  -- Entry 23: 2025-12-26 (8h)
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

  -- Entry 24: 2025-12-27 (5h)
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

  -- Entry 25: 2025-12-29 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-29',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 26: 2025-12-30 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-30',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 27: 2026-01-01 (8h)
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

  -- Entry 28: 2026-01-03 (10h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-03',
    NULL, NULL, NULL, NULL,
    10.00, 0, 10.00, 10.00, 0,
    false, false, false,
    'approved',
    'Time-off: 10h'
  );

  -- Entry 29: 2026-01-05 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-05',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 30: 2026-01-06 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-06',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 31: 2026-01-07 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-07',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 32: 2026-01-08 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-08',
    '08:00', '14:05', '15:05', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 33: 2026-01-09 08:14-18:07
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-09',
    '08:14', '12:07', '13:07', '18:07',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 34: 2026-01-10 08:00-13:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-10',
    '08:00', NULL, NULL, '13:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 35: 2026-01-12 08:03-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-12',
    '08:03', '14:48', '15:48', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 36: 2026-01-13 08:00-17:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-13',
    '08:00', '17:03', '17:04', '17:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 37: 2026-01-14 15:49-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-14',
    '15:49', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 38: 2026-01-15 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-15',
    '08:00', '14:37', '15:37', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 39: 2026-01-19 15:18-17:05
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-19',
    '15:18', NULL, NULL, '17:05',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 40: 2026-01-20 08:01-17:35
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-20',
    '08:01', NULL, NULL, '17:35',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 41: 2026-01-21 08:01-17:26
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-21',
    '08:01', '13:03', '13:57', '17:26',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 42: 2026-01-22 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-22',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 43: 2026-01-23 08:01-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-23',
    '08:01', '15:06', '15:55', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 44: 2026-01-24 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-24',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 45: 2026-01-26 08:08-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-26',
    '08:08', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 46: 2026-01-27 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-27',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 47: 2026-01-28 08:08-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-28',
    '08:08', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 48: 2026-01-29 08:01-17:07
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-29',
    '08:01', '14:01', '15:01', '17:07',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 49: 2026-01-30 08:00-17:11
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-30',
    '08:00', NULL, NULL, '17:11',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 50: 2026-02-02 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-02',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 51: 2026-02-03 08:01-17:30
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-03',
    '08:01', '13:11', '14:00', '17:30',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 52: 2026-02-04 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-04',
    '08:00', '14:07', '15:07', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 53: 2026-02-05 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-05',
    '08:00', '13:37', '14:36', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 54: 2026-02-06 08:02-17:17
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-06',
    '08:02', '13:15', '14:06', '17:17',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 55: 2026-02-07 08:03-08:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-07',
    '08:03', NULL, NULL, '08:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 56: 2026-02-09 00:00-08:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-09',
    '00:00', NULL, NULL, '08:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 57: 2026-02-10 08:01-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-10',
    '08:01', '15:27', '16:27', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 58: 2026-02-11 08:00-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-11',
    '08:00', NULL, NULL, '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 59: 2026-02-12 08:00-17:20
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-12',
    '08:00', NULL, NULL, '17:20',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 60: 2026-02-13 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-13',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 61: 2026-02-14 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-14',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 62: 2026-02-16 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-16',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 63: 2026-02-17 08:00-14:25
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-17',
    '08:00', NULL, NULL, '14:25',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 64: 2026-02-18 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-18',
    '08:00', '14:12', '14:55', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 65: 2026-02-19 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-19',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 66: 2026-02-20 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-20',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 67: 2026-02-21 08:01-13:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-21',
    '08:01', NULL, NULL, '13:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 68: 2026-02-23 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-23',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 69: 2026-02-24 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-24',
    '08:00', '13:05', '14:05', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 70: 2026-02-26 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-26',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 71: 2026-02-27 08:00-17:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-27',
    '08:00', NULL, NULL, '17:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 72: 2026-03-02 08:00-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-02',
    '08:00', '14:06', '15:06', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 73: 2026-03-03 08:00-08:05
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-03',
    '08:00', NULL, NULL, '08:05',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 74: 2026-03-04 08:12-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-04',
    '08:12', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 75: 2026-03-06 16:07-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-06',
    '16:07', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 76: 2026-03-10 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-10',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 77: 2026-03-11 08:00-17:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-11',
    '08:00', '13:41', '14:41', '17:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 78: 2026-03-12 08:00-13:30
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-12',
    '08:00', '15:46', '16:46', '13:30',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 79: 2026-03-13 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-13',
    '00:00', '13:30', '14:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 80: 2026-03-16 08:00-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-16',
    '08:00', '15:00', '16:00', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 81: 2026-03-17 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-17',
    '00:00', '13:32', '14:32', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 82: 2026-03-18 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-18',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 83: 2026-03-19 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-19',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 84: 2026-03-20 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-20',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 85: 2026-03-21 (8h)
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

  -- Entry 86: 2026-03-23 08:00-17:12
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-23',
    '08:00', '13:45', '14:45', '17:12',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 87: 2026-03-24 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-24',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 88: 2026-03-25 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-25',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 89: 2026-03-26 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-26',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 90: 2026-03-27 08:02-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-27',
    '08:02', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 91: 2026-03-28 08:21-15:36
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-28',
    '08:21', NULL, NULL, '15:36',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 92: 2026-03-30 08:00-17:03
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-30',
    '08:00', '15:36', '16:36', '17:03',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 93: 2026-03-31 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-31',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 94: 2026-04-01 00:00-17:07
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-01',
    '00:00', '12:02', '13:02', '17:07',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 95: 2026-04-02 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-02',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 96: 2026-04-03 (8h)
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

  -- Entry 97: 2026-04-04 (8h)
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

  -- Entry 98: 2026-04-06 (8h)
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

  -- Entry 99: 2026-04-07 08:03-17:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-07',
    '08:03', '14:37', '15:17', '17:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 100: 2026-04-08 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-08',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 101: 2026-04-09 08:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-09',
    '08:00', '15:07', '16:07', '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 102: 2026-04-10 08:00-17:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-10',
    '08:00', '14:04', '15:04', '17:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 103: 2026-04-11 08:11-13:17
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-11',
    '08:11', NULL, NULL, '13:17',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 104: 2026-04-13 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-13',
    '08:00', '15:17', '16:17', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 105: 2026-04-14 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-14',
    '08:00', '14:44', '15:44', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 106: 2026-04-15 08:00-11:32
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-15',
    '08:00', NULL, NULL, '11:32',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 107: 2026-04-16 08:03-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-16',
    '08:03', '15:13', '16:13', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 108: 2026-04-17 07:59-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-17',
    '07:59', '13:37', '14:21', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 109: 2026-04-18 00:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-18',
    '00:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 110: 2026-04-19 00:00-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-19',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 111: 2026-04-20 00:00-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-20',
    '00:00', '14:12', '15:12', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 112: 2026-04-21 08:01-16:59
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-21',
    '08:01', '13:43', '14:23', '16:59',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 113: 2026-04-22 08:03-17:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-22',
    '08:03', '14:53', '15:53', '17:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 114: 2026-04-23 08:00-15:49
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-23',
    '08:00', '15:49', '14:55', '15:49',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 115: 2026-04-24 00:00-14:55 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-24',
    '00:00', NULL, NULL, '14:55',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    'Includes 8h time-off from legacy system'
  );

  -- Entry 116: 2026-04-25 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-25',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 117: 2026-04-28 08:05-17:09
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-28',
    '08:05', '14:37', '15:21', '17:09',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 118: 2026-04-29 08:00-16:56
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-29',
    '08:00', '16:05', '16:56', '16:56',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 119: 2026-04-30 08:02-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-30',
    '08:02', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 120: 2026-05-01 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-01',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 121: 2026-05-05 16:03-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-05',
    '16:03', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 122: 2026-05-09 00:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-09',
    '00:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 123: 2026-05-15 (1h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-15',
    NULL, NULL, NULL, NULL,
    1.00, 0, 1.00, 1.00, 0,
    false, false, false,
    'approved',
    'Time-off: 1h'
  );

  -- Entry 124: 2026-05-16 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-16',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 125: 2026-05-25 15:22-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-25',
    '15:22', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 126: 2026-05-27 10:13-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-27',
    '10:13', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 127: 2026-05-28 08:01-00:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-28',
    '08:01', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 128: 2026-05-29 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-29',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 129: 2026-05-30 08:22-08:44
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-30',
    '08:22', NULL, NULL, '08:44',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 130: 2026-05-31 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-31',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 131: 2026-06-01 08:00-16:56
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-01',
    '08:00', '13:26', '14:09', '16:56',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 132: 2026-06-02 08:00-17:00 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-02',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    'Includes 8h time-off from legacy system'
  );

  -- Entry 133: 2026-06-03 08:00-07:59
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-03',
    '08:00', '14:50', '15:50', '07:59',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 134: 2026-06-04 00:00-14:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-04',
    '00:00', NULL, NULL, '14:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 135: 2026-06-05 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-05',
    '08:00', '14:39', '15:24', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 136: 2026-06-06 08:00-14:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-06',
    '08:00', NULL, NULL, '14:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 137: 2026-06-08 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-08',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 138: 2026-06-09 08:02-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-09',
    '08:02', '12:00', '13:00', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 139: 2026-06-10 16:06-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-10',
    '16:06', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 140: 2026-06-18 07:46-17:03
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-18',
    '07:46', NULL, NULL, '17:03',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 141: 2026-06-19 08:00-07:15
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-19',
    '08:00', NULL, NULL, '07:15',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 142: 2026-06-20 00:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-20',
    '00:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 143: 2026-06-22 07:35-08:10
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-22',
    '07:35', NULL, NULL, '08:10',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 144: 2026-06-23 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-23',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 145: 2026-06-24 14:21-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-24',
    '14:21', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 146: 2026-06-26 15:43-17:27
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-26',
    '15:43', '14:43', '15:43', '17:27',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 147: 2026-06-27 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-27',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 148: 2026-06-29 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-29',
    '08:00', '12:00', '13:00', '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 149: 2026-06-30 08:00-16:48
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-30',
    '08:00', '13:47', '14:47', '16:48',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 150: 2026-07-03 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-03',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 151: 2026-07-04 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-04',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 152: 2026-07-13 14:40-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-13',
    '14:40', '13:40', '14:40', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 153: 2026-07-15 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-15',
    '08:00', '14:03', '15:03', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 154: 2026-07-17 07:36-16:41
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-17',
    '07:36', '13:20', '14:20', '16:41',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 155: 2026-07-18 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-18',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

END $$;

COMMIT;
