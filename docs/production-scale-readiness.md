# Production Scale Readiness

ClockWise People is designed to run as a stateless Next.js application on Vercel with Supabase providing Auth, Postgres, and Realtime. Local development continues to use the Supabase Docker stack and the same migrations that are pushed to production Supabase.

## Current Target

Phase 1 prepares the app for companies with hundreds of active users and employees by removing known single-instance assumptions before adding shared caching.

## Phase 1 Status

Completed in `2026.06.25-scale-phase-1`:

- Employee numbers are allocated by Supabase through `public.next_company_employee_number(company_id)`.
- The old count-then-insert employee number flow has been removed from the app layer.
- `/health` returns a lightweight JSON response for production uptime checks and load balancers.
- A production changelog entry is seeded through the Supabase migration.

## Deployment Assumptions

- Production app hosting is Vercel.
- Production data services are Supabase Auth, Supabase Postgres, and Supabase Realtime.
- Local development uses Supabase Docker through the local `supabase/` project.
- Database changes must be added as migrations so local and production schemas stay aligned.
- Environment variables are managed in Vercel for production, not copied manually between app instances.

Required production environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_ATTACHMENTS_BUCKET`

## Load Balancer Readiness

The app does not require sticky sessions. Supabase Auth stores the browser session in cookies, and any Vercel server/runtime instance can serve a request as long as it has the same environment variables.

The health endpoint is:

```txt
GET /health
```

Expected response:

```json
{
  "ok": true,
  "service": "clockwise-people"
}
```

## Redis Position

Redis is intentionally not part of Phase 1. The next scaling step is to verify Supabase query performance under load and then add Redis only for stable, tenant-scoped read data or rate limiting.

Good future Redis candidates:

- company setup data
- work rules and public holidays
- employee options/directories with short TTLs
- rate limits for sensitive server actions

Avoid Redis for:

- clock-in/clock-out correctness
- live workforce state
- approval queues where stale data is risky
- Supabase sessions
