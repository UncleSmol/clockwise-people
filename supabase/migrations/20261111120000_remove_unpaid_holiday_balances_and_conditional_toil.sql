-- Migration: 20261111120000_remove_unpaid_holiday_balances_and_conditional_toil.sql
-- Purpose:
--   1. Remove unpaid leave and public holiday leave_balances rows (they are not tracked as leave balances).
--   2. Make TOIL leave_balances conditional strictly on company_settings.toil_rules.enabled = true.
--   3. Harden all accrual, assignment, sync, request, and review functions to enforce these rules consistently.

-- 1. Shared SQL helper for balance eligibility
create or replace function public.is_leave_type_balance_eligible(
  p_company_id uuid,
  p_category text,
  p_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cat text := lower(coalesce(p_category, ''));
  v_name text := lower(coalesce(p_name, ''));
  v_toil_enabled boolean := false;
begin
  if v_cat = 'unpaid' or v_name like '%unpaid%' then
    return false;
  end if;

  if v_cat in ('holiday', 'public_holiday') or v_name like '%holiday%' then
    return false;
  end if;

  if v_cat = 'toil_taken' or v_name like '%toil%' or v_name like '%time off in lieu%' or v_name like '%overtime comp%' then
    select coalesce((cs.toil_rules->>'enabled')::boolean, false)
      into v_toil_enabled
    from public.company_settings cs
    where cs.company_id = p_company_id
    limit 1;

    return coalesce(v_toil_enabled, false);
  end if;

  return true;
end;
$$;

grant execute on function public.is_leave_type_balance_eligible(uuid, text, text) to authenticated, service_role;

-- 2. Remove existing unpaid leave, holiday, and disabled-TOIL leave_balances rows
delete from public.leave_balances lb
using public.leave_types lt
where lb.leave_type_id = lt.id
  and not public.is_leave_type_balance_eligible(lb.company_id, lt.category::text, lt.name);

-- 3. Guard assign_employee_leave_balance against unpaid, holiday, or disabled TOIL
create or replace function public.assign_employee_leave_balance(
  target_employee_id uuid,
  target_leave_type_id uuid,
  balance_hours numeric
)
returns public.leave_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  employee public.employees%rowtype;
  leave_type public.leave_types%rowtype;
  balance public.leave_balances%rowtype;
begin
  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if not found then
    raise exception 'Employee could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and company_id = employee.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.has_any_company_role(employee.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can assign leave balances';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = employee.company_id
    and deleted_at is null
    and is_active;

  if not found then
    raise exception 'Leave rule could not be found';
  end if;

  if not public.is_leave_type_balance_eligible(employee.company_id, leave_type.category::text, leave_type.name) then
    raise exception 'Balances are not tracked for % (unpaid leave, public holidays, or disabled TOIL policies)', leave_type.name;
  end if;

  insert into public.leave_balances (
    company_id,
    employee_id,
    leave_type_id,
    balance_hours,
    adjusted_hours,
    as_of_date
  )
  values (
    employee.company_id,
    employee.id,
    leave_type.id,
    greatest(coalesce(balance_hours, 0), 0),
    greatest(coalesce(balance_hours, 0), 0),
    current_date
  )
  on conflict (company_id, employee_id, leave_type_id)
  do update set
    balance_hours = excluded.balance_hours,
    adjusted_hours = excluded.adjusted_hours,
    as_of_date = excluded.as_of_date,
    updated_at = now()
  returning * into balance;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    new_value,
    reason
  )
  values (
    employee.company_id,
    actor.id,
    'adjust',
    'leave_balances',
    balance.id,
    to_jsonb(balance),
    'Leave balance assigned'
  );

  return balance;
end;
$$;

