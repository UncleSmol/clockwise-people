create type public.user_invitation_status as enum (
  'pending',
  'accepted',
  'cancelled',
  'expired'
);

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  email text not null,
  role_key public.app_role not null default 'employee',
  status public.user_invitation_status not null default 'pending',
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_by uuid references public.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_invitations_email_not_blank check (btrim(email) <> ''),
  constraint user_invitations_pending_unique unique (company_id, employee_id, status)
);

create index idx_user_invitations_company_status
on public.user_invitations(company_id, status);

create index idx_user_invitations_email_status
on public.user_invitations(lower(email), status);

create trigger user_invitations_set_updated_at
before update on public.user_invitations
for each row execute function public.set_updated_at();

alter table public.user_invitations enable row level security;

create policy "owners and hr admins can view invitations"
on public.user_invitations for select
to authenticated
using (
  public.has_company_role(company_id, 'owner')
  or public.has_company_role(company_id, 'hr_admin')
);

create policy "owners and hr admins can create invitations"
on public.user_invitations for insert
to authenticated
with check (
  public.has_company_role(company_id, 'owner')
  or public.has_company_role(company_id, 'hr_admin')
);

create policy "owners and hr admins can update invitations"
on public.user_invitations for update
to authenticated
using (
  public.has_company_role(company_id, 'owner')
  or public.has_company_role(company_id, 'hr_admin')
)
with check (
  public.has_company_role(company_id, 'owner')
  or public.has_company_role(company_id, 'hr_admin')
);

create or replace function public.accept_user_invitation(
  invitation_id uuid,
  accepted_auth_user_id uuid,
  accepted_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.user_invitations%rowtype;
  app_user_id uuid;
  target_role_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service role can accept invitations';
  end if;

  select *
    into invitation
  from public.user_invitations
  where id = invitation_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending invitation not found';
  end if;

  if invitation.expires_at < now() then
    update public.user_invitations
    set status = 'expired'
    where id = invitation.id;

    raise exception 'Invitation has expired';
  end if;

  if lower(btrim(invitation.email)) <> lower(btrim(accepted_email)) then
    raise exception 'Invitation email does not match authenticated user';
  end if;

  insert into public.users (
    company_id,
    auth_user_id,
    full_name,
    email,
    employee_id
  )
  select
    invitation.company_id,
    accepted_auth_user_id,
    e.full_name,
    invitation.email,
    invitation.employee_id
  from public.employees e
  where e.id = invitation.employee_id
    and e.company_id = invitation.company_id
  on conflict (company_id, auth_user_id)
  do update set
    full_name = excluded.full_name,
    email = excluded.email,
    employee_id = excluded.employee_id,
    updated_at = now()
  returning id into app_user_id;

  select id
    into target_role_id
  from public.roles
  where company_id = invitation.company_id
    and key = invitation.role_key;

  if target_role_id is null then
    raise exception 'Invitation role does not exist for company';
  end if;

  insert into public.user_roles (
    company_id,
    user_id,
    role_id,
    assigned_by
  )
  values (
    invitation.company_id,
    app_user_id,
    target_role_id,
    invitation.invited_by
  )
  on conflict do nothing;

  update public.employees
  set user_id = app_user_id,
      updated_at = now()
  where id = invitation.employee_id
    and company_id = invitation.company_id;

  update public.users
  set employee_id = invitation.employee_id,
      updated_at = now()
  where id = app_user_id
    and company_id = invitation.company_id;

  update public.user_invitations
  set status = 'accepted',
      auth_user_id = accepted_auth_user_id,
      accepted_at = now()
  where id = invitation.id;

  return app_user_id;
end;
$$;

revoke all on function public.accept_user_invitation(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.accept_user_invitation(uuid, uuid, text)
to service_role;
