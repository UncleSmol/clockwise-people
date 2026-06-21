set check_function_bodies = off;

create extension if not exists "pgcrypto" with schema "extensions";

create type public.app_role as enum (
  'owner',
  'hr_admin',
  'branch_manager',
  'payroll_viewer',
  'employee'
);

create type public.approval_status as enum (
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
  'locked'
);

create type public.payroll_period_status as enum (
  'open',
  'in_review',
  'approved',
  'locked',
  'reopened'
);

create type public.employment_type as enum (
  'full_time',
  'part_time',
  'contract',
  'temporary',
  'casual'
);

create type public.employment_status as enum (
  'active',
  'inactive',
  'on_leave',
  'terminated'
);

create type public.compensation_type as enum (
  'hourly',
  'monthly'
);

create type public.schedule_scope as enum (
  'company',
  'branch',
  'employee'
);

create type public.leave_category as enum (
  'annual',
  'sick',
  'family_responsibility',
  'maternity',
  'unpaid',
  'toil_taken',
  'other'
);

create type public.toil_transaction_type as enum (
  'opening_balance',
  'overtime_converted',
  'toil_taken',
  'manual_adjustment',
  'correction'
);

create type public.approval_request_type as enum (
  'timesheet',
  'leave_request',
  'overtime',
  'toil_booking',
  'manual_adjustment',
  'payroll_period'
);

create type public.audit_action as enum (
  'create',
  'update',
  'delete',
  'submit',
  'approve',
  'reject',
  'cancel',
  'lock',
  'reopen',
  'adjust'
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registration_number text,
  country text not null default 'South Africa',
  timezone text not null default 'Africa/Johannesburg',
  payroll_cycle text not null default 'monthly',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint companies_name_not_blank check (btrim(name) <> '')
);