-- 4. Guard accrue_company_leave_balances against unpaid, holiday, or disabled TOIL
create or replace function public.accrue_company_leave_balances(
  target_leave_type_id uuid,
  period_start date,
  period_end date,
  add_to_balance boolean default true,
  entries jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  company_setting public.company_settings%rowtype;
  entry_item jsonb;
  target_employee_id uuid;
  target_accrued numeric(8,2);
  existing public.leave_balances%rowtype;
  balance public.leave_balances%rowtype;
  old_value jsonb;
  cap numeric(8,2);
  cap_value jsonb;
  affected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if period_end < period_start then
    raise exception 'End date must be after start date';
  end if;

  if jsonb_typeof(entries) <> 'array' then
    raise exception 'Accrual entries must be an array';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and deleted_at is null;

  if not found then
    raise exception 'Leave rule could not be found';
  end if;

  if not public.is_leave_type_balance_eligible(leave_type.company_id, leave_type.category::text, leave_type.name) then
    raise exception 'Leave accruals are not tracked for % (unpaid leave, public holidays, or disabled TOIL policies)', leave_type.name;
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
    raise exception 'Only company admins can load leave accruals';
  end if;

  select *
    into company_setting
  from public.company_settings
  where company_id = leave_type.company_id;

  cap_value := company_setting.leave_rules->'carry_over_hours';

  for entry_item in
    select * from jsonb_array_elements(entries)
  loop
    target_employee_id := nullif((entry_item->>'employee_id')::text, '')::uuid;
    target_accrued := (entry_item->>'accrued_hours')::numeric;

    if target_employee_id is null or target_accrued is null or target_accrued <= 0 then
      continue;
    end if;

    if not exists (
      select 1
      from public.employees
      where id = target_employee_id
        and company_id = leave_type.company_id
        and deleted_at is null
    ) then
      continue;
    end if;

    select *
      into existing
    from public.leave_balances
    where company_id = leave_type.company_id
      and employee_id = target_employee_id
      and leave_type_id = leave_type.id
    for update;

    old_value := null;
    if existing.id is not null then
      old_value := to_jsonb(existing);
    end if;

    if not found then
      insert into public.leave_balances (
        company_id,
        employee_id,
        leave_type_id,
        balance_hours,
        accrued_hours,
        adjusted_hours,
        as_of_date
      )
      values (
        leave_type.company_id,
        target_employee_id,
        leave_type.id,
        target_accrued,
        target_accrued,
        case when add_to_balance then 0 else target_accrued end,
        period_end
      )
      returning * into balance;
    elsif add_to_balance then
      update public.leave_balances
      set balance_hours = balance_hours + target_accrued,
          accrued_hours = accrued_hours + target_accrued,
          as_of_date = period_end,
          updated_at = now()
      where id = existing.id
      returning * into balance;
    else
      update public.leave_balances
      set balance_hours = target_accrued,
          accrued_hours = target_accrued,
          adjusted_hours = target_accrued,
          as_of_date = period_end,
          updated_at = now()
      where id = existing.id
      returning * into balance;
    end if;

    cap := null;
    if cap_value is not null then
      if jsonb_typeof(cap_value) = 'number' then
        cap := cap_value::numeric;
      elsif jsonb_typeof(cap_value) = 'object' then
        cap := nullif(cap_value->>(leave_type.category)::text, '')::numeric;
      end if;
    end if;

    if cap is not null and balance.balance_hours > cap then
      update public.leave_balances
      set balance_hours = cap,
          updated_at = now()
      where id = balance.id
      returning * into balance;
    end if;

    insert into public.audit_logs (
      company_id,
      user_id,
      action,
      affected_table,
      record_id,
      old_value,
      new_value,
      reason
    )
    values (
      leave_type.company_id,
      actor.id,
      'adjust',
      'leave_balances',
      balance.id,
      old_value,
      to_jsonb(balance),
      'BCEA accrual loaded'
    );

    affected_count := affected_count + 1;
  end loop;

  return jsonb_build_object('affected', affected_count);
end;
$$;

-- 5. Update calculate_company_leave_accruals to respect balance eligibility & TOIL company rule
create or replace function public.calculate_company_leave_accruals(
  target_leave_type_id uuid,
  period_start date,
  period_end date
)
returns table(
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
  standard_daily_hours numeric(8,2);
  company_weekly_hours numeric(8,2);
  toil_mult numeric(8,2);
  v_toil_enabled boolean := false;
  v_eligible boolean := true;
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
  standard_daily_hours := greatest(coalesce(company_setting.standard_daily_hours, 8), 1);
  company_weekly_hours := standard_daily_hours * 5.0;
  toil_mult := coalesce((leave_type.accrual_rules->>'accrual_multiplier')::numeric, (company_setting.toil_rules->>'accrual_multiplier')::numeric, 1.5);
  v_toil_enabled := coalesce((company_setting.toil_rules->>'enabled')::boolean, false);
  v_eligible := public.is_leave_type_balance_eligible(leave_type.company_id, leave_type.category::text, leave_type.name);

  return query
  select
    e.id as employee_id,
    e.full_name,
    e.employee_number,
    coalesce(te_agg.hours_worked, 0)::numeric as hours_worked,
    case
      when not v_eligible then 0.00
      when coalesce(te_agg.shifts_worked, 0) = 0 or coalesce(te_agg.hours_worked, 0) <= 0 then 0.00

      when leave_type.category = 'annual' then
        round(
          greatest(
            (coalesce(te_agg.shifts_worked, 0) / 17.0) * wrm.daily_hours,
            coalesce(te_agg.hours_worked, 0) / 17.0,
            case
              when yearly_hours > 0 and wrm.annual_hours > 0 then
                ((yearly_hours * (wrm.weekly_hours / company_weekly_hours)) * coalesce(te_agg.hours_worked, 0)) / wrm.annual_hours
              else 0
            end
          ),
          2
        )::numeric

      when leave_type.category = 'sick' then
        round(
          least(
            coalesce(nullif(yearly_hours, 0), 80.0) * (wrm.weekly_hours / company_weekly_hours),
            greatest(
              (coalesce(te_agg.shifts_worked, 0) / 26.0) * wrm.daily_hours,
              coalesce(te_agg.hours_worked, 0) / 26.0,
              case
                when yearly_hours > 0 and wrm.annual_hours > 0 then
                  ((yearly_hours * (wrm.weekly_hours / company_weekly_hours)) * coalesce(te_agg.hours_worked, 0)) / wrm.annual_hours
                else 0
              end
            )
          ),
          2
        )::numeric

      when leave_type.category = 'family_responsibility' then
        case
          when e.start_date <= (period_end - interval '4 months') and coalesce(te_agg.shifts_worked, 0) >= 16 then
            round(
              coalesce(nullif(yearly_hours, 0), standard_daily_hours * 3.0) * (wrm.weekly_hours / company_weekly_hours),
              2
            )::numeric
          else 0.00
        end

      when leave_type.category = 'toil_taken' and v_toil_enabled then
        round(coalesce(te_agg.overtime_hours, 0) * toil_mult, 2)::numeric

      else 0.00
    end as accrued_hours

  from public.employees e
  cross join lateral public.get_employee_work_rule_metrics(e.company_id, e.id, standard_daily_hours) wrm
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

-- 6. Update sync_company_bcea_leave_accruals to skip unpaid/holiday and conditionalize TOIL on company rule
create or replace function public.sync_company_bcea_leave_accruals(target_company_id uuid)
returns table(
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
  v_toil_enabled boolean := false;
  v_company_toil_mult numeric(10,2) := 1.5;
  v_standard_annual numeric(10,2);
  v_daily_hours numeric(10,2);
  v_company_weekly numeric(10,2);
  v_schedule_scale numeric(10,4);
  v_scaled_yearly numeric(10,2);
  v_months_employed numeric(10,2);
  v_shift_accrual numeric(10,2);
  v_hours_accrual numeric(10,2);
  v_bcea_floor numeric(10,2);
begin
  select
    greatest(coalesce(cs.standard_monthly_hours, 173.33) * 12, 1),
    greatest(coalesce(cs.standard_daily_hours, 8), 1),
    coalesce((cs.toil_rules->>'enabled')::boolean, false),
    coalesce((cs.toil_rules->>'accrual_multiplier')::numeric, 1.5)
  into v_standard_annual, v_daily_hours, v_toil_enabled, v_company_toil_mult
  from public.company_settings cs
  where cs.company_id = target_company_id;

  if v_standard_annual is null then
    v_standard_annual := 2080.0;
  end if;
  if v_daily_hours is null then
    v_daily_hours := 8.0;
  end if;
  v_company_weekly := v_daily_hours * 5.0;

  -- Clean up any stale ineligible rows (unpaid, holiday, or TOIL when disabled)
  delete from public.leave_balances lb
  using public.leave_types lt
  where lb.company_id = target_company_id
    and lb.leave_type_id = lt.id
    and not public.is_leave_type_balance_eligible(target_company_id, lt.category::text, lt.name);

  for r_emp in
    select
      emp.id,
      emp.full_name,
      emp.employee_number,
      emp.start_date,
      wrm.daily_hours as emp_daily_hours,
      wrm.weekly_hours as emp_weekly_hours,
      wrm.annual_hours as emp_annual_hours
    from public.employees emp
    cross join lateral public.get_employee_work_rule_metrics(emp.company_id, emp.id, v_daily_hours) wrm
    where emp.company_id = target_company_id
      and emp.deleted_at is null
      and emp.employment_status = 'active'
    order by emp.full_name
  loop
    v_months_employed := greatest(0, round(extract(epoch from (now() - coalesce(r_emp.start_date::timestamp, '2026-01-01'::timestamp))) / (86400 * 30.4), 2));
    v_schedule_scale := case when v_company_weekly > 0 then r_emp.emp_weekly_hours / v_company_weekly else 1.0 end;

    select
      coalesce(count(distinct te.work_date) filter (where te.paid_hours > 0 or te.normal_hours > 0 or te.clock_in is not null), 0),
      coalesce(sum(case when te.paid_hours > 0 then te.paid_hours else te.normal_hours end), 0),
      coalesce(sum(te.overtime_hours), 0)
    into v_shifts, v_worked, v_overtime
    from public.time_entries te
    where te.company_id = target_company_id
      and te.employee_id = r_emp.id
      and te.deleted_at is null;

    for r_lt in
      select lt.id, lt.name, lt.category, lt.accrual_rules
      from public.leave_types lt
      where lt.company_id = target_company_id
        and lt.is_active = true
        and lt.deleted_at is null
        and public.is_leave_type_balance_eligible(target_company_id, lt.category::text, lt.name)
    loop
      v_yearly_hours := coalesce((r_lt.accrual_rules->>'yearly_hours')::numeric, 0);
      v_entitlement_days := coalesce(
        (r_lt.accrual_rules->>'entitlement_days')::numeric,
        (r_lt.accrual_rules->>'entitlement_amount')::numeric,
        (r_lt.accrual_rules->>'yearly_days')::numeric,
        case
          when v_yearly_hours > 0 and v_yearly_hours <= 40 then v_yearly_hours
          when v_yearly_hours > 40 then round(v_yearly_hours / v_daily_hours, 2)
          else 15.0
        end
      );
      v_scaled_yearly := round(
        coalesce(nullif(v_yearly_hours, 0), v_entitlement_days * v_daily_hours) * v_schedule_scale,
        2
      );
      v_toil_mult := coalesce((r_lt.accrual_rules->>'accrual_multiplier')::numeric, v_company_toil_mult, 1.5);

      select coalesce(sum(lr.total_hours), 0)
      into v_taken
      from public.leave_requests lr
      where lr.company_id = target_company_id
        and lr.employee_id = r_emp.id
        and lr.leave_type_id = r_lt.id
        and lr.status = 'approved'
        and lr.deleted_at is null;

      select coalesce(lb.taken_hours, 0), coalesce(lb.adjusted_hours, 0)
      into v_existing_taken, v_adjusted
      from public.leave_balances lb
      where lb.company_id = target_company_id
        and lb.employee_id = r_emp.id
        and lb.leave_type_id = r_lt.id;

      v_taken := greatest(coalesce(v_taken, 0), coalesce(v_existing_taken, 0));
      v_adjusted := coalesce(v_adjusted, 0);

      if v_shifts = 0 or v_worked <= 0 then
        v_accrued := 0.00;
      else
        if r_lt.category = 'annual' then
          v_shift_accrual := round((v_shifts * v_scaled_yearly) / 260.0, 2);
          v_hours_accrual := round(
            case when r_emp.emp_annual_hours > 0 then (v_worked * v_scaled_yearly) / r_emp.emp_annual_hours else 0 end,
            2
          );
          v_bcea_floor := round(greatest(v_worked / 17.0, (v_shifts / 17.0) * r_emp.emp_daily_hours), 2);
          v_accrued := greatest(v_shift_accrual, v_hours_accrual, v_bcea_floor);

        elsif r_lt.category = 'sick' then
          v_accrued := round(
            least(
              round(coalesce(nullif(v_yearly_hours, 0), 10.0 * v_daily_hours) * v_schedule_scale, 2),
              greatest(
                (v_shifts / 26.0) * r_emp.emp_daily_hours,
                v_worked / 26.0,
                case when v_scaled_yearly > 0 and r_emp.emp_annual_hours > 0 then (v_scaled_yearly * v_worked) / r_emp.emp_annual_hours else 0 end
              )
            ),
            2
          );

        elsif r_lt.category = 'family_responsibility' then
          if (v_months_employed >= 4.0 and v_shifts >= 16) then
            v_accrued := round(coalesce(nullif(v_yearly_hours, 0), 3.0 * v_daily_hours) * v_schedule_scale, 2);
          else
            v_accrued := 0.00;
          end if;

        elsif r_lt.category = 'toil_taken' and v_toil_enabled then
          v_accrued := round(v_overtime * v_toil_mult, 2);

        else
          v_accrued := 0.00;
        end if;
      end if;

      v_net_balance := greatest(0, round(v_accrued + v_adjusted - v_taken, 2));

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

-- 7. Update calculate_employee_leave_request_hours to require toil_rules.enabled and exempt unpaid/holiday from balance exhaustion errors
create or replace function public.calculate_employee_leave_request_hours(
  target_employee_id uuid,
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  employee public.employees%rowtype;
  company_setting public.company_settings%rowtype;
  leave_type public.leave_types%rowtype;
  leave_balance public.leave_balances%rowtype;
  assigned_rule_count integer := 0;
  total_hours numeric(8,2) := 0;
  available_hours numeric(8,2) := 0;
  v_effective_available numeric(8,2) := 0;
  v_toil_enabled boolean := false;
  v_toil_balance numeric(8,2) := 0;
  v_toil_to_use numeric(8,2) := 0;
  v_leave_to_use numeric(8,2) := 0;
  v_load_toil_first boolean := false;
  v_is_untracked_balance boolean := false;
  working_days integer := 0;
  public_holiday_count integer := 0;
  non_working_days integer := 0;
  detail jsonb := '[]'::jsonb;
  current_day date;
  current_dow integer;
  v_sd_start time;
  v_sd_end time;
  v_sd_lunch integer;
  v_sd_paid numeric(8,2);
  v_sd_working boolean;
  v_sched_daily numeric(8,2);
  v_matched boolean;
  holiday public.company_public_holidays%rowtype;
  daily_hours numeric(8,2);
begin
  if request_end_date < request_start_date then
    raise exception 'End date must be after start date';
  end if;

  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null;

  if not found then
    raise exception 'Employee could not be found';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = employee.company_id
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Time off type could not be found';
  end if;

  v_is_untracked_balance := (
    lower(coalesce(leave_type.category::text, '')) in ('unpaid', 'holiday', 'public_holiday')
    or lower(coalesce(leave_type.name, '')) like '%unpaid%'
    or lower(coalesce(leave_type.name, '')) like '%holiday%'
  );

  if not v_is_untracked_balance then
    select *
      into leave_balance
    from public.leave_balances
    where company_id = employee.company_id
      and employee_id = employee.id
      and leave_type_id = leave_type.id;
    available_hours := coalesce(leave_balance.balance_hours, 0);
  else
    available_hours := 0;
  end if;

  select *
    into company_setting
  from public.company_settings
  where company_id = employee.company_id;

  v_toil_enabled := coalesce((company_setting.toil_rules->>'enabled')::boolean, false);

  if v_toil_enabled then
    select coalesce(lb.balance_hours, 0)
      into v_toil_balance
    from public.leave_balances lb
    join public.leave_types lt on lt.id = lb.leave_type_id
    where lb.company_id = employee.company_id
      and lb.employee_id = employee.id
      and lt.category = 'toil_taken'
      and lt.is_active = true
      and lt.deleted_at is null
    limit 1;
  end if;

  v_toil_balance := coalesce(v_toil_balance, 0);

  v_load_toil_first := (
    v_toil_enabled and
    not v_is_untracked_balance and
    v_toil_balance > 0 and
    leave_type.category in ('annual', 'other') and
    coalesce((company_setting.toil_rules->>'load_toil_first')::boolean, true)
  );

  select count(*)
    into assigned_rule_count
  from public.employee_work_schedule_assignments assignments
  where assignments.company_id = employee.company_id
    and assignments.employee_id = employee.id
    and assignments.is_active
    and assignments.deleted_at is null
    and assignments.effective_from <= request_end_date
    and (assignments.effective_to is null or assignments.effective_to >= request_start_date);

  for current_day in
    select generate_series(request_start_date, request_end_date, interval '1 day')::date
  loop
    current_dow := extract(dow from current_day)::integer;

    select *
      into holiday
    from public.company_public_holidays cph
    where cph.company_id = employee.company_id
      and cph.holiday_date = current_day
      and cph.deleted_at is null
    limit 1;

    if found then
      public_holiday_count := public_holiday_count + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'public_holiday',
        'holiday_name', holiday.name
      ));
      continue;
    end if;

    v_matched := false;
    v_sd_working := null;
    v_sched_daily := null;

    select
      sd.start_time,
      sd.end_time,
      sd.lunch_minutes,
      sd.paid_hours,
      sd.is_working_day,
      ws.standard_daily_hours
      into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
    from public.employee_work_schedule_assignments assignments
    join public.work_schedules ws
      on ws.id = assignments.work_schedule_id
     and ws.company_id = assignments.company_id
     and ws.is_active
     and ws.deleted_at is null
    join public.schedule_days sd
      on sd.work_schedule_id = ws.id
     and sd.day_of_week = current_dow
    where assignments.company_id = employee.company_id
      and assignments.employee_id = employee.id
      and assignments.is_active
      and assignments.deleted_at is null
      and assignments.effective_from <= current_day
      and (assignments.effective_to is null or assignments.effective_to >= current_day)
    order by sd.is_working_day desc, assignments.priority asc, assignments.effective_from desc, assignments.created_at desc
    limit 1;

    if found then
      v_matched := true;
    elsif employee.work_schedule_id is not null then
      select
        sd.start_time,
        sd.end_time,
        sd.lunch_minutes,
        sd.paid_hours,
        sd.is_working_day,
        ws.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
      from public.work_schedules ws
      join public.schedule_days sd
        on sd.work_schedule_id = ws.id
       and sd.day_of_week = current_dow
      where ws.id = employee.work_schedule_id
        and ws.company_id = employee.company_id
        and ws.is_active
        and ws.deleted_at is null
      limit 1;
      if found then
        v_matched := true;
      end if;
    end if;

    if not v_matched and assigned_rule_count = 0 and employee.work_schedule_id is null then
      select
        sd.start_time,
        sd.end_time,
        sd.lunch_minutes,
        sd.paid_hours,
        sd.is_working_day,
        ws.standard_daily_hours
        into v_sd_start, v_sd_end, v_sd_lunch, v_sd_paid, v_sd_working, v_sched_daily
      from public.work_schedules ws
      join public.schedule_days sd
        on sd.work_schedule_id = ws.id
       and sd.day_of_week = current_dow
      where ws.company_id = employee.company_id
        and ws.is_active
        and ws.deleted_at is null
      order by ws.is_default desc, ws.created_at asc
      limit 1;

      if found then
        v_matched := true;
      end if;
    end if;

    if not v_matched or not coalesce(v_sd_working, false) then
      non_working_days := non_working_days + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'non_working_day'
      ));
      continue;
    end if;

    daily_hours := public.normalized_schedule_paid_hours(
      v_sd_start,
      v_sd_end,
      v_sd_lunch,
      v_sd_paid,
      coalesce(v_sched_daily, company_setting.standard_daily_hours, 8)
    )::numeric(8,2);

    if daily_hours <= 0 then
      non_working_days := non_working_days + 1;
      detail := detail || jsonb_build_array(jsonb_build_object(
        'date', current_day,
        'hours', 0,
        'reason', 'non_working_day'
      ));
      continue;
    end if;

    total_hours := total_hours + daily_hours;
    working_days := working_days + 1;
    detail := detail || jsonb_build_array(jsonb_build_object(
      'date', current_day,
      'hours', daily_hours,
      'reason', 'working_day'
    ));
  end loop;

  if v_load_toil_first then
    v_effective_available := available_hours + v_toil_balance;
    v_toil_to_use := least(v_toil_balance, total_hours);
    v_leave_to_use := greatest(0, total_hours - v_toil_to_use);
  else
    v_effective_available := available_hours;
    v_toil_to_use := 0;
    v_leave_to_use := total_hours;
  end if;

  return jsonb_build_object(
    'available_hours', v_effective_available,
    'leave_type_available_hours', available_hours,
    'toil_available_hours', v_toil_balance,
    'toil_hours_to_use', v_toil_to_use,
    'leave_hours_to_use', v_leave_to_use,
    'load_toil_first', v_load_toil_first,
    'days', detail,
    'exceeds_balance', case when v_is_untracked_balance then false else total_hours > v_effective_available end,
    'leave_type_name', leave_type.name,
    'non_working_days', non_working_days,
    'public_holidays', public_holiday_count,
    'remaining_hours', case when v_is_untracked_balance then 0 else v_effective_available - total_hours end,
    'total_hours', total_hours,
    'working_days', working_days
  );
