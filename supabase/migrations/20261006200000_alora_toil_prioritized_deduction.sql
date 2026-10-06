-- 20261006200000_alora_toil_prioritized_deduction.sql
-- Configure TOIL rules for Alora Dental Care (OT paid in time off at 1.5x)
-- and support TOIL priority deduction ("load TOIL first before leave unless specified").

-------------------------------------------------------------------------------
-- 1. Ensure company_settings and configure TOIL for Alora Dental Care
-------------------------------------------------------------------------------
do $$
declare
  v_alora_id constant uuid := 'ce43d3b4-494d-401d-8476-3168465dbc71';
begin
  if exists (select 1 from public.companies where id = v_alora_id) then
    -- Ensure row exists
    insert into public.company_settings (
      company_id,
      standard_monthly_hours,
      standard_daily_hours,
      default_lunch_minutes
    ) values (
      v_alora_id,
      173.33,
      8.00,
      60
    ) on conflict (company_id) do nothing;

    -- Update TOIL & Overtime rules
    update public.company_settings
    set toil_rules = jsonb_build_object(
          'enabled', true,
          'accrual_multiplier', 1.5,
          'load_toil_first', true,
          'prioritize_toil_before_leave', true,
          'description', 'Overtime paid in time off at 1.5x. TOIL is loaded first before leave unless specified.'
        ),
        overtime_rules = coalesce(overtime_rules, '{}'::jsonb) || jsonb_build_object(
          'compensation_mode', 'toil',
          'toil_multiplier', 1.5,
          'enabled', true
        ),
        updated_at = now()
    where company_id = v_alora_id;
  end if;
end;
$$;

-------------------------------------------------------------------------------
-- 2. Add use_toil_first and toil_hours_used to public.leave_requests
-------------------------------------------------------------------------------
alter table public.leave_requests
  add column if not exists use_toil_first boolean not null default true,
  add column if not exists toil_hours_used numeric(8,2) not null default 0;

