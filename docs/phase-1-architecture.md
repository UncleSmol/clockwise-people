# Phase 1 Architecture

Phase 1 covers invite/provisioned auth, company setup, branch setup, department setup, and employee registration.

## Data Boundary

- Client components do not decide tenant scope.
- Companies are provisioned by an administrator through backend/service-role operations.
- Server-side query modules resolve the active company through the authenticated Supabase session and RLS.
- Server actions attach `company_id` during writes after resolving the active company on the backend.
- User-facing code uses the anon key and Supabase cookies. The service role key must not be used by dashboard UI paths.
- Public users cannot create companies through RLS.

## Provisioning Flow

- An administrator creates the Supabase Auth user.
- The backend calls `public.provision_company_owner()` with the service role to create the company, app user row, and owner role assignment atomically.
- The owner signs in with assigned credentials and manages branches, departments, and employees for that company.

## Employee Invitation Flow

- Owners and HR admins create employee records before employee login accounts exist.
- Employee detail pages can create a pending `public.user_invitations` record and send a Supabase Auth invite from a server action.
- The invite redirect points to `/auth/callback?inviteId=...`.
- The callback exchanges the Supabase Auth code, verifies the authenticated email, then calls `public.accept_user_invitation()` with the service role.
- `public.accept_user_invitation()` creates/updates `public.users`, assigns the invited role, links `public.users.employee_id`, links `public.employees.user_id`, and marks the invitation accepted.
- Manual employee/user linking is not part of normal application use.

## Query Pattern

- Pages request one route-level view model from `/lib/**/queries.ts`.
- Query modules use React `cache()` for request-level de-duplication.
- Related Phase 1 data is fetched in parallel where possible.
- Mutations call `revalidatePath()` for the affected dashboard route.

## Client State

- Local storage is only used for presentation preferences, such as table density.
- Business data, tenant identifiers, permissions, and employee records are not stored in local storage.

## Spec-Aligned Libraries

- Next.js App Router and Server Components for route data loading.
- Supabase Auth, PostgreSQL, and RLS for backend security.
- React Hook Form and Zod for form validation.
- TanStack Table for employee register tables.
- Tailwind CSS for the design system.
