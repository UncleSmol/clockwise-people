-- Migration: 20261030200000_add_employee_gender.sql
-- Description: Add gender field to employees, add parental to leave_category enum, and backfill employee gender from SA ID

-- 1. Add gender column to employees table
alter table public.employees
  add column if not exists gender text;

comment on column public.employees.gender is 'Employee gender: male, female, or other';

-- 2. Add parental category to leave_category enum if not present
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.leave_category'::regtype
      and enumlabel = 'parental'
  ) then
    alter type public.leave_category add value 'parental';
  end if;
end $$;

-- 3. Auto backfill existing employees' gender from 13-digit South African ID number:
-- Digits 7-10 (4 digits): 0000-4999 = female, 5000-9999 = male
update public.employees
set gender = case
  when substring(regexp_replace(id_number, '\D', '', 'g') from 7 for 4)::integer >= 5000 then 'male'
  else 'female'
end
where (gender is null or btrim(gender) = '')
  and id_number is not null
  and length(regexp_replace(id_number, '\D', '', 'g')) = 13;

