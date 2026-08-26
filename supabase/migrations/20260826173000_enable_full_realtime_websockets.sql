-- Enable full Realtime WebSockets publication and replica identity for live sync
do $$
declare
  tbl text;
  tables text[] := array[
    'time_entries',
    'time_clock_events',
    'timesheets',
    'timesheet_correction_requests',
    'approval_requests',
    'app_notifications',
    'leave_requests',
    'leave_balances',
    'company_workstations',
    'employees'
  ];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I replica identity full', tbl);
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end;
$$;

-- Record changelog
insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.26-realtime-websockets',
  'Live Realtime WebSockets Sync',
  'The entire application is now fully live over Supabase Realtime WebSockets. When a user clocks in/out, submits or approves timesheets, requests corrections, or receives notifications, the UI updates instantly across all devices with zero page reloads.',
  array[
    'Enabled full Supabase Realtime WebSockets across time entries, clock events, timesheets, correction requests, approvals, and notifications',
    'Added global RealtimeSyncProvider with smart debounced live state synchronization',
    'Upgraded Employee Time Clock, Live Workforce, and Notification center for instant reactive updates',
    'Added Live WebSocket connection indicator to the navigation header'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at;
