-- Migration: 20260918203000_auto_assign_payroll_identifiers.sql
-- Automate payroll identifier generation, backfill missing values, and attach trigger to public.employees

-- 1. Function to compute the next available payroll identifier for a company
create or replace function public.next_company_payroll_identifier(
  target_company_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  detected_prefix text := 'ee';
  max_pad integer := 3;
  candidate integer := 1;
  candidate_id text;
  id_exists boolean;
  rec record;
  matches text[];
begin
  -- Scan existing non-blank payroll identifiers to identify prevailing prefix and padding
  for rec in
    select payroll_identifier
    from public.employees
    where company_id = target_company_id
      and payroll_identifier is not null
      and btrim(payroll_identifier) <> ''
  loop
    matches := regexp_match(btrim(rec.payroll_identifier), '^([A-Za-z]+[-_]?)(\d+)$');
    if matches is not null and array_length(matches, 1) = 2 then
      detected_prefix := matches[1];
      if length(matches[2]) > max_pad then
        max_pad := length(matches[2]);
      end if;
    end if;
  end loop;

  -- Find the lowest unused sequence number starting at 1
  loop
    candidate_id := detected_prefix || lpad(candidate::text, max_pad, '0');

    select exists(
      select 1
      from public.employees
      where company_id = target_company_id
        and payroll_identifier = candidate_id
    ) into id_exists;

    if not id_exists then
      return candidate_id;
    end if;

    candidate := candidate + 1;
  end loop;
end;
$$;

grant execute on function public.next_company_payroll_identifier(uuid) to authenticated, service_role;

-- 2. Function to batch auto-assign missing payroll identifiers for a company
create or replace function public.auto_assign_missing_payroll_identifiers(
  target_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_record record;
  assigned_id text;
  updated_count integer := 0;
begin
  for emp_record in
    select id
    from public.employees
    where company_id = target_company_id
      and (payroll_identifier is null or btrim(payroll_identifier) = '')
      and deleted_at is null
    order by created_at asc, employee_number asc
  loop
    assigned_id := public.next_company_payroll_identifier(target_company_id);

    update public.employees
    set payroll_identifier = assigned_id,
        updated_at = now()
    where id = emp_record.id;

    updated_count := updated_count + 1;
  end loop;

  return updated_count;
end;
$$;

grant execute on function public.auto_assign_missing_payroll_identifiers(uuid) to authenticated, service_role;

-- 3. Trigger to auto-assign payroll identifier on employee insert if empty
create or replace function public.trigger_employee_auto_payroll_identifier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.payroll_identifier is null or btrim(NEW.payroll_identifier) = '' then
    NEW.payroll_identifier := public.next_company_payroll_identifier(NEW.company_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_employee_auto_payroll_identifier on public.employees;

create trigger trg_employee_auto_payroll_identifier
before insert on public.employees
for each row
execute function public.trigger_employee_auto_payroll_identifier();

-- 4. Immediately backfill all existing companies
do $$
declare
  comp record;
begin
  for comp in select id from public.companies loop
    perform public.auto_assign_missing_payroll_identifiers(comp.id);
  end loop;
end;
$$;
