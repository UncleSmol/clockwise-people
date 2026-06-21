alter table public.user_invitations
drop constraint if exists user_invitations_pending_unique;

create unique index if not exists idx_user_invitations_one_pending_per_employee
on public.user_invitations(company_id, employee_id)
where status = 'pending';
