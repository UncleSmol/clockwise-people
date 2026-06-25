create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  target_type text,
  target_id uuid,
  target_href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint app_notifications_recipient_required check (user_id is not null or employee_id is not null),
  constraint app_notifications_title_not_blank check (btrim(title) <> ''),
  constraint app_notifications_body_not_blank check (btrim(body) <> '')
);

create index if not exists idx_app_notifications_user_unread
on public.app_notifications(company_id, user_id, read_at, created_at desc);

create index if not exists idx_app_notifications_employee_unread
on public.app_notifications(company_id, employee_id, read_at, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists "recipients can view app notifications" on public.app_notifications;
create policy "recipients can view app notifications"
on public.app_notifications for select
using (
  company_id in (select public.current_user_company_ids())
  and (
    user_id = public.current_app_user_id(company_id)
    or employee_id = public.current_employee_id(company_id)
  )
);

drop policy if exists "system scoped app notifications insert" on public.app_notifications;
create policy "system scoped app notifications insert"
on public.app_notifications for insert
with check (
  company_id in (select public.current_user_company_ids())
  and (
    user_id = public.current_app_user_id(company_id)
    or employee_id = public.current_employee_id(company_id)
    or public.has_company_role(company_id, 'owner')
    or public.has_company_role(company_id, 'hr_admin')
    or public.has_company_role(company_id, 'branch_manager')
  )
);

create or replace function public.mark_app_notification_read(target_notification_id uuid)
returns public.app_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  notification public.app_notifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where id = target_notification_id
    and company_id in (select public.current_user_company_ids())
    and (
      user_id = public.current_app_user_id(company_id)
      or employee_id = public.current_employee_id(company_id)
    )
  returning * into notification;

  if not found then
    raise exception 'Notification could not be found';
  end if;

  return notification;
end;
$$;

create or replace function public.notify_employee_time_entry_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_user_id uuid;
  notification_title text;
  notification_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status = old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select user_id
    into recipient_user_id
  from public.employees
  where id = new.employee_id;

  notification_title := case
    when new.status = 'approved' then 'Timesheet approved'
    else 'Timesheet rejected'
  end;

  notification_body := case
    when new.status = 'approved' then 'Your timesheet for ' || new.work_date::text || ' was approved.'
    else 'Your timesheet for ' || new.work_date::text || ' was rejected. Open it to review the response.'
  end;

  insert into public.app_notifications (
    company_id,
    user_id,
    employee_id,
    category,
    title,
    body,
    target_type,
    target_id,
    target_href,
    metadata
  )
  values (
    new.company_id,
    recipient_user_id,
    new.employee_id,
    'timesheet_' || new.status::text,
    notification_title,
    notification_body,
    'time_entry',
    new.id,
    '/dashboard/time?time_entry_id=' || new.id::text,
    jsonb_build_object('work_date', new.work_date, 'status', new.status)
  );

  return new;
end;
$$;

drop trigger if exists time_entries_notify_employee_decision on public.time_entries;
create trigger time_entries_notify_employee_decision
after update of status on public.time_entries
for each row
execute function public.notify_employee_time_entry_decision();

create or replace function public.notify_employee_leave_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_user_id uuid;
  leave_type_name text;
  notification_title text;
  notification_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status = old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select user_id
    into recipient_user_id
  from public.employees
  where id = new.employee_id;

  select name
    into leave_type_name
  from public.leave_types
  where id = new.leave_type_id;

  notification_title := case
    when new.status = 'approved' then 'Time off approved'
    else 'Time off rejected'
  end;

  notification_body := coalesce(leave_type_name, 'Time off') || ' from ' ||
    new.start_date::text || ' to ' || new.end_date::text || ' was ' || new.status::text || '.';

  insert into public.app_notifications (
    company_id,
    user_id,
    employee_id,
    category,
    title,
    body,
    target_type,
    target_id,
    target_href,
    metadata
  )
  values (
    new.company_id,
    recipient_user_id,
    new.employee_id,
    'leave_' || new.status::text,
    notification_title,
    notification_body,
    'leave_request',
    new.id,
    '/dashboard/leave?leave_request_id=' || new.id::text,
    jsonb_build_object('start_date', new.start_date, 'end_date', new.end_date, 'status', new.status)
  );

  return new;
end;
$$;

drop trigger if exists leave_requests_notify_employee_decision on public.leave_requests;
create trigger leave_requests_notify_employee_decision
after update of status on public.leave_requests
for each row
execute function public.notify_employee_leave_request_decision();

grant execute on function public.mark_app_notification_read(uuid) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.26-dashboard-notifications',
  'Dashboard notifications and reminders',
  'The dashboard now surfaces holidays, team movements, smart reminders, install prompts, and actionable notifications.',
  array[
    'Employees get a dashboard view for upcoming holidays, team movement, and daily reminders.',
    'Timesheet and time off decisions create notification records linked back to the relevant app screen.',
    'The app registers a service worker and shows browser notification reminders while the app session is active.',
    'New devices receive a persistent install prompt until they install or dismiss it.'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at,
    is_published = true,
    updated_at = now();
