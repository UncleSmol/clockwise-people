-- ============================================================
-- Migration: Legacy timesheet data for maphangaprecious57@gmail.com
-- Company ID: c096fb54-7018-43cb-8a4d-72f67004c785
-- Generated: 2026-07-29T18:10:37.262Z
-- Records: 16
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
  WHERE LOWER(email) = LOWER('maphangaprecious57@gmail.com')
    AND company_id = v_company_id
    AND deleted_at IS NULL;

  -- Create employee if not found
  IF v_employee_id IS NULL THEN
    INSERT INTO public.employees (
      company_id, employee_number, full_name, email, workstation_id, start_date,
      employment_type, employment_status, compensation_type
    ) VALUES (
      v_company_id, 'EMP-0006', 'Precious Maphanga', 'maphangaprecious57@gmail.com',
      'f21c0083-c1c5-46b0-a6ef-15f0b37fc62a', '2026-04-24',
      'full_time', 'active', 'monthly'
    )
    RETURNING id INTO v_employee_id;
    RAISE NOTICE 'Created employee: Precious Maphanga (maphangaprecious57@gmail.com)';
  END IF;

  -- Create parent timesheet for migrated entries
  INSERT INTO public.timesheets (company_id, employee_id, status, notes)
  VALUES (v_company_id, v_employee_id, 'draft', 'Migrated from legacy time tracker')
  RETURNING id INTO v_timesheet_id;

  -- Entry 1: 2026-04-24 10:55-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-24',
    '10:55', '15:24', '15:24', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 2: 2026-04-25 07:41-13:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-25',
    '07:41', NULL, NULL, '13:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 3: 2026-04-27 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-27',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 4: 2026-04-28 07:41-17:02
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-28',
    '07:41', '14:20', '15:20', '17:02',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 5: 2026-04-29 07:42-16:57
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-29',
    '07:42', '14:04', '15:03', '16:57',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 6: 2026-04-30 07:45-17:08
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-04-30',
    '07:45', '14:21', '15:21', '17:08',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 7: 2026-05-01 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-01',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 8: 2026-05-02 (5h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-02',
    NULL, NULL, NULL, NULL,
    5.00, 0, 5.00, 5.00, 0,
    false, false, false,
    'approved',
    'Time-off: 5h'
  );

  -- Entry 9: 2026-05-04 (8h)
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-04',
    NULL, NULL, NULL, NULL,
    8.00, 0, 8.00, 8.00, 0,
    false, false, false,
    'approved',
    'Time-off: 8h'
  );

  -- Entry 10: 2026-05-05 08:01-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-05',
    '08:01', '13:05', '14:05', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 11: 2026-05-06 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-06',
    '08:00', '13:26', '14:26', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 12: 2026-05-07 08:01-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-07',
    '08:01', '14:34', '15:34', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 13: 2026-05-08 08:00-17:00
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-08',
    '08:00', '12:17', '13:17', '17:00',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 14: 2026-05-09 08:00-13:00
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

  -- Entry 15: 2026-05-11 08:02-17:01
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-11',
    '08:02', '14:24', '15:24', '17:01',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

  -- Entry 16: 2026-05-12 08:01-16:55
  INSERT INTO public.time_entries (
    company_id, timesheet_id, employee_id, work_date,
    clock_in, lunch_start, lunch_end, clock_out,
    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,
    missing_clocking, late_arrival, early_departure, status, notes
  ) VALUES (
    v_company_id, v_timesheet_id, v_employee_id, '2026-05-12',
    '08:01', '12:59', '13:59', '16:55',
    0, 0, 0, 0, 0,
    false, false, false,
    'approved',
    NULL
  );

END $$;

COMMIT;
