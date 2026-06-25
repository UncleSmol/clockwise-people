create or replace function public.normalized_schedule_paid_hours(
  schedule_start time,
  schedule_end time,
  schedule_lunch_minutes integer,
  configured_paid_hours numeric,
  fallback_paid_hours numeric
)
returns numeric
language plpgsql
stable
as $$
declare
  gross_hours numeric(8,2);
  lunch_hours numeric(8,2);
  derived_paid_hours numeric(8,2);
  configured numeric(8,2);
begin
  configured := nullif(configured_paid_hours, 0);
  lunch_hours := greatest(coalesce(schedule_lunch_minutes, 0), 0)::numeric / 60;

  if schedule_start is not null and schedule_end is not null then
    gross_hours := greatest(
      extract(epoch from (
        case
          when schedule_end >= schedule_start then
            ('2000-01-01 ' || schedule_end)::timestamp - ('2000-01-01 ' || schedule_start)::timestamp
          else
            ('2000-01-02 ' || schedule_end)::timestamp - ('2000-01-01 ' || schedule_start)::timestamp
        end
      )) / 3600,
      0
    )::numeric(8,2);
    derived_paid_hours := greatest(gross_hours - lunch_hours, 0)::numeric(8,2);

    if configured is null then
      return coalesce(nullif(derived_paid_hours, 0), fallback_paid_hours, 8)::numeric(8,2);
    end if;

    if lunch_hours > 0
      and gross_hours > 0
      and abs(configured - gross_hours) < 0.02
      and derived_paid_hours > 0 then
      return derived_paid_hours::numeric(8,2);
    end if;
  end if;

  return coalesce(configured, nullif(derived_paid_hours, 0), fallback_paid_hours, 8)::numeric(8,2);
end;
$$;

update public.app_updates
set summary = 'Employees can inspect calendar timesheets, and managers can create employee timesheets and load approved time off.',
    changes = array[
      'Employees can open calendar timesheets for details.',
      'Managers can create employee timesheets and load approved time off.'
    ],
    updated_at = now()
where version = '2026.06.25-manager-calendar-actions';

update public.app_updates
set changes = array[
      'Public holidays now pay normal time instead of the full shift span.',
      'Overtime now fills earlier normal-time shortfalls before accumulating.'
    ],
    updated_at = now()
where version = '2026.06.26-nt-fill-up-holiday-hours';