-------------------------------------------------------------------------------
-- 3. Update calculate_employee_leave_request_hours to support TOIL priority
-------------------------------------------------------------------------------
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
  v_toil_balance numeric(8,2) := 0;
  v_toil_to_use numeric(8,2) := 0;
  v_leave_to_use numeric(8,2) := 0;
  v_load_toil_first boolean := false;
  working_days integer := 0;
  public_holiday_count integer := 0;
  non_working_days integer := 0;
  detail jsonb := '[]'::jsonb;
  current_day date;
  current_dow integer;
  schedule_day public.schedule_days%rowtype;
  holiday public.company_public_holidays%rowtype;
  daily_hours numeric(8,2);
  absent boolean := false;
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

  select *
    into leave_balance
  from public.leave_balances
  where company_id = employee.company_id
    and employee_id = employee.id
    and leave_type_id = leave_type.id;

  available_hours := coalesce(leave_balance.balance_hours, 0);

  select *
    into company_setting
  from public.company_settings
  where company_id = employee.company_id;

  -- Check employee's available TOIL balance
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

  v_toil_balance := coalesce(v_toil_balance, 0);

  -- Determine if TOIL priority applies (Annual leave or general leave with TOIL balance)
  v_load_toil_first := (
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
        'label', holiday.name
      ));
      continue;
    end if;

    select exists (
      select 1
      from public.time_entries te
      where te.company_id = employee.company_id
        and te.employee_id = employee.id
        and te.work_date = current_day
        and te.deleted_at is null
    )
      into absent;

    schedule_day := null;

    if assigned_rule_count > 0 then
      select sd.*
        into schedule_day
      from public.employee_work_schedule_assignments assignments
      join public.work_schedules schedules
        on schedules.id = assignments.work_schedule_id
       and schedules.company_id = assignments.company_id
       and schedules.is_active
       and schedules.deleted_at is null
      join public.schedule_days sd
        on sd.work_schedule_id = schedules.id
       and sd.day_of_week = current_dow
       and sd.is_working_day
      where assignments.company_id = employee.company_id
        and assignments.employee_id = employee.id
        and assignments.is_active
        and assignments.deleted_at is null
        and assignments.effective_from <= current_day
        and (assignments.effective_to is null or assignments.effective_to >= current_day)
      order by assignments.priority desc, assignments.effective_from desc, assignments.created_at desc
      limit 1;

      if not found then
        if employee.work_schedule_id is not null then
          select *
            into schedule_day
          from public.schedule_days sd
          where sd.work_schedule_id = employee.work_schedule_id
            and sd.day_of_week = current_dow
            and coalesce(sd.is_working_day, false)
          limit 1;
        end if;

        if schedule_day is null then
          select sd.*
            into schedule_day
          from public.work_schedules schedules
          join public.schedule_days sd
            on sd.work_schedule_id = schedules.id
           and sd.day_of_week = current_dow
           and coalesce(sd.is_working_day, false)
          where schedules.company_id = employee.company_id
            and schedules.scope = 'company'
            and schedules.is_active
            and schedules.deleted_at is null
          order by schedules.created_at desc
          limit 1;
        end if;

        if schedule_day is not null
          and coalesce(schedule_day.is_working_day, false) then
          daily_hours := coalesce(
            nullif(schedule_day.paid_hours, 0),
            case
              when schedule_day.start_time is not null and schedule_day.end_time is not null then
                greatest(
                  extract(epoch from (schedule_day.end_time - schedule_day.start_time)) / 3600
                  - (greatest(coalesce(schedule_day.lunch_minutes, 0), 0)::numeric / 60),
                  0
                )::numeric(8,2)
              else null
            end,
            company_setting.standard_daily_hours,
            8
          )::numeric(8,2);

          if daily_hours > 0 then
            total_hours := total_hours + daily_hours;
            working_days := working_days + 1;
            detail := detail || jsonb_build_array(jsonb_build_object(
              'date', current_day,
              'hours', daily_hours,
              'reason', 'working_day'
            ));
            continue;
          end if;
        end if;

        non_working_days := non_working_days + 1;
        detail := detail || jsonb_build_array(jsonb_build_object(
          'date', current_day,
          'hours', 0,
          'reason', 'non_working_day'
        ));
        continue;
      end if;
    elsif employee.work_schedule_id is not null then
      select *
        into schedule_day
      from public.schedule_days sd
      where sd.work_schedule_id = employee.work_schedule_id
        and sd.day_of_week = current_dow
      limit 1;

      if not found or not coalesce(schedule_day.is_working_day, false) then
        select sd.*
          into schedule_day
        from public.work_schedules schedules
        join public.schedule_days sd
          on sd.work_schedule_id = schedules.id
         and sd.day_of_week = current_dow
         and coalesce(sd.is_working_day, false)
        where schedules.company_id = employee.company_id
          and schedules.scope = 'company'
          and schedules.is_active
          and schedules.deleted_at is null
        order by schedules.created_at desc
        limit 1;

        if schedule_day is not null
          and coalesce(schedule_day.is_working_day, false) then
          daily_hours := coalesce(
            nullif(schedule_day.paid_hours, 0),
            case
              when schedule_day.start_time is not null and schedule_day.end_time is not null then
                greatest(
                  extract(epoch from (schedule_day.end_time - schedule_day.start_time)) / 3600
                  - (greatest(coalesce(schedule_day.lunch_minutes, 0), 0)::numeric / 60),
                  0
                )::numeric(8,2)
              else null
            end,
            company_setting.standard_daily_hours,
            8
          )::numeric(8,2);

          if daily_hours > 0 then
            total_hours := total_hours + daily_hours;
            working_days := working_days + 1;
            detail := detail || jsonb_build_array(jsonb_build_object(
              'date', current_day,
              'hours', daily_hours,
              'reason', 'working_day'
            ));
            continue;
          end if;
        end if;
      end if;
    else
      select sd.*
        into schedule_day
      from public.work_schedules schedules
      join public.schedule_days sd
        on sd.work_schedule_id = schedules.id
       and sd.day_of_week = current_dow
       and coalesce(sd.is_working_day, false)
      where schedules.company_id = employee.company_id
        and schedules.scope = 'company'
        and schedules.is_active
        and schedules.deleted_at is null
      order by schedules.created_at desc
      limit 1;

      if not found and current_dow in (0, 6) then
        non_working_days := non_working_days + 1;
        detail := detail || jsonb_build_array(jsonb_build_object(
          'date', current_day,
          'hours', 0,
          'reason', 'non_working_day'
        ));
        continue;
      end if;
    end if;

    daily_hours := coalesce(
      nullif(schedule_day.paid_hours, 0),
      case
        when schedule_day.start_time is not null and schedule_day.end_time is not null then
          greatest(
            extract(epoch from (schedule_day.end_time - schedule_day.start_time)) / 3600
            - (greatest(coalesce(schedule_day.lunch_minutes, 0), 0)::numeric / 60),
            0
          )::numeric(8,2)
        else null
      end,
      company_setting.standard_daily_hours,
      8
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

  -- Compute TOIL and Leave deduction breakdown
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
    'exceeds_balance', total_hours > v_effective_available,
    'leave_type_name', leave_type.name,
    'non_working_days', non_working_days,
    'public_holidays', public_holiday_count,
    'remaining_hours', v_effective_available - total_hours,
    'total_hours', total_hours,
    'working_days', working_days
  );
