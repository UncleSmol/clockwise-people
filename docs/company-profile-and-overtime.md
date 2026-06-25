# Company Profile and Overtime

Company admins can maintain company profile details from **Account**.

## Company Profile Fields

The company profile stores:

- registered name
- trading name
- registration number
- tax number
- VAT number
- industry
- website
- contact email
- contact phone
- address details
- country, timezone, and payroll cycle

Updates are written through `public.update_company_profile(...)`. The function only allows active owners and HR admins to update the current company, and every update is written to `audit_logs`.

## Overtime Calculation Guard

Time-entry calculations still use the assigned work rule when it has a valid paid-hours value for the work day.

If a schedule day has an invalid low paid-hours value, the calculation falls back to the company standard daily hours from `company_settings.standard_daily_hours`. This prevents normal full-day shifts from being treated as mostly overtime because a work rule day was accidentally saved with a value such as `1.00` paid hour.

The migration recalculates suspicious existing time entries where overtime is greater than half of paid time.
