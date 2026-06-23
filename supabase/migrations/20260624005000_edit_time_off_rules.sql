create or replace function public.update_company_leave_type(
  target_leave_type_id uuid,
  leave_name text,
  leave_category public.leave_category,
  paid_leave boolean,
  needs_attachment boolean,
  yearly_hours numeric default null,
  active_rule boolean default true
)
returns public.leave_types
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  existing public.leave_types%rowtype;
  updated public.leave_types%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select *
    into existing
  from public.leave_types
  where id = target_leave_type_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Time off rule could not be found';
  end if;

  select *
    into actor
  from public.users
  where auth_user_id = auth.uid()
    and company_id = existing.company_id
    and status = 'active'
    and deleted_at is null
  limit 1;

  if not found or not public.has_any_company_role(existing.company_id, array['owner', 'hr_admin']::public.app_role[]) then
    raise exception 'Only company admins can edit time off rules';
  end if;

  if btrim(coalesce(leave_name, '')) = '' then
    raise exception 'Time off rule name is required';
  end if;

  update public.leave_types
  set name = btrim(leave_name),
      category = leave_category,
      is_paid = paid_leave,
      requires_attachment = needs_attachment,
      is_active = active_rule,
      accrual_rules = coalesce(accrual_rules, '{}'::jsonb)
        || jsonb_build_object('yearly_hours', coalesce(yearly_hours, 0)),
      updated_at = now()
  where id = existing.id
  returning * into updated;

  insert into public.audit_logs (
    company_id,
    user_id,
    action,
    affected_table,
    record_id,
    old_value,
    new_value,
    reason
  )
  values (
    updated.company_id,
    actor.id,
    'update',
    'leave_types',
    updated.id,
    to_jsonb(existing),
    to_jsonb(updated),
    'Time off rule edited'
  );

  return updated;
end;
$$;

grant execute on function public.update_company_leave_type(uuid, text, public.leave_category, boolean, boolean, numeric, boolean) to authenticated;

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.06.24-edit-time-off-rules',
  'Time off rules can be edited',
  'Company admins can now update existing time off rules without creating duplicates.',
  array[
    'Admins can edit time off rule names, categories, paid status, attachment requirements, and yearly hours.',
    'Rule changes are audited in the database.',
    'Existing employee balances remain linked to the edited rule.'
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
