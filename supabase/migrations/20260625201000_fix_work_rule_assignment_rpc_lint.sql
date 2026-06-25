create or replace function public.set_employee_work_schedule_assignments(
  target_employee_id uuid,
  target_work_schedule_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  employee public.employees%rowtype;
  target_ids uuid[] := '{}'::uuid[];
  first_schedule_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select array_agg(work_schedule_id order by first_position)
    into target_ids
  from (
    select
      selected.value as work_schedule_id,
      min(selected.position) as first_position
    from unnest(coalesce(target_work_schedule_ids, '{}'::uuid[])) with ordinality as selected(value, position)
    where selected.value is not null
    group by selected.value
  ) ordered_ids;

  target_ids := coalesce(target_ids, '{}'::uuid[]);
  first_schedule_id := target_ids[1];

  select *
    into employee
  from public.employees
  where id = target_employee_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Employee could not be found';
  end if;

  if not public.has_any_company_role(employee.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can assign work rules';
  end if;

  if exists (
    select 1
    from unnest(target_ids) as selected(work_schedule_id)
    left join public.work_schedules schedules
      on schedules.id = selected.work_schedule_id
     and schedules.company_id = employee.company_id
     and schedules.deleted_at is null
    where schedules.id is null
  ) then
    raise exception 'One or more work rules do not belong to this company';
  end if;

  update public.employee_work_schedule_assignments
  set is_active = false,
      deleted_at = now()
  where company_id = employee.company_id
    and employee_id = employee.id
    and deleted_at is null
    and not (work_schedule_id = any(target_ids));

  insert into public.employee_work_schedule_assignments (
    company_id,
    employee_id,
    work_schedule_id,
    priority,
    is_active,
    deleted_at
  )
  select
    employee.company_id,
    employee.id,
    selected.work_schedule_id,
    selected.priority,
    true,
    null
  from unnest(target_ids) with ordinality as selected(work_schedule_id, priority)
  on conflict (company_id, employee_id, work_schedule_id)
  where deleted_at is null and is_active
  do update set
    priority = excluded.priority,
    is_active = true,
    deleted_at = null,
    updated_at = now();

  update public.employees
  set work_schedule_id = first_schedule_id,
      updated_at = now()
  where id = employee.id;

  return cardinality(target_ids);
end;
$$;

grant execute on function public.set_employee_work_schedule_assignments(uuid, uuid[]) to authenticated;