end;
$$;

-------------------------------------------------------------------------------
-- 4. Update submit_own_leave_request with TOIL first preference
-------------------------------------------------------------------------------
create or replace function public.submit_own_leave_request(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date,
  request_total_hours numeric,
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
  leave_request public.leave_requests%rowtype;
  calculated jsonb;
  calculated_hours numeric(8,2);
  available_hours numeric(8,2);
  v_use_toil boolean;
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
  calculated_hours := (calculated->>'total_hours')::numeric(8,2);

  v_use_toil := coalesce(request_use_toil_first, true);
  if v_use_toil then
    available_hours := (calculated->>'available_hours')::numeric(8,2);
  else
    available_hours := coalesce((calculated->>'leave_type_available_hours')::numeric(8,2), (calculated->>'available_hours')::numeric(8,2));
  end if;

  if calculated_hours <= 0 then
    raise exception 'The selected dates do not include working hours';
  end if;

  if calculated_hours > available_hours then
    raise exception 'You only have % hours available for % leave', available_hours, leave_type.name;
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
      concat('Calculated leave hours: ', calculated_hours),
      case when v_use_toil then 'Policy: Load TOIL first before leave' else 'Policy: Direct leave type deduction' end
    )
  );

  return leave_request;
end;
$$;

-- Backward-compatible overload for 6 arguments
create or replace function public.submit_own_leave_request(
  target_leave_type_id uuid,
  request_start_date date,
  request_end_date date,
  request_total_hours numeric,
  request_reason text default null,
  request_attachment_url text default null
)
returns public.leave_requests
language sql
security definer
set search_path = public
as $$
  select public.submit_own_leave_request(
    target_leave_type_id,
    request_start_date,
    request_end_date,
    request_total_hours,
    request_reason,
    request_attachment_url,
    true
  );
$$;

grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text, boolean) to authenticated;
grant execute on function public.submit_own_leave_request(uuid, date, date, numeric, text, text) to authenticated;

-------------------------------------------------------------------------------
-- 5. Update review_managed_leave_request to deduct TOIL first on approval
-------------------------------------------------------------------------------
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
  calculated jsonb;
  day_item jsonb;
  day_date date;
  day_hours numeric(8,2);
  target_period_id uuid;
  target_timesheet_id uuid;
  v_toil_bal_hours numeric(8,2) := 0;
  v_toil_bal_id uuid;
  v_toil_type_id uuid;
  v_toil_deduct numeric(8,2) := 0;
  v_leave_deduct numeric(8,2) := 0;
