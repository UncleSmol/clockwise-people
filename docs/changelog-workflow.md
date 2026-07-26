# Changelog Workflow

Every code change that should be visible to users must include a changelog entry. This document defines the process.

## Commit Message Format

Every commit message must follow this structure:

```
<short title>

<optional body>

CHANGELOG
version: YYYY.MM.DD-<slug>
title: <User-facing title>
summary: <One-line summary>
changes:
- <Bullet point>
- <Bullet point>
```

Example:

```
Add icons to all form input fields

Every input, select, and textarea across the app now uses the consistent
icon-wrapper pattern with rounded-lg containers.

CHANGELOG
version: 2026.07.26-form-field-icons
title: Form fields now have consistent icons
summary: Every input field across the app uses a consistent icon-and-label design.
changes:
- All form inputs use the icon-wrapper pattern with rounded-lg borders
- Textareas have FileText icons with proper alignment
- Select fields have contextual icons (User, Shield, List, etc.)
- Every button uses rounded-lg instead of rounded-md
```

### Rules

- **version** must be a unique slug: `YYYY.MM.DD-<kebab-case-description>`
- **title** is the bold heading shown in the changelog modal (max ~60 chars)
- **summary** is a one-line plain-text description shown below the title
- **changes** are the bullet points shown in the modal list (each prefixed with `- `)
- If there is no user-facing change (refactor, config, docs), omit the CHANGELOG section

## Pre-commit Checklist

Before committing, always run these checks:

```powershell
npm run build
npm run lint
```

Both must pass with zero errors. If either fails, fix the issues before proceeding.

## Creating a Changelog Migration

After code changes are done and build/lint pass, create a Supabase migration to seed the changelog entry.

### Step 1: Determine the migration filename

Use the next timestamp after the latest migration:

```powershell
Get-ChildItem -LiteralPath supabase\migrations | Sort-Object Name | Select-Object -Last 1
```

The filename format is: `YYYYMMDDHHMMSS_<slug>.sql`

### Step 2: Create the migration file

Create a file at `supabase/migrations/<timestamp>_<slug>.sql` with:

```sql
insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '<version>',
  '<title>',
  '<summary>',
  array[
    '<bullet 1>',
    '<bullet 2>',
    '<bullet 3>'
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
```

Replace the placeholders with the values from your commit's CHANGELOG section.

### Step 3: Generate a UUID for the update ID

The `id` column uses `gen_random_uuid()` so no manual UUID is needed.

## Full Workflow

```
1. Write code
2. npm run build      # must pass
3. npm run lint       # must pass
4. Create migration:  supabase/migrations/<timestamp>_<slug>.sql
5. git add -A
6. git commit -m "..."   # include CHANGELOG section
7. git push              # push to GitHub

# Deploy migration to Supabase
8. npx supabase db push  # or however you deploy Supabase migrations
```

## Quick Script

Save this as `scripts\commit.ps1` for a one-command workflow:

```powershell
param(
  [Parameter(Mandatory)][string]$Message
)

Write-Host "Running build..." -ForegroundColor Cyan
npm run build; if (-not $?) { exit 1 }

Write-Host "Running lint..." -ForegroundColor Cyan
npm run lint; if (-not $?) { exit 1 }

Write-Host "All checks passed. Committing..." -ForegroundColor Green
git add -A
git commit -m $Message
git push
```

Then call it:

```powershell
.\scripts\commit.ps1 -Message @"
Add icons to all form input fields

CHANGELOG
version: 2026.07.26-form-field-icons
title: Form fields now have consistent icons
summary: Every input field across the app uses a consistent icon-and-label design.
changes:
- All form inputs use the icon-wrapper pattern
- Textareas have FileText icons
"@
```