create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  standard_monthly_hours numeric(8,2) not null default 173.33,
  standard_daily_hours numeric(5,2) not null default 8,
  default_lunch_minutes integer not null default 60,
  overtime_rules jsonb not null default '{}'::jsonb,
  toil_rules jsonb not null default '{}'::jsonb,
  leave_rules jsonb not null default '{}'::jsonb,
  approval_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_settings_hours_positive check (standard_monthly_hours > 0 and standard_daily_hours > 0),
  constraint company_settings_lunch_non_negative check (default_lunch_minutes >= 0)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text,
  address text,
  timezone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint branches_name_not_blank check (btrim(name) <> ''),
  constraint branches_company_name_unique unique (company_id, name),
  constraint branches_company_code_unique unique (company_id, code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint departments_name_not_blank check (btrim(name) <> ''),
  constraint departments_company_name_unique unique (company_id, name)
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  status employment_status not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint users_full_name_not_blank check (btrim(full_name) <> ''),
  constraint users_email_not_blank check (btrim(email) <> ''),
  constraint users_company_auth_unique unique (company_id, auth_user_id),
  constraint users_company_email_unique unique (company_id, email)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  key app_role not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_company_key_unique unique (company_id, key)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint permissions_key_not_blank check (btrim(key) <> ''),
  constraint permissions_company_key_unique unique (company_id, key)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  scope schedule_scope not null default 'company',
  standard_monthly_hours numeric(8,2),
  standard_daily_hours numeric(5,2),
  saturday_rules jsonb not null default '{}'::jsonb,
  public_holiday_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_schedules_name_not_blank check (btrim(name) <> '')
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  employee_number text not null,
  full_name text not null,
  known_as text,
  email text,
  phone_number text,
  branch_id uuid not null references public.branches(id),
  department_id uuid references public.departments(id) on delete set null,
  job_title text,
  employment_type employment_type not null default 'full_time',
  employment_status employment_status not null default 'active',
  start_date date not null,
  end_date date,
  work_schedule_id uuid references public.work_schedules(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  compensation_type compensation_type not null default 'monthly',
  hourly_rate numeric(12,2),
  monthly_salary numeric(12,2),
  leave_profile jsonb not null default '{}'::jsonb,
  payroll_identifier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint employees_number_not_blank check (btrim(employee_number) <> ''),
  constraint employees_full_name_not_blank check (btrim(full_name) <> ''),
  constraint employees_dates_valid check (end_date is null or end_date >= start_date),
  constraint employees_company_number_unique unique (company_id, employee_number),
  constraint employees_company_email_unique unique (company_id, email)
);

alter table public.users
  add column employee_id uuid references public.employees(id) on delete set null;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.user_branch_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_schedule_id uuid not null references public.work_schedules(id) on delete cascade,
  day_of_week integer not null,
  start_time time,
  end_time time,
  lunch_minutes integer not null default 0,
  paid_hours numeric(5,2) not null default 0,
  is_working_day boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_days_day_valid check (day_of_week between 0 and 6),
  constraint schedule_days_lunch_non_negative check (lunch_minutes >= 0),
  constraint schedule_days_paid_hours_non_negative check (paid_hours >= 0),
  constraint schedule_days_unique unique (work_schedule_id, day_of_week)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  status payroll_period_status not null default 'open',
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  locked_by uuid references public.users(id) on delete set null,
  locked_at timestamptz,
  reopened_by uuid references public.users(id) on delete set null,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payroll_periods_dates_valid check (period_end >= period_start),
  constraint payroll_periods_company_dates_unique unique (company_id, period_start, period_end)
);

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  status approval_status not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  timesheet_id uuid not null references public.timesheets(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  work_date date not null,
  branch_id uuid not null references public.branches(id),
  clock_in time,
  lunch_start time,
  lunch_end time,
  clock_out time,
  gross_hours numeric(6,2) not null default 0,
  lunch_hours numeric(6,2) not null default 0,
  paid_hours numeric(6,2) not null default 0,
  normal_hours numeric(6,2) not null default 0,
  overtime_hours numeric(6,2) not null default 0,
  missing_clocking boolean not null default false,
  late_arrival boolean not null default false,
  early_departure boolean not null default false,
  warning_notes text,
  notes text,
  status approval_status not null default 'draft',
  submitted_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint time_entries_hours_non_negative check (
    gross_hours >= 0 and lunch_hours >= 0 and paid_hours >= 0 and normal_hours >= 0 and overtime_hours >= 0
  ),
  constraint time_entries_employee_date_unique unique (company_id, employee_id, work_date)
);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category leave_category not null,
  is_paid boolean not null default true,
  requires_attachment boolean not null default false,
  accrual_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint leave_types_name_not_blank check (btrim(name) <> ''),
  constraint leave_types_company_name_unique unique (company_id, name)
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  balance_hours numeric(8,2) not null default 0,
  accrued_hours numeric(8,2) not null default 0,
  taken_hours numeric(8,2) not null default 0,
  adjusted_hours numeric(8,2) not null default 0,
  as_of_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_balances_unique unique (company_id, employee_id, leave_type_id)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  start_date date not null,
  end_date date not null,
  total_hours numeric(8,2) not null,
  reason text,
  attachment_url text,
  status approval_status not null default 'draft',
  submitted_at timestamptz,
  submitted_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint leave_requests_dates_valid check (end_date >= start_date),
  constraint leave_requests_hours_positive check (total_hours > 0)
);