begin
  if auth.uid() is null then
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

  if actor.id is null or not (public.is_super_admin() or public.can_manage_time_record(existing.company_id, existing.employee_id)) then
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

    -- If use_toil_first is active (default true) and leave type is annual or general
    if coalesce(reviewed.use_toil_first, true) and leave_type.category in ('annual', 'other') then
      -- Look up active TOIL balance
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

        -- 1. Deduct from TOIL leave balance
        update public.leave_balances
        set taken_hours = taken_hours + v_toil_deduct,
            balance_hours = greatest(balance_hours - v_toil_deduct, 0),
            as_of_date = current_date,
            updated_at = now()
        where id = v_toil_bal_id;

        -- 2. Insert audit transaction in toil_transactions
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

        -- 3. Record toil_hours_used on leave_requests
        update public.leave_requests
        set toil_hours_used = v_toil_deduct
        where id = reviewed.id;

        -- 4. Deduct remaining portion from requested leave type
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
        -- No TOIL balance available: deduct full hours from requested leave type
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
      -- Standard direct deduction
      update public.leave_balances
      set taken_hours = taken_hours + reviewed.total_hours,
          balance_hours = greatest(balance_hours - reviewed.total_hours, 0),
          as_of_date = current_date,
          updated_at = now()
      where company_id = reviewed.company_id
        and employee_id = reviewed.employee_id
        and leave_type_id = reviewed.leave_type_id;
    end if;

    -- Auto-create time entries for approved leave days
    select *
      into employee
    from public.employees
    where id = reviewed.employee_id
      and company_id = reviewed.company_id
      and deleted_at is null;

    if found then
      calculated := public.calculate_employee_leave_request_hours(
        reviewed.employee_id,
        reviewed.leave_type_id,
        reviewed.start_date,
        reviewed.end_date
      );

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

        select id
          into target_period_id
        from public.payroll_periods
        where company_id = reviewed.company_id
          and day_date between period_start and period_end
          and status in ('open', 'reopened')
          and deleted_at is null
        order by period_start desc
        limit 1;

        select id
          into target_timesheet_id
        from public.timesheets
        where company_id = reviewed.company_id
          and employee_id = reviewed.employee_id
          and (
            (target_period_id is not null and payroll_period_id = target_period_id)
            or (target_period_id is null and payroll_period_id is null and status = 'draft')
          )
          and status in ('draft', 'rejected')
          and deleted_at is null
        order by created_at desc
        limit 1;

        if target_timesheet_id is null then
          insert into public.timesheets (
            company_id,
            employee_id,
            payroll_period_id,
            status
          )
          values (
            reviewed.company_id,
            reviewed.employee_id,
            target_period_id,
            'draft'
          )
          returning id into target_timesheet_id;
        end if;

        insert into public.time_entries (
          company_id,
          timesheet_id,
          employee_id,
          payroll_period_id,
          work_date,
          workstation_id,
          paid_hours,
          normal_hours,
          overtime_hours,
          lunch_hours,
          gross_hours,
          missing_clocking,
          status,
          notes,
          leave_type_id
        )
        values (
          reviewed.company_id,
          target_timesheet_id,
          reviewed.employee_id,
          target_period_id,
          day_date,
          employee.workstation_id,
          day_hours,
          day_hours,
          0,
          0,
          day_hours,
          false,
          'approved',
          case
            when v_toil_deduct > 0 then 'TOIL / Leave: ' || coalesce(leave_type.name, 'Approved leave')
            else 'Leave: ' || coalesce(leave_type.name, 'Approved leave')
          end,
          case
            when v_toil_deduct >= day_hours and v_toil_type_id is not null then v_toil_type_id
            else reviewed.leave_type_id
          end
        );
      end loop;
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
      reviewed.company_id,
      actor.id,
      'approved'::public.audit_action,
      'leave_requests',
      reviewed.id,
      to_jsonb(existing),
      to_jsonb(reviewed),
      concat_ws(
        ' | ',
        manager_notes,
        case when v_toil_deduct > 0 then concat('Loaded TOIL first: ', v_toil_deduct, 'h') else null end
      )
    );
  else
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
      reviewed.company_id,
      actor.id,
      'rejected'::public.audit_action,
      'leave_requests',
      reviewed.id,
      to_jsonb(existing),
      to_jsonb(reviewed),
      manager_notes
    );
  end if;

  update public.approval_requests
  set status = reviewed.status,
      approver_id = actor.id,
      actioned_at = now(),
      notes = concat_ws(E'\n', notes, manager_notes)
  where company_id = reviewed.company_id
    and request_type = 'leave_request'
    and request_id = reviewed.id;

  return reviewed;
end;
$$;

grant execute on function public.review_managed_leave_request(uuid, boolean, text) to authenticated, service_role;
