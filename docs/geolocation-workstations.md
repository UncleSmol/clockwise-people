# Geolocation Workstations

ClockWise People supports workstation geofencing for time events.

## Scope

Company admins configure active workstations from `Company setup > Geolocation`.
Each workstation has:

- Name
- Optional branch
- Optional address
- Latitude and longitude
- Radius in meters

Employees can be assigned to one active workstation. When an employee clocks in,
starts lunch, ends lunch, or clocks out, the browser asks for geolocation and
sends the captured latitude, longitude, accuracy, and timestamp with the clock
event.

## Server Validation

`public.record_employee_time_event` stores geolocation details on
`public.time_clock_events` and calculates:

- Assigned workstation
- Distance from workstation
- Geofence status:
  - `in_range`
  - `out_of_range`
  - `no_location`
  - `no_workstation`
  - `unknown`

Clocking is not blocked when location is unavailable. The event is still saved
and marked as `no_location` so managers can review it.

## Limitations

This is browser geolocation at the time of clocking. It does not track employees
in the background when the browser/app is closed. Continuous background tracking
would require a dedicated mobile/PWA strategy, explicit consent flows, retention
rules, and device-level permission handling.
