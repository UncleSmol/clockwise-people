-- Bulk review timesheet correction requests RPC and changelog
create or replace function public.review_timesheet_correction_requests(
  target_correction_ids uuid[],
  approve_request boolean,
  manager_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if target_correction_ids is null or array_length(target_correction_ids, 1) = 0 then
    return 0;
  end if;

  foreach cid in array target_correction_ids loop
    perform public.review_timesheet_correction_request(cid, approve_request, manager_notes);
    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

grant execute on function public.review_timesheet_correction_requests(uuid[], boolean, text) to authenticated;
grant execute on function public.review_timesheet_correction_requests(uuid[], boolean, text) to service_role;

-- Record changelog
insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.26-bulk-correction-review',
  'Bulk Review for Timesheet Correction Requests',
  'Managers and admins can now tick multiple timesheet correction requests, add an optional review note, and approve or reject all selected requests in a single click.',
  array[
    'Added multi-select checkboxes and Select All / Deselect All to timesheet correction requests queue',
    'Shared review note and bulk approve/reject actions for fast processing',
    'Created atomic bulk review database transaction'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at;
