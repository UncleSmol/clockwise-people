-- Hide auto-loaded public holiday timesheets and prevent auto-creation
-- Public holidays are displayed as calendar day events without user timesheets.

-- 1. Replace sync_company_public_holiday_time_entries with a no-op function
create or replace function public.sync_company_public_holiday_time_entries(
  target_company_id uuid,
  target_year integer default extract(year from current_date)::integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No-op: Public holidays are displayed on the calendar as holiday events
  -- and do not generate pre-loaded user timesheets.
  return 0;
end;
$$;

grant execute on function public.sync_company_public_holiday_time_entries(uuid, integer) to authenticated;
grant execute on function public.sync_company_public_holiday_time_entries(uuid, integer) to service_role;

-- 2. Clean up previously auto-generated public holiday time entries
delete from public.time_entries
where notes like 'Public holiday:%';

-- 3. Delete empty draft timesheets left behind after cleaning up holiday time entries
delete from public.timesheets
where status = 'draft'
  and not exists (
    select 1
    from public.time_entries te
    where te.timesheet_id = timesheets.id
      and te.deleted_at is null
  );

-- 4. Record changelog
insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.26-hide-holiday-timesheets',
  'Calendar Public Holiday Display Update',
  'Public holidays now display exclusively as holiday events on the calendar without automatically creating timesheets or appearing in the submission queue.',
  array[
    'Public holidays show solely as holiday day events on both employee and manager calendars',
    'Excluded auto-generated holiday timesheets from the Submit Ready Timesheets queue',
    'Cleaned up pre-loaded holiday timesheets across all workspaces'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at;
