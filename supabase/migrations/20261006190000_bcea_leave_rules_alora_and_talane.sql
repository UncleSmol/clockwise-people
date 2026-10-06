-- 20261006190000_bcea_leave_rules_alora_and_talane.sql
-- South African BCEA Statutory Leave Rules & Hours-Worked Accruals for Alora Dental Care and Talane & Associates

do $$
declare
  v_alora_id constant uuid := 'ce43d3b4-494d-401d-8476-3168465dbc71';
  v_talane_id constant uuid := 'be6a1fb3-2cac-4cf8-b01b-b1339ee07095';
begin

  -----------------------------------------------------------------------------
  -- 1. ALORA DENTAL CARE: Provision BCEA Statutory Leave Rules
  -----------------------------------------------------------------------------
  if exists (select 1 from public.companies where id = v_alora_id) then

    -- Annual Leave: BCEA Sec 20 (21 consecutive days / 15 working days = 120h, or 1h per 17h worked)
    insert into public.leave_types (
      company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
    ) values (
      v_alora_id,
      'Annual Leave',
      'annual'::public.leave_category,
      true,
      false,
      true,
      jsonb_build_object(
        'yearly_hours', 120,
        'accrual_mode', 'worked_hours',
        'rate_per_hour', 0.0588235,
        'bcea_section', '20'
      )
    ) on conflict do nothing;

    -- Sick Leave: BCEA Sec 22 (6 weeks over 3-year cycle = 80h/year for 40h standard work week)
    insert into public.leave_types (
      company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
    ) values (
      v_alora_id,
      'Sick Leave',
      'sick'::public.leave_category,
      true,
      false,
      true,
      jsonb_build_object(
        'yearly_hours', 80,
        'accrual_mode', 'worked_hours',
        'cycle_months', 36,
        'rate_per_hour', 0.0384615,
        'bcea_section', '22'
      )
    ) on conflict do nothing;

    -- Family Responsibility Leave: BCEA Sec 27 (3 days = 24h per annual cycle on full pay)
    insert into public.leave_types (
      company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
    ) values (
      v_alora_id,
      'Family Responsibility Leave',
      'family_responsibility'::public.leave_category,
      true,
      false,
      true,
      jsonb_build_object(
        'yearly_hours', 24,
        'bcea_section', '27'
      )
    ) on conflict do nothing;

    -- TOIL (Time Off In Lieu): BCEA Sec 10(3)(b) (1.5x paid time off per overtime hour worked)
    insert into public.leave_types (
      company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
    ) values (
      v_alora_id,
      'TOIL (Time Off In Lieu)',
      'toil_taken'::public.leave_category,
      true,
      false,
      true,
      jsonb_build_object(
        'yearly_hours', 0,
        'accrual_multiplier', 1.5,
        'bcea_section', '10'
      )
    ) on conflict do nothing;

    -- Maternity Leave: BCEA Sec 25 (4 consecutive months unpaid by employer / claimed via UIF)
    insert into public.leave_types (
      company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
    ) values (
      v_alora_id,
      'Maternity Leave',
      'maternity'::public.leave_category,
      false,
      true,
      true,
      jsonb_build_object(
        'yearly_hours', 0,
        'statutory_months', 4,
        'bcea_section', '25'
      )
    ) on conflict do nothing;

    -- Unpaid Leave
    insert into public.leave_types (
      company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
    ) values (
      v_alora_id,
      'Unpaid Leave',
      'unpaid'::public.leave_category,
      false,
      false,
      true,
      jsonb_build_object('yearly_hours', 0)
    ) on conflict do nothing;

  end if;


  -----------------------------------------------------------------------------
  -- 2. TALANE AND ASSOCIATES: Update & Complete BCEA Statutory Leave Rules
  -----------------------------------------------------------------------------
  if exists (select 1 from public.companies where id = v_talane_id) then

    -- Update existing Annual Leave with BCEA 120h / 1h-per-17h worked accrual rule
    update public.leave_types
    set accrual_rules = jsonb_build_object(
          'yearly_hours', 120,
          'accrual_mode', 'worked_hours',
          'rate_per_hour', 0.0588235,
          'bcea_section', '20'
        ),
        is_paid = true,
        is_active = true
    where company_id = v_talane_id
      and category = 'annual'
      and deleted_at is null;

    -- Update existing Sick Leave with BCEA 80h / 36-month cycle accrual rule
    update public.leave_types
    set accrual_rules = jsonb_build_object(
          'yearly_hours', 80,
          'accrual_mode', 'worked_hours',
          'cycle_months', 36,
          'rate_per_hour', 0.0384615,
          'bcea_section', '22'
        ),
        is_paid = true,
        is_active = true
    where company_id = v_talane_id
      and category = 'sick'
      and deleted_at is null;

    -- Update/confirm Family Responsibility Leave with 24h
    update public.leave_types
    set accrual_rules = jsonb_build_object(
          'yearly_hours', 24,
          'bcea_section', '27'
        ),
        is_paid = true,
        is_active = true
    where company_id = v_talane_id
      and category = 'family_responsibility'
      and deleted_at is null;

    -- Add TOIL if not already present
    if not exists (
      select 1 from public.leave_types
      where company_id = v_talane_id and category = 'toil_taken' and deleted_at is null
    ) then
      insert into public.leave_types (
        company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
      ) values (
        v_talane_id,
        'TOIL (Time Off In Lieu)',
        'toil_taken'::public.leave_category,
        true,
        false,
        true,
        jsonb_build_object(
          'yearly_hours', 0,
          'accrual_multiplier', 1.5,
          'bcea_section', '10'
        )
      );
    end if;

    -- Add Maternity Leave if not present
    if not exists (
      select 1 from public.leave_types
      where company_id = v_talane_id and category = 'maternity' and deleted_at is null
    ) then
      insert into public.leave_types (
        company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
      ) values (
        v_talane_id,
        'Maternity Leave',
        'maternity'::public.leave_category,
        false,
        true,
        true,
        jsonb_build_object(
          'yearly_hours', 0,
          'statutory_months', 4,
          'bcea_section', '25'
        )
      );
    end if;

    -- Add Unpaid Leave if not present
    if not exists (
      select 1 from public.leave_types
      where company_id = v_talane_id and category = 'unpaid' and deleted_at is null
    ) then
      insert into public.leave_types (
        company_id, name, category, is_paid, requires_attachment, is_active, accrual_rules
      ) values (
        v_talane_id,
        'Unpaid Leave',
        'unpaid'::public.leave_category,
        false,
        false,
        true,
        jsonb_build_object('yearly_hours', 0)
      );
    end if;

  end if;

