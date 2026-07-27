-- Link the super admin (Doctor Khoza) to an employee record so they can
-- clock in, submit leave, and use self-service features.

do $$
declare
  admin_user_id uuid;
  admin_company_id uuid;
  existing_employee_id uuid;
  formalize_workstation_id uuid;
  new_employee_id uuid;
begin
  -- Find the super admin user and their company
  select u.id, u.company_id
    into admin_user_id, admin_company_id
  from public.users u
  where u.auth_user_id = '5a7c5218-1498-46d7-9172-4ed237fa50e9'
    and u.is_super_admin = true
  limit 1;

  if admin_user_id is null then
    raise notice 'Super admin user not found, skipping';
    return;
  end if;

  -- If employee already linked, nothing to do
  if exists (
    select 1 from public.users u
    where u.id = admin_user_id and u.employee_id is not null
  ) then
    raise notice 'Super admin already linked to an employee record';
    return;
  end if;

  -- Check if employee record already exists for this email
  select e.id into existing_employee_id
  from public.employees e
  where e.company_id = admin_company_id
    and e.email = 'doctor@formalize.co.za'
  limit 1;

  if existing_employee_id is not null then
    -- Just link the existing employee record
    update public.users
    set employee_id = existing_employee_id
    where id = admin_user_id;
    return;
  end if;

  -- Create a generic workstation if needed
  select id into formalize_workstation_id
  from public.company_workstations
  where company_id = admin_company_id and name = 'Remote'
  limit 1;

  if formalize_workstation_id is null then
    insert into public.company_workstations (company_id, name, address, latitude, longitude, radius_meters)
    values (admin_company_id, 'Remote', 'South Africa', -26.2041, 28.0473, 1500)
    returning id into formalize_workstation_id;
  end if;

  -- Create employee record
  insert into public.employees (
    company_id,
    employee_number,
    full_name,
    email,
    employment_type,
    employment_status,
    start_date,
    compensation_type,
    monthly_salary,
    workstation_id,
    leave_profile
  )
  values (
    admin_company_id,
    'SUPER-ADMIN-001',
    'Doctor Khoza',
    'doctor@formalize.co.za',
    'full_time',
    'active',
    '2026-07-27',
    'monthly',
    0,
    formalize_workstation_id,
    '{}'::jsonb
  )
  returning id into new_employee_id;

  -- Link the employee record to the user
  update public.users
  set employee_id = new_employee_id
  where id = admin_user_id;
end;
$$;