create table public.overtime_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  time_entry_id uuid references public.time_entries(id) on delete set null,
  work_date date,
  daily_paid_hours numeric(8,2) not null default 0,
  monthly_paid_hours numeric(8,2) not null default 0,
  normal_hours numeric(8,2) not null default 0,
  excess_hours numeric(8,2) not null default 0,
  overtime_before_cap numeric(8,2) not null default 0,
  overtime_after_cap numeric(8,2) not null default 0,
  fill_up_applied numeric(8,2) not null default 0,
  payroll_overtime_hours numeric(8,2) not null default 0,
  toil_convertible_hours numeric(8,2) not null default 0,
  calculation_details jsonb not null default '{}'::jsonb,
  status approval_status not null default 'draft',
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.toil_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  transaction_date date not null,
  transaction_type toil_transaction_type not null,
  hours numeric(8,2) not null,
  source_table text,
  source_record_id uuid,
  overtime_record_id uuid references public.overtime_records(id) on delete set null,
  leave_request_id uuid references public.leave_requests(id) on delete set null,
  reason text,
  status approval_status not null default 'approved',
  created_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint toil_transactions_hours_not_zero check (hours <> 0)
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_type approval_request_type not null,
  request_id uuid not null,
  submitted_by uuid references public.users(id) on delete set null,
  approver_id uuid references public.users(id) on delete set null,
  status approval_status not null default 'submitted',
  notes text,
  submitted_at timestamptz not null default now(),
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  normal_hours numeric(8,2) not null default 0,
  overtime_hours numeric(8,2) not null default 0,
  payroll_overtime_hours numeric(8,2) not null default 0,
  toil_earned_hours numeric(8,2) not null default 0,
  toil_taken_hours numeric(8,2) not null default 0,
  toil_balance_hours numeric(8,2) not null default 0,
  leave_taken_hours numeric(8,2) not null default 0,
  missing_clockings_count integer not null default 0,
  late_arrivals_count integer not null default 0,
  early_departures_count integer not null default 0,
  status approval_status not null default 'draft',
  generated_at timestamptz not null default now(),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint monthly_summaries_unique unique (company_id, payroll_period_id, employee_id),
  constraint monthly_summaries_counts_non_negative check (
    missing_clockings_count >= 0 and late_arrivals_count >= 0 and early_departures_count >= 0
  )
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action audit_action not null,
  affected_table text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip_address inet,
  device_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_affected_table_not_blank check (btrim(affected_table) <> '')
);

create or replace view public.toil_balances
with (security_invoker = true) as
select
  company_id,
  employee_id,
  coalesce(sum(hours) filter (where deleted_at is null and status in ('approved', 'locked')), 0)::numeric(10,2) as balance_hours
from public.toil_transactions
group by company_id, employee_id;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.company_id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.status = 'active'
    and u.deleted_at is null;
$$;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.company_id = target_company_id
      and u.status = 'active'
      and u.deleted_at is null
  );
$$;

create or replace function public.has_company_role(target_company_id uuid, target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.company_id = u.company_id and ur.revoked_at is null
    join public.roles r on r.id = ur.role_id and r.company_id = u.company_id
    where u.auth_user_id = auth.uid()
      and u.company_id = target_company_id
      and u.status = 'active'
      and u.deleted_at is null
      and r.key = target_role
  );
$$;

create or replace function public.prevent_locked_payroll_period_changes()
returns trigger
language plpgsql
as $$
declare
  target_period_id uuid;
begin
  target_period_id := coalesce(new.payroll_period_id, old.payroll_period_id);

  if target_period_id is not null and exists (
    select 1
    from public.payroll_periods pp
    where pp.id = target_period_id
      and pp.status = 'locked'
  ) then
    raise exception 'Cannot modify records linked to a locked payroll period';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.seed_company_default_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roles (company_id, name, key, description, is_system)
  values
    (new.id, 'Company Owner / Super Admin', 'owner', 'Tenant-level control over setup, users, rules, reports, and billing.', true),
    (new.id, 'HR Admin', 'hr_admin', 'Operational control over employees, leave, timesheets, TOIL, overtime, and reports.', true),
    (new.id, 'Branch Manager', 'branch_manager', 'Branch-scoped approval and reporting.', true),
    (new.id, 'Payroll Viewer', 'payroll_viewer', 'Read-only access to locked payroll-ready reports.', true),
    (new.id, 'Employee', 'employee', 'Self-service time, leave, balances, and approvals.', true);

  insert into public.company_settings (company_id)
  values (new.id);

  return new;
end;
$$;

create trigger companies_seed_defaults
after insert on public.companies
for each row execute function public.seed_company_default_roles();

create trigger companies_set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger company_settings_set_updated_at before update on public.company_settings for each row execute function public.set_updated_at();
create trigger branches_set_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger departments_set_updated_at before update on public.departments for each row execute function public.set_updated_at();
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger work_schedules_set_updated_at before update on public.work_schedules for each row execute function public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger schedule_days_set_updated_at before update on public.schedule_days for each row execute function public.set_updated_at();
create trigger payroll_periods_set_updated_at before update on public.payroll_periods for each row execute function public.set_updated_at();
create trigger timesheets_set_updated_at before update on public.timesheets for each row execute function public.set_updated_at();
create trigger time_entries_set_updated_at before update on public.time_entries for each row execute function public.set_updated_at();
create trigger leave_types_set_updated_at before update on public.leave_types for each row execute function public.set_updated_at();
create trigger leave_balances_set_updated_at before update on public.leave_balances for each row execute function public.set_updated_at();
create trigger leave_requests_set_updated_at before update on public.leave_requests for each row execute function public.set_updated_at();
create trigger overtime_records_set_updated_at before update on public.overtime_records for each row execute function public.set_updated_at();
create trigger toil_transactions_set_updated_at before update on public.toil_transactions for each row execute function public.set_updated_at();
create trigger approval_requests_set_updated_at before update on public.approval_requests for each row execute function public.set_updated_at();
create trigger monthly_summaries_set_updated_at before update on public.monthly_summaries for each row execute function public.set_updated_at();

