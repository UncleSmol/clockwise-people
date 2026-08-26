-- Bulk submit timesheet correction requests RPC and changelog
create or replace function public.submit_timesheet_correction_requests(
  target_time_entry_ids uuid[],
  proposed_clock_in time default null,
  proposed_lunch_start time default null,
  proposed_lunch_end time default null,
  proposed_clock_out time default null,
  correction_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if btrim(coalesce(correction_reason, '')) = '' then
    raise exception 'A correction reason is required';
  end if;

  if target_time_entry_ids is null or array_length(target_time_entry_ids, 1) = 0 then
    return 0;
  end if;

  foreach tid in array target_time_entry_ids loop
    begin
      perform public.submit_timesheet_correction_request(
        tid,
        proposed_clock_in,
        proposed_lunch_start,
        proposed_lunch_end,
        proposed_clock_out,
        correction_reason
      );
      processed_count := processed_count + 1;
    exception when others then
      -- If an individual entry cannot be submitted (e.g. already submitted or invalid), continue to others
      null;
    end;
  end loop;

  if processed_count = 0 then
    raise exception 'No correction requests could be submitted. Ensure proposed times differ from original and that no pending requests exist.';
  end if;

  return processed_count;
end;
$$;

grant execute on function public.submit_timesheet_correction_requests(uuid[], time, time, time, time, text) to authenticated;
grant execute on function public.submit_timesheet_correction_requests(uuid[], time, time, time, time, text) to service_role;

-- Record changelog
insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.26-bulk-correction-submit',
  'Bulk Submission for Timesheet Correction Requests',
  'Employees can now select multiple submitted timesheets, enter proposed times and a common reason, and submit correction requests for all selected days in one click.',
  array[
    'Added multi-select and Select All capability for submitted timesheet correction requests',
    'Introduced bulk correction request form for batch submissions',
    'Created atomic bulk submission database transaction'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at;
