alter table public.employees alter column branch_id drop not null;

alter table public.departments
  add column workstation_id uuid references public.company_workstations(id) on delete set null;

alter table public.employees
  add column workstation_id uuid references public.company_workstations(id) on delete set null;

update public.departments d
  set workstation_id = cw.id
  from public.company_workstations cw
  where cw.branch_id = d.branch_id;

update public.employees e
  set workstation_id = cw.id
  from public.company_workstations cw
  where cw.branch_id = e.branch_id;

alter table public.departments drop column branch_id;

alter table public.employees drop column branch_id;

alter table public.employees alter column workstation_id set not null;

drop table public.branches cascade;