create trigger timesheets_prevent_locked_changes before update or delete on public.timesheets for each row execute function public.prevent_locked_payroll_period_changes();
create trigger time_entries_prevent_locked_changes before update or delete on public.time_entries for each row execute function public.prevent_locked_payroll_period_changes();
create trigger leave_requests_prevent_locked_changes before update or delete on public.leave_requests for each row execute function public.prevent_locked_payroll_period_changes();
create trigger overtime_records_prevent_locked_changes before update or delete on public.overtime_records for each row execute function public.prevent_locked_payroll_period_changes();
create trigger monthly_summaries_prevent_locked_changes before update or delete on public.monthly_summaries for each row execute function public.prevent_locked_payroll_period_changes();

create index idx_company_settings_company_id on public.company_settings(company_id);
create index idx_branches_company_id on public.branches(company_id);
create index idx_departments_company_id on public.departments(company_id);
create index idx_users_company_id on public.users(company_id);
create index idx_users_auth_user_id on public.users(auth_user_id);
create index idx_roles_company_id on public.roles(company_id);
create index idx_permissions_company_id on public.permissions(company_id);
create index idx_user_roles_company_user on public.user_roles(company_id, user_id);
create unique index idx_user_roles_unique_active on public.user_roles(company_id, user_id, role_id) where revoked_at is null;
create index idx_user_branch_assignments_company_user on public.user_branch_assignments(company_id, user_id);
create unique index idx_user_branch_assignments_unique_active on public.user_branch_assignments(company_id, user_id, branch_id) where revoked_at is null;
create index idx_employees_company_id on public.employees(company_id);
create index idx_employees_company_branch on public.employees(company_id, branch_id);
create index idx_work_schedules_company_id on public.work_schedules(company_id);
create index idx_schedule_days_company_schedule on public.schedule_days(company_id, work_schedule_id);
create index idx_timesheets_company_employee on public.timesheets(company_id, employee_id);
create index idx_timesheets_company_period on public.timesheets(company_id, payroll_period_id);
create index idx_time_entries_company_employee_date on public.time_entries(company_id, employee_id, work_date);
create index idx_time_entries_company_status on public.time_entries(company_id, status);
create index idx_leave_types_company_id on public.leave_types(company_id);
create index idx_leave_balances_company_employee on public.leave_balances(company_id, employee_id);
create index idx_leave_requests_company_status on public.leave_requests(company_id, status);
create index idx_leave_requests_company_employee_dates on public.leave_requests(company_id, employee_id, start_date, end_date);
create index idx_overtime_records_company_employee_period on public.overtime_records(company_id, employee_id, payroll_period_id);
create index idx_toil_transactions_company_employee_date on public.toil_transactions(company_id, employee_id, transaction_date);
create index idx_approval_requests_company_status on public.approval_requests(company_id, status);
create index idx_approval_requests_company_request on public.approval_requests(company_id, request_type, request_id);
create index idx_payroll_periods_company_status on public.payroll_periods(company_id, status);
create index idx_monthly_summaries_company_period on public.monthly_summaries(company_id, payroll_period_id);
create index idx_audit_logs_company_created_at on public.audit_logs(company_id, created_at desc);
create index idx_audit_logs_company_record on public.audit_logs(company_id, affected_table, record_id);

