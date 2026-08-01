-- Fix legacy migrated timesheets that stored real clock_in/clock_out values
-- but hardcoded gross_hours = 0, lunch_hours = 0, paid_hours = 0, etc. because
-- the importer never called refresh_time_entry_calculations.
--
-- 1. Recompute every calculation column for entries with clock data and 0 hours.
-- 2. Backfill workstation_id from the employee's active assignment where null.
-- 3. Reconcile the migrated parent timesheets (notes = 'Migrated from legacy
--    time tracker') from 'draft' to 'submitted' so approved entries sit under
--    a consistent, non-draft parent timesheet.

do $$
declare
  v_entry_id uuid;
  v_company_id uuid;
  v_employee_id uuid;
begin
  -- Step 1 + 2: recompute hours and backfill workstation for legacy rows.
  for v_entry_id, v_company_id, v_employee_id in
    select te.id, te.company_id, te.employee_id
    from public.time_entries te
    where te.clock_in is not null
      and te.clock_out is not null
      and te.gross_hours = 0
      and te.paid_hours = 0
      and te.deleted_at is null
  loop
    -- Backfill the assigned workstation where the entry has none.
    if exists (
      select 1
      from public.time_entries
      where id = v_entry_id
        and workstation_id is null
    ) then
      update public.time_entries
      set workstation_id = (
        select a.workstation_id
        from public.employee_workstation_assignments a
        join public.company_workstations ws
          on ws.id = a.workstation_id
         and ws.company_id = a.company_id
         and ws.is_active
         and ws.deleted_at is null
        where a.company_id = v_company_id
          and a.employee_id = v_employee_id
          and a.is_active
          and a.deleted_at is null
        order by a.created_at desc
        limit 1
      )
      where id = v_entry_id;
    end if;

    perform public.refresh_time_entry_calculations(v_entry_id);
  end loop;

  -- Step 3: reconcile migrated parent timesheets.
  update public.timesheets
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      updated_at = now()
  where status = 'draft'
    and deleted_at is null
    and notes = 'Migrated from legacy time tracker'
    and exists (
      select 1
      from public.time_entries te
      where te.timesheet_id = public.timesheets.id
        and te.status = 'approved'
        and te.deleted_at is null
    );
end;
$$;
