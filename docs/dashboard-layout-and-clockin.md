# Dashboard Layout and Clocking

This document covers the dashboard composition, the clocking overhaul (workstation picker,
workstation switching, no-lunch days), range submission with the flag gate, and the leave/TOIL
entry points.

## Dashboard Composition

`src/app/dashboard/page.tsx` is a Server Component that resolves the full view model in parallel
(`getEmployeeTimeState`, live overview, calendar entries, correction queue, submitted queue, leave
state, etc.) and passes slices into `CalendarWorkspace`.

`CalendarWorkspace` (`src/components/dashboard/CalendarWorkspace.tsx`) is the shell:

- Header card with company name, live clock, and a **My time / Team** toggle for managers.
- **Services** menu opens the slide-in panels (leave, approvals, people, company setup, account,
  policies).
- Desktop body stacks the clocking engine on top and the employee calendar below.
- Managers in Team mode render the manager calendar instead.
- On mobile, a three-tab bar (**Clock / Calendar / Records**) switches what is visible; the
  clocking engine is the default and centre of focus.

### Workspace section context

`src/components/dashboard/workspace-context.ts` provides two contexts:

- `WorkspaceSection` — `"full" | "calendar" | "records"`. On mobile this derives from the active
  tab; on desktop it is always `"full"`. `EmployeeTimesheetCorrections` reads it to decide which
  pieces to render:
  - `"records"` → only the submitted-records / correction-request tab content.
  - `"calendar"` → the calendar plus the quick-submit engine and the "Request leave / TOIL" button,
    hiding the tab bar.
  - `"full"` → calendar + tab bar + all tab content.
- `PanelContext` — `openPanel(key)` opens the matching slide-in panel by key (e.g. `"leave"`).

## Clocking Engine

`EmployeeTimeClock` (`src/components/time-tracking/EmployeeTimeClock.tsx`) renders as a **strip**
(top of dashboard) or **card** variant.

### Workstation picker

`getEmployeeTimeState` (`src/lib/time-tracking/queries.ts`) now returns:

- `workstations` — active, non-deleted workstations for the company.
- `assignedWorkstationId` — the employee's active assignment effective today.
- `todaySchedule` — the work schedule day for today (`start_time`, `end_time`, `lunch_minutes`,
  `is_working_day`).

The component selects a workstation for every clock event. The picker defaults to the assigned
workstation and sends `workstation_id` through `recordClockEvent`. When there is no assignment and
no active workstation, events fall back to `no_workstation` geofence status.

### Switch workstation

While clocked in and not clocked out, the employee can switch workstations mid-shift. The client
sets `switchPendingRef`, the `useActionState` wrapper routes to `switchWorkstation` (which calls
`recordClockEvent("switch_workstation", formData)`), and the server:

1. Re-resolves the picked workstation.
2. Recomputes the geofence against the picked workstation.
3. Updates `time_entries.workstation_id` and enriched `device_metadata`.
4. Logs a `time_clock_events` row with `event_type = 'switch_workstation'`.
5. Calls `refresh_time_entry_calculations`.

### No-lunch days

`todaySchedule.lunch_minutes <= 0` means the day has no lunch break. `nextAction` skips the lunch
start/end steps so the sequence is clock in → clock out.

### Geofence handling

`record_employee_time_event` resolves the workstation (picked first, active assignment as
fallback) and computes `distance_between_coordinates_meters`. Status is `in_range`,
`out_of_range`, `no_location`, or `no_workstation`. Out-of-range events are **not blocked** — they
are allowed and flagged, and surfaced in the UI as a warning banner and as a `Check` flag on the
submission list.

### Server action

The RPC signature changed to:

```sql
record_employee_time_event(
  requested_event public.clock_event_type,
  device_metadata jsonb default '{}'::jsonb,
  workstation_id uuid default null
)
```

The old two-argument signature was dropped. The `clock_event_type` enum gained `switch_workstation`.
See `supabase/migrations/20260801010000_clock_workstation_picker_and_switch.sql`.

## Timesheet Submission with Flag Gate

`EmployeeTimesheetCorrections` replaced the checkbox list with a **contiguous range selector**:
tap a start day, then tap an end day; the range in between is selected. Hidden inputs carry
`time_entry_ids` and (when acknowledged) `acknowledged_ids`.

`submit_own_timesheets` now has the signature:

```sql
submit_own_timesheets(
  target_time_entry_ids uuid[],
  acknowledged_ids uuid[] default '{}'::uuid[]
)
```

The server rejects the submission with
`'Flag the timesheets that need attention before submitting'` if any selected entry has
`missing_clocking`, `late_arrival`, `early_departure`, or `clock_in` set with `paid_hours <= 0` and
its id is not in `acknowledged_ids`. The client mirrors this with `entryNeedsAttention` and the
"I understand the flagged days need attention" acknowledgement checkbox, so the gate cannot be
bypassed through the UI. See
`supabase/migrations/20260801020000_submit_own_timesheets_flag_gate.sql`.

## Leave and TOIL

- The calendar section shows a **Request leave / TOIL** button that calls `openPanel("leave")`,
  opening the existing leave panel (`EmployeeLeaveRequests`).
- The leave panel gains **Convert overtime to TOIL**. `convertOvertimeToToil`
  (`src/lib/work-rules/actions.ts`) finds the employee's current **open** payroll period covering
  today, then calls `accrueToilBalance(employeeId, periodStart, periodEnd)`, which:
  - sums overtime hours in the period,
  - applies `company_settings.toil_rules.accrual_multiplier` (default 1.5),
  - writes the earned hours as a TOIL leave balance via `assign_employee_leave_balance`
    (requires a leave type with category `toil_taken`).

## Manager Views: Workstation Names

All four manager queries now embed `employees(...)` with `company_workstations(name)` and map it to
`workstationName` on the returned rows:

- `getCompanyLiveTimeOverview` (also adds `workstation_id`)
- `getCompanyTimesheetCorrectionQueue`
- `getCompanySubmittedTimesheetQueue`
- `getCompanyTimesheetCalendarEntries`

Components (`CompanyTimesheetCalendar`, `CompanyTimesheetApprovalQueue`,
`CompanyTimesheetCorrectionQueue`, `CompanyLiveWorkforce`) already render the name with a
`workstationName ?? "No workstation"` fallback, so the day tooltip/modal/list shows the workstation
without cluttering the calendar cells.

## Legacy Data Fix

`supabase/migrations/20260801000000_fix_legacy_timesheet_calculations.sql` repairs entries imported
by the legacy tracker that stored real `clock_in`/`clock_out` values but hardcoded zero hours:

1. Recomputes every calculation column via `refresh_time_entry_calculations` for entries with clock
   data and `gross_hours = 0` and `paid_hours = 0`.
2. Backfills `workstation_id` from the employee's active assignment where null.
3. Reconciles migrated parent timesheets (`notes = 'Migrated from legacy time tracker'`) from
   `draft` to `submitted`, keeping entries at `approved`.
