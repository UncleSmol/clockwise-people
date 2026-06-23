create table public.app_updates (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  summary text not null,
  changes text[] not null default '{}'::text[],
  published_at timestamptz not null default now(),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_updates_version_not_blank check (btrim(version) <> ''),
  constraint app_updates_title_not_blank check (btrim(title) <> ''),
  constraint app_updates_summary_not_blank check (btrim(summary) <> '')
);

create table public.app_update_reads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  update_id uuid not null references public.app_updates(id) on delete cascade,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint app_update_reads_unique unique (company_id, user_id, update_id)
);

alter table public.app_updates enable row level security;
alter table public.app_update_reads enable row level security;

create trigger app_updates_set_updated_at
before update on public.app_updates
for each row execute function public.set_updated_at();

create policy "company members can view published app updates"
on public.app_updates for select
to authenticated
using (is_published);

create policy "company members can view own app update reads"
on public.app_update_reads for select
to authenticated
using (user_id = public.current_app_user_id(company_id));

create policy "company members can create own app update reads"
on public.app_update_reads for insert
to authenticated
with check (user_id = public.current_app_user_id(company_id));

create or replace function public.get_unseen_app_updates(target_company_id uuid)
returns table (
  id uuid,
  version text,
  title text,
  summary text,
  changes text[],
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_id uuid;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  return query
    select
      au.id,
      au.version,
      au.title,
      au.summary,
      au.changes,
      au.published_at
    from public.app_updates au
    where au.is_published
      and not exists (
        select 1
        from public.app_update_reads aur
        where aur.company_id = target_company_id
          and aur.user_id = actor_id
          and aur.update_id = au.id
      )
    order by au.published_at desc, au.created_at desc;
end;
$$;

create or replace function public.mark_app_updates_seen(
  target_company_id uuid,
  target_update_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  read_count integer := 0;
begin
  actor_id := public.current_app_user_id(target_company_id);

  if actor_id is null then
    raise exception 'No active user account is linked to this company';
  end if;

  if coalesce(array_length(target_update_ids, 1), 0) = 0 then
    return 0;
  end if;

  insert into public.app_update_reads (
    company_id,
    user_id,
    update_id
  )
  select
    target_company_id,
    actor_id,
    update_id
  from unnest(target_update_ids) as update_id
  join public.app_updates au
    on au.id = update_id
    and au.is_published
  on conflict (company_id, user_id, update_id) do nothing;

  get diagnostics read_count = row_count;
  return read_count;
end;
$$;

grant execute on function public.get_unseen_app_updates(uuid) to authenticated;
grant execute on function public.mark_app_updates_seen(uuid, uuid[]) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.23-timesheets',
  'Timesheets are easier to review',
  'Employees can fix timesheets, managers can review requests, and the mobile menu is cleaner.',
  array[
    'Employees can edit draft or rejected timesheets and resubmit them.',
    'Managers can approve or reject submitted timesheets with notes.',
    'Timesheet correction requests now move into the manager approval flow.',
    'The mobile menu is now solid, compact, and opens from the top.'
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
