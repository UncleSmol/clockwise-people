-- 20261016180000_hide_inactive_from_reports_and_strict_shift_accruals.sql
-- 1. Database-level logic to hide terminated/inactive employees from reports
-- 2. Strict shifts-worked and hours-worked leave accrual engine (BCEA Section 20, 22, 27, 10)
-- 3. Elimination of "days from the air" (0 shifts/hours -> 0h leave; FRL requires >=4mo service and >=16 shifts)

-------------------------------------------------------------------------------
-- 1. REPORTING VIEW & FUNCTION: Active Report Employees
-------------------------------------------------------------------------------

-- Dedicated View strictly excluding terminated, inactive, and deleted employees
create or replace view public.company_report_employees_active as
select
  e.id,
  e.company_id,
  e.employee_number,
  e.full_name,
  e.known_as,
  e.email,
  e.phone_number,
  e.avatar_url,
  e.workstation_id,
  e.department_id,
  e.job_title,
  e.employment_type,
  e.employment_status,
  e.start_date,
  e.work_schedule_id,
  e.manager_employee_id,
  e.compensation_type,
  e.hourly_rate,
  e.monthly_salary,
  d.name as department_name,
  w.name as workstation_name,
  coalesce(ws.standard_daily_hours, cs.standard_daily_hours, 8)::numeric as daily_hours
from public.employees e
left join public.departments d on d.id = e.department_id
left join public.company_workstations w on w.id = e.workstation_id
left join public.work_schedules ws on ws.id = e.work_schedule_id
left join public.company_settings cs on cs.company_id = e.company_id
where e.deleted_at is null
  and e.employment_status = 'active';

