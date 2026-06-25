update public.app_updates
set changes = array[
      'Employee numbers are now allocated through Supabase using an atomic per-company counter.',
      'Concurrent employee creation is safer when the app runs across multiple Vercel or server instances.',
      'A health endpoint was added for production load balancers and uptime checks.',
      'Database review workflows now cast approval and audit values correctly for production Supabase linting.',
      'Production scale-up documentation now explains the Phase 1 deployment expectations.'
    ],
    updated_at = now()
where version = '2026.06.25-scale-phase-1';
