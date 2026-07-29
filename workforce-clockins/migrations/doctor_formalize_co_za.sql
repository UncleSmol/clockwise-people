-- ============================================================
-- Migration: Legacy timesheet data for doctor@formalize.co.za
-- Company ID: c096fb54-7018-43cb-8a4d-72f67004c785
-- Generated: 2026-07-29T18:10:37.256Z
-- Records: 135
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
  WHERE LOWER(email) = LOWER('doctor@formalize.co.za')
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  IF v_employee_id IS NULL THEN
    RAISE WARNING 'Employee not found: doctor@formalize.co.za — skipping migration';
    RETURN;
  END IF;

  -- Create parent timesheet for migrated entries
  INSERT INTO public.timesheets (company_id, employee_id, status, notes)
  VALUES (v_company_id, v_employee_id, 'draft', 'Migrated from legacy time tracker')
  RETURNING id INTO v_timesheet_id;

  -- Entry 1: 2025-12-01 09:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-01',
    '09:00', '12:00', '16:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 2: 2025-12-02 07:31-17:34
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-02',
    '07:31', '12:32', '13:32', '17:34',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 3: 2025-12-03 07:03-17:59
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-03',
    '07:03', '14:38', '15:04', '17:59',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 4: 2025-12-04 08:04-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-04',
    '08:04', '10:46', '13:59', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 5: 2025-12-05 08:02-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-05',
    '08:02', '12:14', '12:43', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 6: 2025-12-06 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-06',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 7: 2025-12-08 14:39-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-08',
    '14:39', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 8: 2025-12-09 08:00-17:24
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-09',
    '08:00', '11:13', '14:52', '17:24',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 9: 2025-12-10 08:00-17:10
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-10',
    '08:00', '11:49', '12:49', '17:10',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 10: 2025-12-11 09:19-17:25
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-11',
    '09:19', '12:04', '12:04', '17:25',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 11: 2025-12-12 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-12',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 12: 2025-12-13 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-13',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 13: 2025-12-15 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-15',
    '08:00', NULL, NULL, '17:00',
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

  -- Entry 15: 2025-12-17 08:00-17:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-17',
    '08:00', '13:42', '14:25', '17:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 16: 2025-12-18 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-18',
    '08:00', '13:57', '14:10', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 17: 2025-12-19 08:00-17:06
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-19',
    '08:00', '14:39', '14:54', '17:06',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 18: 2025-12-20 08:00-13:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-20',
    '08:00', NULL, NULL, '13:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 19: 2025-12-22 08:00-17:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-22',
    '08:00', '17:04', '17:04', '17:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 20: 2025-12-23 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-23',
    '08:00', '14:51', '15:51', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 21: 2025-12-24 08:00-18:23
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-24',
    '08:00', '18:23', '18:23', '18:23',
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

  -- Entry 25: 2025-12-29 08:00-18:08
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-29',
    '08:00', '18:08', '18:08', '18:08',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 26: 2025-12-30 08:05-17:06
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-30',
    '08:05', '12:40', '13:40', '17:06',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 27: 2025-12-31 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2025-12-31',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 28: 2026-01-01 (8h)
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

  -- Entry 29: 2026-01-02 08:09-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-02',
    '08:09', '12:05', '12:06', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 30: 2026-01-03 (5h)
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

  -- Entry 31: 2026-01-05 08:18-17:07
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-05',
    '08:18', '12:04', '13:04', '17:07',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 32: 2026-01-06 08:10-17:10
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-06',
    '08:10', '17:10', '17:10', '17:10',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 33: 2026-01-07 08:08-07:39
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-07',
    '08:08', '14:13', '15:13', '07:39',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 34: 2026-01-08 08:00-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-08',
    '08:00', '12:55', '13:07', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 35: 2026-01-09 08:00-17:17
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-09',
    '08:00', '13:40', '14:40', '17:17',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 36: 2026-01-10 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-10',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 37: 2026-01-12 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-12',
    '08:00', '14:47', '15:47', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 38: 2026-01-13 08:00-17:09
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-13',
    '08:00', '13:30', '14:30', '17:09',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 39: 2026-01-14 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-14',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 40: 2026-01-15 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-15',
    '08:00', '13:10', '14:10', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 41: 2026-01-16 08:00-19:06
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-16',
    '08:00', '14:55', '15:55', '19:06',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 42: 2026-01-17 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-17',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 43: 2026-01-21 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-21',
    '08:00', '13:39', '14:39', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 44: 2026-01-22 07:59-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-22',
    '07:59', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 45: 2026-01-26 08:00-19:40
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-26',
    '08:00', '13:05', '14:05', '19:40',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 46: 2026-01-27 08:01-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-27',
    '08:01', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 47: 2026-01-28 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-28',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 48: 2026-01-29 08:00-07:55
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-29',
    '08:00', NULL, NULL, '07:55',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 49: 2026-01-30 00:00-12:54
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-01-30',
    '00:00', NULL, NULL, '12:54',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 50: 2026-02-02 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-02',
    '08:00', '16:04', '17:04', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 51: 2026-02-04 14:34-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-04',
    '14:34', '13:34', '14:34', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 52: 2026-02-06 08:00-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-06',
    '08:00', NULL, NULL, '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 53: 2026-02-07 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-07',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 54: 2026-02-09 08:05-17:04
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-09',
    '08:05', '17:04', '17:04', '17:04',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 55: 2026-02-11 08:00-17:08
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-11',
    '08:00', '12:35', '13:35', '17:08',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 56: 2026-02-12 08:00-19:08 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-12',
    '08:00', NULL, NULL, '19:08',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    'Includes 8h time-off from legacy system'
  );

  -- Entry 57: 2026-02-13 08:00-13:53
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-13',
    '08:00', '12:53', '13:53', '13:53',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 58: 2026-02-14 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-14',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 59: 2026-02-18 08:00-18:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-18',
    '08:00', '13:13', '14:13', '18:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 60: 2026-02-23 08:00-17:00
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
    'draft',
    NULL
  );

  -- Entry 61: 2026-02-25 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-25',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 62: 2026-02-26 08:00-18:07
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-26',
    '08:00', NULL, NULL, '18:07',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 63: 2026-02-27 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-27',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 64: 2026-02-28 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-02-28',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 65: 2026-03-02 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-02',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 66: 2026-03-03 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-03',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 67: 2026-03-06 08:00-10:26
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-06',
    '08:00', '10:26', '10:26', '10:26',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 68: 2026-03-07 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-07',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 69: 2026-03-10 08:00-17:00 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-10',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    'Includes 8h time-off from legacy system'
  );

  -- Entry 70: 2026-03-11 00:00-00:00 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-11',
    '00:00', NULL, NULL, '00:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    'Includes 8h time-off from legacy system'
  );

  -- Entry 71: 2026-03-12 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-12',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 72: 2026-03-14 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-14',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 73: 2026-03-17 (7.666666666666667h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-17',
    NULL, NULL, NULL, NULL,
    7.67, 0, 7.67, 7.67, 0,
    false, false, false,
    'approved',
    'Time-off: 7.666666666666667h'
  );

  -- Entry 74: 2026-03-18 00:00-17:00 (8h)
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
    'Includes 8h time-off from legacy system'
  );

  -- Entry 75: 2026-03-19 16:24-17:00 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-19',
    '16:24', '15:24', '16:24', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    'Includes 8h time-off from legacy system'
  );

  -- Entry 76: 2026-03-20 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-20',
    '08:00', '11:52', '12:52', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 77: 2026-03-21 (8h)
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

  -- Entry 78: 2026-03-23 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-23',
    '08:00', '13:15', '14:15', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 79: 2026-03-24 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-24',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 80: 2026-03-25 08:00-08:23
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-25',
    '08:00', NULL, NULL, '08:23',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 81: 2026-03-26 00:00-17:11
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-03-26',
    '00:00', NULL, NULL, '17:11',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 82: 2026-04-03 (8h)
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

  -- Entry 83: 2026-04-04 (8h)
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

  -- Entry 84: 2026-04-06 (8h)
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

  -- Entry 85: 2026-04-09 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-09',
    '08:00', '17:54', '17:54', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 86: 2026-04-10 14:11-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-10',
    '14:11', '13:11', '14:11', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 87: 2026-04-11 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-11',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 88: 2026-04-13 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-13',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 89: 2026-04-14 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-14',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 90: 2026-04-15 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-15',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 91: 2026-04-16 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-16',
    '08:00', '12:46', '13:46', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 92: 2026-04-17 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-17',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 93: 2026-04-18 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-18',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 94: 2026-04-20 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-20',
    '08:00', '14:56', '15:56', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 95: 2026-04-21 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-21',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 96: 2026-04-22 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-22',
    '08:00', '13:25', '14:25', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 97: 2026-04-23 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-23',
    '08:00', '14:55', '15:55', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 98: 2026-04-24 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-24',
    '08:00', '14:19', '15:19', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 99: 2026-04-25 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-25',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 100: 2026-04-28 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-28',
    '08:00', '10:45', '11:45', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 101: 2026-04-29 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-29',
    '08:00', '14:18', '15:18', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 102: 2026-04-30 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-30',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 103: 2026-05-05 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-05',
    '08:00', '12:26', '13:26', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 104: 2026-05-06 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-06',
    '08:00', '14:00', '15:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 105: 2026-05-07 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-07',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 106: 2026-05-08 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-08',
    '08:00', '13:00', '14:00', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 107: 2026-05-09 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-09',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 108: 2026-05-11 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-11',
    '08:00', '13:37', '14:37', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 109: 2026-05-12 08:00-13:30
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-12',
    '08:00', '13:30', '14:00', '13:30',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 110: 2026-05-13 14:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-13',
    '14:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 111: 2026-05-14 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-14',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 112: 2026-05-15 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-15',
    '08:00', '13:25', '14:25', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 113: 2026-05-16 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-16',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 114: 2026-05-18 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-18',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 115: 2026-05-19 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-19',
    '08:00', '13:35', '14:35', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 116: 2026-05-20 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-20',
    '08:00', '14:26', '15:26', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 117: 2026-05-21 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-21',
    '08:00', '15:28', '16:28', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 118: 2026-05-22 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-22',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 119: 2026-05-23 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-23',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 120: 2026-05-25 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-25',
    '08:00', '13:23', '14:23', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 121: 2026-05-26 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-26',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 122: 2026-05-27 08:00-15:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-27',
    '08:00', NULL, NULL, '15:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 123: 2026-05-28 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-28',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 124: 2026-05-29 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-29',
    '08:00', '14:09', '15:09', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 125: 2026-05-30 08:00-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-30',
    '08:00', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 126: 2026-06-01 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-01',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 127: 2026-06-02 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-02',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 128: 2026-06-03 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-03',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 129: 2026-06-04 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-04',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 130: 2026-06-05 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-05',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 131: 2026-06-06 08:05-13:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-06',
    '08:05', NULL, NULL, '13:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 132: 2026-06-08 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-08',
    '08:00', '12:30', '13:30', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 133: 2026-06-09 08:09-08:21
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-09',
    '08:09', NULL, NULL, '08:21',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 134: 2026-06-10 00:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-06-10',
    '00:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

  -- Entry 135: 2026-07-14 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-07-14',
    '08:00', NULL, NULL, '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'draft',
    NULL
  );

END $$;

COMMIT;