-- Secure RPC function to fetch reporting employees with optional inactive toggle (default false = strictly active only)
create or replace function public.get_company_report_employees(
  target_company_id uuid,
  p_include_inactive boolean default false
)
returns table (
  id uuid,
  company_id uuid,
  employee_number text,
  full_name text,
  known_as text,
  email text,
  phone_number text,
  avatar_url text,
  workstation_id uuid,
  department_id uuid,
  job_title text,
  employment_type public.employment_type,
  employment_status public.employment_status,
  start_date date,
  work_schedule_id uuid,
  manager_employee_id uuid,
  compensation_type public.compensation_type,
  hourly_rate numeric,
  monthly_salary numeric,
  department_name text,
  workstation_name text,
  daily_hours numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    e.id,
    e.company_id,
    e.employee_number,
    e.full_name,
    e.known_as,
    e.email,
    e.phone_number,
    e.avatar_url,
    e.workstation_id,
    e.department_id,
    e.job_title,
    e.employment_type,
    e.employment_status,
    e.start_date,
    e.work_schedule_id,
    e.manager_employee_id,
    e.compensation_type,
    e.hourly_rate,
    e.monthly_salary,
    d.name as department_name,
    w.name as workstation_name,
    coalesce(ws.standard_daily_hours, cs.standard_daily_hours, 8)::numeric as daily_hours
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.company_workstations w on w.id = e.workstation_id
  left join public.work_schedules ws on ws.id = e.work_schedule_id
  left join public.company_settings cs on cs.company_id = e.company_id
  where e.company_id = target_company_id
    and e.deleted_at is null
    and (p_include_inactive = true or e.employment_status = 'active')
  order by e.full_name asc;
end;
$$;

grant execute on function public.get_company_report_employees(uuid, boolean) to authenticated, service_role;


-------------------------------------------------------------------------------
-- 2. UPDATED calculate_company_leave_accruals:
--    Strictly shift/hours-worked based, no days from the air, active employees only
-------------------------------------------------------------------------------
create or replace function public.calculate_company_leave_accruals(
  target_leave_type_id uuid,
  period_start date,
  period_end date
)
returns table (
  employee_id uuid,
  full_name text,
  employee_number text,
  hours_worked numeric,
  accrued_hours numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  company_setting public.company_settings%rowtype;
  yearly_hours numeric(8,2);
  standard_annual_hours numeric(8,2);
  standard_daily_hours numeric(8,2);
  toil_mult numeric(8,2);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if period_end < period_start then
    raise exception 'End date must be after start date';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and deleted_at is null;

  if not found then
    raise exception 'Leave rule could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and company_id = leave_type.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.has_any_company_role(leave_type.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can calculate leave accruals';
  end if;

  select *
    into company_setting
  from public.company_settings
  where company_id = leave_type.company_id;

  yearly_hours := coalesce((leave_type.accrual_rules->>'yearly_hours')::numeric, 0);
  standard_daily_hours := coalesce(company_setting.standard_daily_hours, 8);
  standard_annual_hours := greatest(coalesce(company_setting.standard_monthly_hours, 173.33) * 12, 1);
  toil_mult := coalesce((leave_type.accrual_rules->>'accrual_multiplier')::numeric, 1.5);

  return query
  select
    e.id as employee_id,
    e.full_name,
    e.employee_number,
    coalesce(te_agg.hours_worked, 0)::numeric as hours_worked,
    case
      -- Guard: strictly 0 if 0 shifts or 0 hours worked
      when coalesce(te_agg.shifts_worked, 0) = 0 or coalesce(te_agg.hours_worked, 0) <= 0 then 0.00

      -- Annual Leave: 1 day per 17 days worked (or 1h per 17h worked), or pro-rata yearly, guaranteed >= 1:17
      when leave_type.category = 'annual' then
        round(greatest(
          (coalesce(te_agg.shifts_worked, 0) / 17.0) * coalesce(ws.standard_daily_hours, standard_daily_hours),
          coalesce(te_agg.hours_worked, 0) / 17.0,
          case when yearly_hours > 0 then (yearly_hours * coalesce(te_agg.hours_worked, 0)) / standard_annual_hours else 0 end
        ), 2)::numeric

      -- Sick Leave: 1 day per 26 days worked, capped at yearly maximum
      when leave_type.category = 'sick' then
        round(least(
          coalesce(nullif(yearly_hours, 0), 80.0),
          greatest(
            (coalesce(te_agg.shifts_worked, 0) / 26.0) * coalesce(ws.standard_daily_hours, standard_daily_hours),
            coalesce(te_agg.hours_worked, 0) / 26.0,
            case when yearly_hours > 0 then (yearly_hours * coalesce(te_agg.hours_worked, 0)) / standard_annual_hours else 0 end
          )
        ), 2)::numeric

      -- Family Responsibility: requires >= 4 months service AND >= 16 shifts
      when leave_type.category = 'family_responsibility' then
        case
          when e.start_date <= (period_end - interval '4 months') and coalesce(te_agg.shifts_worked, 0) >= 16 then
            case when yearly_hours > 0 then yearly_hours else standard_daily_hours * 3 end
          else 0.00
        end

      -- TOIL: 1.5x overtime
      when leave_type.category = 'toil_taken' then
        round(coalesce(te_agg.overtime_hours, 0) * toil_mult, 2)::numeric

      else 0.00
    end as accrued_hours

  from public.employees e
  left join public.work_schedules ws on ws.id = e.work_schedule_id
  left join (
    select
      te.employee_id,
      count(distinct te.work_date) filter (where te.paid_hours > 0 or te.normal_hours > 0 or te.clock_in is not null) as shifts_worked,
      sum(case when te.paid_hours > 0 then te.paid_hours else te.normal_hours end) as hours_worked,
      sum(te.overtime_hours) as overtime_hours
    from public.time_entries te
    where te.company_id = leave_type.company_id
      and te.deleted_at is null
      and te.work_date between period_start and period_end
    group by te.employee_id
  ) te_agg on te_agg.employee_id = e.id
  where e.company_id = leave_type.company_id
    and e.deleted_at is null
    and e.employment_status = 'active'
  order by e.full_name asc;
end;
$$;


-------------------------------------------------------------------------------
-- 3. UPDATED sync_company_bcea_leave_accruals:
--    Deterministic statutory calculation based on shifts clocked in and hours worked.
--    Guarantees: No clock-in = 0 leave. No days added from the air.
-------------------------------------------------------------------------------
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
  v_toil_mult numeric(10,2);
  v_standard_annual numeric(10,2);
  v_daily_hours numeric(10,2);
  v_bal_id uuid;
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
      select lb.id, coalesce(lb.taken_hours, 0), coalesce(lb.adjusted_hours, 0)
      into v_bal_id, v_existing_taken, v_adjusted
      from public.leave_balances lb
      where lb.company_id = target_company_id
        and lb.employee_id = r_emp.id
        and lb.leave_type_id = r_lt.id;

      v_taken := greatest(coalesce(v_taken, 0), coalesce(v_existing_taken, 0));
      v_adjusted := coalesce(v_adjusted, 0);

      -------------------------------------------------------------------------
      -- CALCULATION ENGINE: Strictly Shifts- & Hours-Worked Driven
      -------------------------------------------------------------------------
      if v_shifts = 0 or v_worked <= 0 then
        -- Employee did not clock in or work: STRICTLY 0.00h (NO DAYS FROM THE AIR)
        v_accrued := 0.00;
      else
        if r_lt.category = 'annual' then
          -- BCEA Section 20(2): 1 day per 17 days worked (or 1h per 17h worked)
          v_accrued := round(greatest(
            (v_shifts / 17.0) * r_emp.emp_daily_hours,
            v_worked / 17.0,
            case when v_yearly_hours > 0 then (v_yearly_hours * v_worked) / v_standard_annual else 0 end
          ), 2);

        elsif r_lt.category = 'sick' then
          -- BCEA Section 22: 1 day per 26 days worked, capped at 80h/yr
          v_accrued := round(least(
            coalesce(nullif(v_yearly_hours, 0), 80.0),
            greatest(
              (v_shifts / 26.0) * r_emp.emp_daily_hours,
              v_worked / 26.0,
              case when v_yearly_hours > 0 then (v_yearly_hours * v_worked) / v_standard_annual else 0 end
            )
          ), 2);

        elsif r_lt.category = 'family_responsibility' then
          -- BCEA Section 27: Only for employees employed >= 4 months AND working >= 4 days/week (>= 16 shifts)
          if (r_emp.start_date <= (current_date - interval '4 months') and v_shifts >= 16) then
            v_accrued := case when v_yearly_hours > 0 then v_yearly_hours else 24.00 end;
          else
            v_accrued := 0.00;
          end if;

        elsif r_lt.category = 'toil_taken' then
          -- BCEA Section 10(3)(b): 1.5x overtime hours
          v_accrued := round(v_overtime * v_toil_mult, 2);

        else
          -- Non-accruing (unpaid, maternity, etc.)
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

  -- 2. Cleanup: For inactive / terminated employees, ensure spurious air-based accruals
  -- (e.g. FRL 24h where employee never worked) are zeroed out
  update public.leave_balances lb
  set
    accrued_hours = 0.00,
    balance_hours = greatest(0, round(coalesce(lb.adjusted_hours, 0) - coalesce(lb.taken_hours, 0), 2)),
    as_of_date = current_date,
    updated_at = now()
  from public.employees e, public.leave_types lt
  where lb.employee_id = e.id
    and lb.leave_type_id = lt.id
    and e.company_id = target_company_id
    and (e.employment_status in ('terminated', 'inactive') or e.deleted_at is not null)
    and lt.category in ('family_responsibility', 'other')
    and not exists (
      select 1 from public.time_entries te
      where te.employee_id = e.id and (te.paid_hours > 0 or te.normal_hours > 0 or te.clock_in is not null)
    );

end;
$$;

grant execute on function public.sync_company_bcea_leave_accruals(uuid) to authenticated, service_role;

-------------------------------------------------------------------------------
-- 4. Apply synchronization across all registered companies immediately
-------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from public.companies loop
    perform public.sync_company_bcea_leave_accruals(r.id);
  end loop;
end;
$$;