end;
$$;

-- 8. Update submit_own_leave_request: allow unpaid leave without balance row, enforce TOIL enabled flag
create or replace function public.submit_own_leave_request(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date,
  request_total_hours numeric default null,
  request_reason text default null,
  request_attachment_url text default null,
  request_use_toil_first boolean default true
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  leave_type public.leave_types%rowtype;
  company_setting public.company_settings%rowtype;
  leave_request public.leave_requests%rowtype;
  calculated jsonb;
  calculated_hours numeric(8,2);
  available_hours numeric(8,2);
  v_use_toil boolean;
  v_toil_enabled boolean := false;
  v_is_untracked_balance boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
    and employee_id is not null
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'No active employee account is linked to this login';
  end if;

  if request_end_date < request_start_date then
    raise exception 'End date must be after start date';
  end if;

  select *
    into leave_type
  from public.leave_types
  where id = target_leave_type_id
    and company_id = actor.company_id
    and is_active
    and deleted_at is null;

  if not found then
    raise exception 'Leave type could not be found';
  end if;

  select *
    into company_setting
  from public.company_settings
  where company_id = actor.company_id;

  v_toil_enabled := coalesce((company_setting.toil_rules->>'enabled')::boolean, false);

  if not v_toil_enabled and (
    leave_type.category = 'toil_taken'
    or lower(coalesce(leave_type.name, '')) like '%toil%'
    or lower(coalesce(leave_type.name, '')) like '%time off in lieu%'
  ) then
    raise exception 'The TOIL engine is currently disabled in Company Setup';
  end if;

  if leave_type.requires_attachment
    and btrim(coalesce(request_attachment_url, '')) = '' then
    raise exception 'This leave type needs an attachment link';
  end if;

  if nullif(btrim(coalesce(request_attachment_url, '')), '') is not null
    and request_attachment_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Attachment must be a valid http or https link';
  end if;

  calculated := public.calculate_employee_leave_request_hours(
    actor.employee_id,
    leave_type.id,
    request_start_date,
    request_end_date
  );

  if request_total_hours is not null
     and request_total_hours > 0
     and request_start_date = request_end_date
     and coalesce(request_reason, '') like '%[Time Off:%' then
    calculated_hours := round(request_total_hours, 2);
  else
    calculated_hours := (calculated->>'total_hours')::numeric(8,2);
  end if;

  v_is_untracked_balance := (
    lower(coalesce(leave_type.category::text, '')) in ('unpaid', 'holiday', 'public_holiday')
    or lower(coalesce(leave_type.name, '')) like '%unpaid%'
    or lower(coalesce(leave_type.name, '')) like '%holiday%'
  );

  v_use_toil := v_toil_enabled and not v_is_untracked_balance and coalesce(request_use_toil_first, true);
  if v_use_toil then
    available_hours := (calculated->>'available_hours')::numeric(8,2);
  else
    available_hours := coalesce((calculated->>'leave_type_available_hours')::numeric(8,2), (calculated->>'available_hours')::numeric(8,2));
  end if;

  if calculated_hours <= 0 then
    raise exception 'The selected dates do not include any working hours under your work schedule';
  end if;

  if not v_is_untracked_balance and calculated_hours > available_hours then
    raise exception 'You only have % hours available for % leave (requested % hours)', available_hours, leave_type.name, calculated_hours;
  end if;

  insert into public.leave_requests (
    company_id,
    employee_id,
    leave_type_id,
    start_date,
    end_date,
    total_hours,
    reason,
    attachment_url,
    status,
    submitted_at,
    submitted_by,
    use_toil_first
  )
  values (
    actor.company_id,
    actor.employee_id,
    leave_type.id,
    request_start_date,
    request_end_date,
    calculated_hours,
    nullif(btrim(coalesce(request_reason, '')), ''),
    nullif(btrim(coalesce(request_attachment_url, '')), ''),
    'submitted',
    now(),
    actor.id,
    v_use_toil
  )
  returning * into leave_request;

  insert into public.approval_requests (
    company_id,
    request_type,
    request_id,
    submitted_by,
    status,
    notes
  )
  values (
    leave_request.company_id,
    'leave_request',
    leave_request.id,
    actor.id,
    'submitted',
    concat_ws(
      E'\n',
      leave_request.reason,
      case
        when request_total_hours is not null and request_total_hours > 0 and request_start_date = request_end_date and coalesce(request_reason, '') like '%[Time Off:%'
          then concat('Time off hours: ', calculated_hours)
        else concat('Calculated leave hours (work rules): ', calculated_hours)
      end,
      case when v_use_toil then 'Policy: Load TOIL first before leave' else 'Policy: Direct leave deduction' end
    )
  );

  return leave_request;
end;
$$;

-- 9. Update review_managed_leave_request to skip leave_balances updates for unpaid/holiday and enforce toil_rules.enabled
create or replace function public.review_managed_leave_request(
  target_leave_request_id uuid,
  approve_request boolean,
  manager_notes text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  existing public.leave_requests%rowtype;
  reviewed public.leave_requests%rowtype;
  employee public.employees%rowtype;
  leave_type public.leave_types%rowtype;
  company_setting public.company_settings%rowtype;
  calculated jsonb;
  day_item jsonb;
  day_date date;
  day_hours numeric(8,2);
  target_period_id uuid;
  target_timesheet_id uuid;
  v_toil_enabled boolean := false;
  v_is_untracked_balance boolean := false;
  v_toil_bal_hours numeric(8,2) := 0;
  v_toil_bal_id uuid;
  v_toil_type_id uuid;
  v_toil_deduct numeric(8,2) := 0;
  v_leave_deduct numeric(8,2) := 0;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication is required';
  end if;

  select *
    into existing
  from public.leave_requests
  where id = target_leave_request_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Leave request could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
  order by (company_id = existing.company_id) desc, is_super_admin desc, created_at asc
  limit 1;

  if actor.id is null and current_user in ('service_role', 'postgres') then
    select * into actor from public.users where company_id = existing.company_id and status = 'active' limit 1;
  end if;

  if actor.id is null or not (
    public.is_super_admin()
    or current_user in ('service_role', 'postgres')
    or public.can_manage_time_record(existing.company_id, existing.employee_id)
  ) then
    raise exception 'You do not have permission to review this leave request';
  end if;

  if existing.status <> 'submitted' then
    raise exception 'Only submitted leave requests can be reviewed';
  end if;

  update public.leave_requests
  set status = (
        case when approve_request then 'approved' else 'rejected' end
      )::public.approval_status,
      approved_by = case when approve_request then actor.id else null end,
      approved_at = case when approve_request then now() else null end,
      rejected_by = case when approve_request then null else actor.id end,
      rejected_at = case when approve_request then null else now() end,
      rejection_reason = case when approve_request then null else nullif(btrim(coalesce(manager_notes, '')), '') end,
      updated_at = now()
  where id = existing.id
  returning * into reviewed;

  if approve_request then
    select *
      into leave_type
    from public.leave_types
    where id = reviewed.leave_type_id
      and company_id = reviewed.company_id;

    select *
      into company_setting
    from public.company_settings
    where company_id = reviewed.company_id;

    v_toil_enabled := coalesce((company_setting.toil_rules->>'enabled')::boolean, false);
    v_is_untracked_balance := (
      lower(coalesce(leave_type.category::text, '')) in ('unpaid', 'holiday', 'public_holiday')
      or lower(coalesce(leave_type.name, '')) like '%unpaid%'
      or lower(coalesce(leave_type.name, '')) like '%holiday%'
    );

    if not (coalesce(reviewed.reason, '') like '%[Time Off:%' and reviewed.start_date = reviewed.end_date) then
      calculated := public.calculate_employee_leave_request_hours(
        reviewed.employee_id,
        reviewed.leave_type_id,
        reviewed.start_date,
        reviewed.end_date
      );
      if coalesce((calculated->>'total_hours')::numeric(8,2), 0) > 0 then
        update public.leave_requests
        set total_hours = (calculated->>'total_hours')::numeric(8,2)
        where id = reviewed.id
        returning * into reviewed;
      end if;
    end if;

    if not v_is_untracked_balance then
      if v_toil_enabled and coalesce(reviewed.use_toil_first, true) and leave_type.category in ('annual', 'other') then
        select coalesce(lb.balance_hours, 0), lb.id, lt.id
          into v_toil_bal_hours, v_toil_bal_id, v_toil_type_id
        from public.leave_balances lb
        join public.leave_types lt on lt.id = lb.leave_type_id
        where lb.company_id = reviewed.company_id
          and lb.employee_id = reviewed.employee_id
          and lt.category = 'toil_taken'
          and lt.is_active = true
          and lt.deleted_at is null
        limit 1;

        v_toil_bal_hours := coalesce(v_toil_bal_hours, 0);

        if v_toil_bal_hours > 0 then
          v_toil_deduct := least(v_toil_bal_hours, reviewed.total_hours);
          v_leave_deduct := reviewed.total_hours - v_toil_deduct;

          update public.leave_balances
          set taken_hours = taken_hours + v_toil_deduct,
              balance_hours = greatest(balance_hours - v_toil_deduct, 0),
              as_of_date = current_date,
              updated_at = now()
          where id = v_toil_bal_id;

          insert into public.toil_transactions (
            company_id,
            employee_id,
            transaction_date,
            transaction_type,
            hours,
            leave_request_id,
            reason,
            status,
            created_by,
            approved_by,
            approved_at
          ) values (
            reviewed.company_id,
            reviewed.employee_id,
            reviewed.start_date,
            'toil_taken'::public.toil_transaction_type,
            -v_toil_deduct,
            reviewed.id,
            'TOIL loaded first for approved leave: ' || coalesce(leave_type.name, 'Leave'),
            'approved'::public.approval_status,
            actor.id,
            actor.id,
            now()
          );

          update public.leave_requests
          set toil_hours_used = v_toil_deduct
          where id = reviewed.id;

          if v_leave_deduct > 0 then
            update public.leave_balances
            set taken_hours = taken_hours + v_leave_deduct,
                balance_hours = greatest(balance_hours - v_leave_deduct, 0),
                as_of_date = current_date,
                updated_at = now()
            where company_id = reviewed.company_id
              and employee_id = reviewed.employee_id
              and leave_type_id = reviewed.leave_type_id;
          end if;
        else
          update public.leave_balances
          set taken_hours = taken_hours + reviewed.total_hours,
              balance_hours = greatest(balance_hours - reviewed.total_hours, 0),
              as_of_date = current_date,
              updated_at = now()
          where company_id = reviewed.company_id
            and employee_id = reviewed.employee_id
            and leave_type_id = reviewed.leave_type_id;
        end if;
      else
        update public.leave_balances
        set taken_hours = taken_hours + reviewed.total_hours,
            balance_hours = greatest(balance_hours - reviewed.total_hours, 0),
            as_of_date = current_date,
            updated_at = now()
        where company_id = reviewed.company_id
          and employee_id = reviewed.employee_id
          and leave_type_id = reviewed.leave_type_id;
      end if;
    end if;

    select *
      into employee
    from public.employees
    where id = reviewed.employee_id
      and company_id = reviewed.company_id
      and deleted_at is null;

    if found then
      if calculated is null then
        calculated := public.calculate_employee_leave_request_hours(
          reviewed.employee_id,
          reviewed.leave_type_id,
          reviewed.start_date,
          reviewed.end_date
        );
      end if;

      for day_item in
        select value
        from jsonb_array_elements(coalesce(calculated -> 'days', '[]'::jsonb))
      loop
        day_date := (day_item ->> 'date')::date;
        day_hours := coalesce((day_item ->> 'hours')::numeric, 0);

        if day_hours <= 0 then
          continue;
        end if;

        if exists (
          select 1
          from public.time_entries existing_te
          where existing_te.company_id = reviewed.company_id
            and existing_te.employee_id = reviewed.employee_id
            and existing_te.work_date = day_date
            and existing_te.deleted_at is null
        ) then
          continue;
        end if;

        select pp.id
          into target_period_id
        from public.payroll_periods pp
        where pp.company_id = reviewed.company_id
          and day_date between pp.start_date and pp.end_date
          and pp.deleted_at is null
        order by pp.start_date asc
        limit 1;

        if target_period_id is null then
          target_period_id := public.ensure_payroll_period_for_date(
            reviewed.company_id,
            day_date
          );
        end if;

        select ts.id
          into target_timesheet_id
        from public.timesheets ts
        where ts.company_id = reviewed.company_id
          and ts.employee_id = reviewed.employee_id
          and ts.payroll_period_id = target_period_id
          and ts.deleted_at is null
        limit 1;

        if target_timesheet_id is null then
          target_timesheet_id := public.ensure_employee_timesheet(
            reviewed.company_id,
            reviewed.employee_id,
            target_period_id
          );
        end if;

        insert into public.time_entries (
          company_id,
          timesheet_id,
          payroll_period_id,
          employee_id,
          workstation_id,
          work_date,
          paid_hours,
          normal_hours,
          gross_hours,
          overtime_hours,
          status,
          leave_type_id,
          notes,
          created_by,
          updated_by
        ) values (
          reviewed.company_id,
          target_timesheet_id,
          target_period_id,
          reviewed.employee_id,
          employee.workstation_id,
          day_date,
          day_hours,
          day_hours,
          day_hours,
          0,
          'approved'::public.approval_status,
          reviewed.leave_type_id,
          coalesce(leave_type.name, 'Approved leave') ||
            case when reviewed.reason is not null then ' - ' || reviewed.reason else '' end,
          actor.id,
          actor.id
        );
      end loop;
    end if;
  end if;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    new_value,
    reason
  ) values (
    existing.company_id,
    actor.id,
    case when approve_request then 'approve' else 'reject' end,
    'leave_requests',
    jsonb_build_object('leave_request_id', reviewed.id, 'status', reviewed.status),
    nullif(btrim(coalesce(manager_notes, '')), '')
  );

  return reviewed;
end;
$$;

