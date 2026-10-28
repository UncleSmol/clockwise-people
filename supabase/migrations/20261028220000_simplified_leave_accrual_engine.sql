-- ============================================================================
-- Migration: Simplified Leave Accrual Engine (1.75 days per 17 days worked)
-- Description:
--   1. Calculates dynamic statutory leave accrual: 1.75 days per 17 days worked
--      (conforming to standard setup: 21 days annual = 1.75 days/month = ~17 shifts/mo)
--      with BCEA statutory floor of 1h per 17h worked.
--   2. TOIL: Accrues based on approved overtime hours * company OT multiplier (1.5x default).
--   3. Removes catastrophic 0-clamping of active balances when use-it-or-lose-it is configured.
-- ============================================================================

create or replace function public.sync_company_bcea_leave_accruals(target_company_id uuid)
returns table (
  out_employee_id uuid,
  out_employee_name text,
  out_leave_type_name text,
  out_hours_worked numeric,
  out_accrued_hours numeric,
  out_taken_hours numeric,
  out_balance_hours numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r_emp record;
  r_lt record;
  v_shifts integer;
  v_worked numeric(10,2);
  v_overtime numeric(10,2);
  v_taken numeric(10,2);
  v_existing_taken numeric(10,2);
  v_accrued numeric(10,2);
  v_adjusted numeric(10,2);
  v_net_balance numeric(10,2);
  v_yearly_hours numeric(10,2);
  v_entitlement_days numeric(10,2);
  v_toil_mult numeric(10,2);
  v_standard_annual numeric(10,2);
  v_daily_hours numeric(10,2);
  v_months_employed numeric(10,2);
  v_shift_accrual numeric(10,2);
  v_hours_accrual numeric(10,2);
  v_bcea_floor numeric(10,2);
  v_pro_rata numeric(10,2);
begin

  -- Standard company working parameters
  select
    greatest(coalesce(cs.standard_monthly_hours, 173.33) * 12, 1),
    coalesce(cs.standard_daily_hours, 8)
  into v_standard_annual, v_daily_hours
  from public.company_settings cs
  where cs.company_id = target_company_id;

  if v_standard_annual is null then
    v_standard_annual := 2080.0;
  end if;
  if v_daily_hours is null then
    v_daily_hours := 8.0;
  end if;

  -- 1. Loop through all active employees
  for r_emp in
    select
      emp.id,
      emp.full_name,
      emp.employee_number,
      emp.start_date,
      coalesce(ws.standard_daily_hours, v_daily_hours) as emp_daily_hours
    from public.employees emp
    left join public.work_schedules ws on ws.id = emp.work_schedule_id
    where emp.company_id = target_company_id
      and emp.deleted_at is null
      and emp.employment_status = 'active'
    order by emp.full_name
  loop

    -- Calculate months employed
    v_months_employed := greatest(0, round(extract(epoch from (now() - coalesce(r_emp.start_date::timestamp, '2026-01-01'::timestamp))) / (86400 * 30.4), 2));

    -- Aggregate shifts and hours worked across all time entries (clock-in or hours > 0)
    select
      coalesce(count(distinct te.work_date) filter (where te.paid_hours > 0 or te.normal_hours > 0 or te.clock_in is not null), 0),
      coalesce(sum(case when te.paid_hours > 0 then te.paid_hours else te.normal_hours end), 0),
      coalesce(sum(te.overtime_hours), 0)
    into v_shifts, v_worked, v_overtime
    from public.time_entries te
    where te.company_id = target_company_id
      and te.employee_id = r_emp.id
      and te.deleted_at is null;

    -- Loop through active leave types for this company
    for r_lt in
      select lt.id, lt.name, lt.category, lt.accrual_rules
      from public.leave_types lt
      where lt.company_id = target_company_id
        and lt.is_active = true
        and lt.deleted_at is null
    loop

      v_yearly_hours := coalesce((r_lt.accrual_rules->>'yearly_hours')::numeric, 0);
      v_entitlement_days := coalesce(
        (r_lt.accrual_rules->>'entitlement_days')::numeric,
        (r_lt.accrual_rules->>'entitlement_amount')::numeric,
        (r_lt.accrual_rules->>'yearly_days')::numeric,
        case
          when v_yearly_hours > 0 and v_yearly_hours <= 40 then v_yearly_hours
          when v_yearly_hours > 40 then round(v_yearly_hours / r_emp.emp_daily_hours, 2)
          else 15.0
        end
      );
      v_toil_mult := coalesce((r_lt.accrual_rules->>'accrual_multiplier')::numeric, 1.5);

      -- Aggregate taken hours from approved leave requests
      select coalesce(sum(lr.total_hours), 0)
      into v_taken
      from public.leave_requests lr
      where lr.company_id = target_company_id
        and lr.employee_id = r_emp.id
        and lr.leave_type_id = r_lt.id
        and lr.status = 'approved'
        and lr.deleted_at is null;

      -- Check existing balance to preserve adjusted_hours or historical taken
      select coalesce(lb.taken_hours, 0), coalesce(lb.adjusted_hours, 0)
      into v_existing_taken, v_adjusted
      from public.leave_balances lb
      where lb.company_id = target_company_id
        and lb.employee_id = r_emp.id
        and lb.leave_type_id = r_lt.id;

      v_taken := greatest(coalesce(v_taken, 0), coalesce(v_existing_taken, 0));
      v_adjusted := coalesce(v_adjusted, 0);

      -------------------------------------------------------------------------
      -- CALCULATION ENGINE: Work Rule & Statutory BCEA Conformity
      -------------------------------------------------------------------------
      if v_shifts = 0 or v_worked <= 0 then
        v_accrued := 0.00;
      else
        if r_lt.category = 'annual' then
          -- Dynamic accrual based on work rule entitlement (15, 17, or 21 days)
          -- Annual working days = 260 for standard 5-day week
          v_shift_accrual := round((v_shifts * (v_entitlement_days * r_emp.emp_daily_hours)) / 260.0, 2);
          v_hours_accrual := round((v_worked * (v_entitlement_days * r_emp.emp_daily_hours)) / v_standard_annual, 2);
          v_bcea_floor := round(greatest(v_worked / 17.0, (v_shifts / 17.0) * r_emp.emp_daily_hours), 2);

          v_accrued := greatest(v_shift_accrual, v_hours_accrual, v_bcea_floor);

        elsif r_lt.category = 'sick' then
          -- 1 day per 26 days worked, pro-rated up to yearlyHours (default 80h)
          v_accrued := round(least(
            coalesce(nullif(v_yearly_hours, 0), v_entitlement_days * r_emp.emp_daily_hours, 80.0),
            greatest(
              (v_shifts / 26.0) * r_emp.emp_daily_hours,
              v_worked / 26.0,
              case when v_yearly_hours > 0 then (v_yearly_hours * v_worked) / v_standard_annual else 0 end
            )
          ), 2);

        elsif r_lt.category = 'family_responsibility' then
          -- 3 days (24h) if employed >= 4 months AND shifts >= 16
          if (v_months_employed >= 4.0 and v_shifts >= 16) then
            v_accrued := case when v_yearly_hours > 0 then v_yearly_hours else least(v_entitlement_days * r_emp.emp_daily_hours, 24.00) end;
          else
            v_accrued := 0.00;
          end if;

        elsif r_lt.category = 'toil_taken' then
          -- Overtime TOIL: Overtime hours * multiplier (default 1.5x)
          v_accrued := round(v_overtime * v_toil_mult, 2);

        else
          v_accrued := 0.00;
        end if;
      end if;

      v_net_balance := greatest(0, round(v_accrued + v_adjusted - v_taken, 2));

      -- Upsert leave balance record
      insert into public.leave_balances (
        company_id,
        employee_id,
        leave_type_id,
        accrued_hours,
        balance_hours,
        taken_hours,
        adjusted_hours,
        as_of_date
      ) values (
        target_company_id,
        r_emp.id,
        r_lt.id,
        v_accrued,
        v_net_balance,
        v_taken,
        v_adjusted,
        current_date
      )
      on conflict (company_id, employee_id, leave_type_id)
      do update set
        accrued_hours = excluded.accrued_hours,
        taken_hours = excluded.taken_hours,
        balance_hours = excluded.balance_hours,
        as_of_date = current_date,
        updated_at = now();

      out_employee_id := r_emp.id;
      out_employee_name := r_emp.full_name;
      out_leave_type_name := r_lt.name;
      out_hours_worked := v_worked;
      out_accrued_hours := v_accrued;
      out_taken_hours := v_taken;
      out_balance_hours := v_net_balance;
      return next;

    end loop;
  end loop;

  return;
end;
$$;

grant execute on function public.sync_company_bcea_leave_accruals(uuid) to authenticated, service_role;