alter table public.companies enable row level security;
alter table public.company_settings enable row level security;
alter table public.branches enable row level security;
alter table public.departments enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_branch_assignments enable row level security;
alter table public.employees enable row level security;
alter table public.work_schedules enable row level security;
alter table public.schedule_days enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.timesheets enable row level security;
alter table public.time_entries enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.overtime_records enable row level security;
alter table public.toil_transactions enable row level security;
alter table public.approval_requests enable row level security;
alter table public.monthly_summaries enable row level security;
alter table public.audit_logs enable row level security;

create policy "company members can view company"
on public.companies for select
to authenticated
using (id in (select public.current_user_company_ids()));

create policy "owners and hr admins can update company"
on public.companies for update
to authenticated
using (public.has_company_role(id, 'owner') or public.has_company_role(id, 'hr_admin'))
with check (public.has_company_role(id, 'owner') or public.has_company_role(id, 'hr_admin'));

create policy "company members can view settings"
on public.company_settings for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage settings"
on public.company_settings for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view branches"
on public.branches for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage branches"
on public.branches for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view departments"
on public.departments for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage departments"
on public.departments for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view users"
on public.users for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage users"
on public.users for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view roles"
on public.roles for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage roles"
on public.roles for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view permissions"
on public.permissions for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage permissions"
on public.permissions for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view employees"
on public.employees for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage employees"
on public.employees for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view schedules"
on public.work_schedules for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage schedules"
on public.work_schedules for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view schedule days"
on public.schedule_days for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage schedule days"
on public.schedule_days for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view payroll periods"
on public.payroll_periods for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage payroll periods"
on public.payroll_periods for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view timesheets"
on public.timesheets for select
to authenticated
using (public.is_company_member(company_id));

create policy "company members can manage timesheets"
on public.timesheets for all
to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "company members can view time entries"
on public.time_entries for select
to authenticated
using (public.is_company_member(company_id));

create policy "company members can manage time entries"
on public.time_entries for all
to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "company members can view leave types"
on public.leave_types for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage leave types"
on public.leave_types for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view leave balances"
on public.leave_balances for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage leave balances"
on public.leave_balances for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view leave requests"
on public.leave_requests for select
to authenticated
using (public.is_company_member(company_id));

create policy "company members can manage leave requests"
on public.leave_requests for all
to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "company members can view overtime records"
on public.overtime_records for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage overtime records"
on public.overtime_records for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin') or public.has_company_role(company_id, 'branch_manager'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin') or public.has_company_role(company_id, 'branch_manager'));

create policy "company members can view toil transactions"
on public.toil_transactions for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage toil transactions"
on public.toil_transactions for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view approval requests"
on public.approval_requests for select
to authenticated
using (public.is_company_member(company_id));

create policy "company members can manage approval requests"
on public.approval_requests for all
to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "company members can view monthly summaries"
on public.monthly_summaries for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners hr admins and payroll viewers can manage monthly summaries"
on public.monthly_summaries for all
to authenticated
using (
  public.has_company_role(company_id, 'owner')
  or public.has_company_role(company_id, 'hr_admin')
  or public.has_company_role(company_id, 'payroll_viewer')
)
with check (
  public.has_company_role(company_id, 'owner')
  or public.has_company_role(company_id, 'hr_admin')
  or public.has_company_role(company_id, 'payroll_viewer')
);

create policy "owners and hr admins can view audit logs"
on public.audit_logs for select
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can create audit logs"
on public.audit_logs for insert
to authenticated
with check (public.is_company_member(company_id));

create policy "company members can view role permissions"
on public.role_permissions for select
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and public.is_company_member(r.company_id)
  )
);

create policy "owners and hr admins can manage role permissions"
on public.role_permissions for all
to authenticated
using (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (public.has_company_role(r.company_id, 'owner') or public.has_company_role(r.company_id, 'hr_admin'))
  )
)
with check (
  exists (
    select 1
    from public.roles r
    where r.id = role_permissions.role_id
      and (public.has_company_role(r.company_id, 'owner') or public.has_company_role(r.company_id, 'hr_admin'))
  )
);

create policy "company members can view user roles"
on public.user_roles for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage user roles"
on public.user_roles for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

create policy "company members can view branch assignments"
on public.user_branch_assignments for select
to authenticated
using (public.is_company_member(company_id));

create policy "owners and hr admins can manage branch assignments"
on public.user_branch_assignments for all
to authenticated
using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'))
with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'hr_admin'));

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
