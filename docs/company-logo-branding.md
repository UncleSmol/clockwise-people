# Company Logo Branding

Company admins can set a company logo from **Company setup**.

For now, logos are link-only:

- The URL is stored on `public.companies.logo_url`.
- Empty values are saved as `null`.
- The database only accepts `http://` or `https://` links.
- Uploads are intentionally not supported yet.

Admins update the logo through `public.update_company_logo(company_id, logo_url)`.
The function checks that the signed-in user is active in the company and has
`owner` or `hr_admin` access before updating the company record.

The logo is used in the dashboard header and mobile navigation drawer. If the
link is blank or the image fails to load, the app falls back to the default
ClockWise People logo.
