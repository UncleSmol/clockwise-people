-- Migration: 20261008010000_employee_payslip_fields_and_adjustments.sql
-- Description: Add statutory and banking fields to employees table and create company_payslips table for Super Admin payslip simulation and adjustment

-- 1. Add employee statutory & banking fields
alter table public.employees
  add column if not exists id_number text,
  add column if not exists tax_number text,
  add column if not exists address text,
  add column if not exists payment_frequency text not null default 'monthly',
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_type text not null default 'Cheque / Current',
  add column if not exists payment_mode text not null default 'EFT';

comment on column public.employees.id_number is 'South African National ID or passport number';
comment on column public.employees.tax_number is 'SARS Tax Reference Number';
comment on column public.employees.address is 'Physical or residential address';
comment on column public.employees.payment_frequency is 'Payment frequency: monthly, weekly, or fortnightly';
comment on column public.employees.bank_name is 'Employee bank name (e.g. Standard Bank, FNB, Capitec, Nedbank, Absa)';
comment on column public.employees.bank_account_number is 'Bank account number';
comment on column public.employees.bank_account_type is 'Account type: Cheque / Current, Savings, Transmission';
comment on column public.employees.payment_mode is 'Payment mode: EFT, Cash, Cheque';

-- 2. Create company_payslips table for simulated & adjusted payslips
create table if not exists public.company_payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  pay_period_label text not null,
  period_start_date date not null,
  period_end_date date not null,
  pay_date date,
  payment_frequency text not null default 'monthly',
  basic_salary numeric(12,2) not null default 0,
  normal_hours numeric(8,2) not null default 0,
  hourly_rate numeric(12,2) not null default 0,
  overtime_15_hours numeric(8,2) not null default 0,
  overtime_15_rate numeric(12,2) not null default 0,
  overtime_15_total numeric(12,2) not null default 0,
  overtime_20_hours numeric(8,2) not null default 0,
  overtime_20_rate numeric(12,2) not null default 0,
  overtime_20_total numeric(12,2) not null default 0,
  commission_base numeric(12,2) not null default 0,
  commission_rate numeric(5,2) not null default 0,
  commission_total numeric(12,2) not null default 0,
  annual_bonus numeric(12,2) not null default 0,
  performance_bonus numeric(12,2) not null default 0,
  travel_allowance numeric(12,2) not null default 0,
  other_allowance numeric(12,2) not null default 0,
  paye_tax numeric(12,2) not null default 0,
  uif_amount numeric(12,2) not null default 0,
  medical_aid numeric(12,2) not null default 0,
  pension_fund numeric(12,2) not null default 0,
  staff_loan numeric(12,2) not null default 0,
  unpaid_absence numeric(12,2) not null default 0,
  other_deductions numeric(12,2) not null default 0,
  gross_earnings numeric(12,2) not null default 0,
  total_deductions numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  bank_name text,
  bank_account_number text,
  bank_account_type text,
  payment_mode text default 'EFT',
  notes text,
  custom_earnings jsonb not null default '[]'::jsonb,
  custom_deductions jsonb not null default '[]'::jsonb,
  is_adjusted boolean not null default false,
  status text not null default 'simulated',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_payslips_unique_period unique (company_id, employee_id, period_start_date, period_end_date)
);

create index if not exists idx_company_payslips_lookup
  on public.company_payslips(company_id, period_start_date, period_end_date);

create index if not exists idx_company_payslips_employee
  on public.company_payslips(employee_id);

-- 3. Row Level Security: Super Admins Only
alter table public.company_payslips enable row level security;

drop policy if exists "super_admin_manage_payslips" on public.company_payslips;
create policy "super_admin_manage_payslips"
  on public.company_payslips
  for all
  using (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.is_super_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.auth_user_id = auth.uid()
        and u.is_super_admin = true
    )
  );

-- 4. Add query_office_text to companies for custom payslip footer notice
alter table public.companies
  add column if not exists query_office_text text;

comment on column public.companies.query_office_text is 'Footer contact text displayed on employee payslips for queries';