end $$;


-------------------------------------------------------------------------------
-- 3. Stored Procedure: sync_company_bcea_leave_accruals
-- Recalculates accruals from timesheets (hours worked & overtime) vs work rules
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
  v_bcea_min numeric(10,2);
  v_prorata numeric(10,2);
  v_bal_id uuid;
begin

  -- Standard annual hours benchmark (40h/week * 52 = 2080h, or monthly_hours * 12)
  select greatest(coalesce(cs.standard_monthly_hours, 173.33) * 12, 1)
    into v_standard_annual
  from public.company_settings cs
  where cs.company_id = target_company_id;

  if v_standard_annual is null then
    v_standard_annual := 2080.0;
  end if;

  for r_emp in
    select emp.id, emp.full_name, emp.employee_number
    from public.employees emp
    where emp.company_id = target_company_id
      and emp.deleted_at is null
      and emp.employment_status = 'active'
    order by emp.full_name
  loop

    -- Aggregate submitted/approved/locked hours worked
    select
      coalesce(sum(case when te.paid_hours > 0 then te.paid_hours else te.normal_hours end), 0),
      coalesce(sum(te.overtime_hours), 0)
    into v_worked, v_overtime
    from public.time_entries te
    where te.company_id = target_company_id
      and te.employee_id = r_emp.id
      and te.deleted_at is null
      and te.status in ('submitted', 'approved', 'locked');

    for r_lt in
      select lt.id, lt.name, lt.category, lt.accrual_rules
      from public.leave_types lt
      where lt.company_id = target_company_id
        and lt.is_active = true
        and lt.deleted_at is null
        and lt.category in ('annual', 'sick', 'family_responsibility', 'toil_taken')
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

      -- Check existing balance to preserve historical taken_hours or adjustments
      select lb.id, coalesce(lb.taken_hours, 0), coalesce(lb.adjusted_hours, 0)
      into v_bal_id, v_existing_taken, v_adjusted
      from public.leave_balances lb
      where lb.company_id = target_company_id
        and lb.employee_id = r_emp.id
        and lb.leave_type_id = r_lt.id;

      v_taken := greatest(coalesce(v_taken, 0), coalesce(v_existing_taken, 0));
      v_adjusted := coalesce(v_adjusted, 0);

      -- Calculate statutory accrual based on hours worked & work rules
      if r_lt.category = 'annual' then
        -- BCEA Section 20(2)(c): 1 hour for every 17 hours worked, or pro-rata based on work rules
        v_bcea_min := round(v_worked / 17.0, 2);
        if v_yearly_hours > 0 then
          v_prorata := round((v_yearly_hours * v_worked) / v_standard_annual, 2);
          v_accrued := greatest(v_prorata, v_bcea_min);
        else
          v_accrued := v_bcea_min;
        end if;

      elsif r_lt.category = 'sick' then
        -- BCEA Section 22: Sick leave entitlement (pro-rata based on hours worked)
        if v_yearly_hours > 0 then
          v_accrued := least(v_yearly_hours, round((v_yearly_hours * v_worked) / v_standard_annual, 2));
        else
          v_accrued := round(v_worked / 26.0, 2);
        end if;

      elsif r_lt.category = 'family_responsibility' then
        -- BCEA Section 27: 3 working days (24h) for employees
        v_accrued := case when v_yearly_hours > 0 then v_yearly_hours else 24.00 end;

      elsif r_lt.category = 'toil_taken' then
        -- BCEA Section 10(3)(b): 1.5x overtime hours
        v_accrued := round(v_overtime * v_toil_mult, 2);

      else
        v_accrued := 0;
      end if;

      v_net_balance := greatest(0, round(v_accrued + v_adjusted - v_taken, 2));

      -- Upsert leave balance row
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

      -- Return in query result
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

end;
$$;

grant execute on function public.sync_company_bcea_leave_accruals(uuid) to authenticated, service_role;

-------------------------------------------------------------------------------
-- 4. Execute sync for both companies
-------------------------------------------------------------------------------
select * from public.sync_company_bcea_leave_accruals('ce43d3b4-494d-401d-8476-3168465dbc71');
select * from public.sync_company_bcea_leave_accruals('be6a1fb3-2cac-4cf8-b01b-b1339ee07095');
