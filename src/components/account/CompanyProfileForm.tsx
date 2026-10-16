"use client";

import { useActionState } from "react";
import { updateCompanyProfile } from "@/lib/account/actions";
import type { Company } from "@/lib/foundation/schema";

type CompanyProfileFormProps = {
  company: Company;
};

const initialState = {
  ok: true,
  message: "",
};

function Field({
  autoComplete,
  defaultValue,
  label,
  name,
  placeholder,
  required,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue?: string | null;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <input
        autoComplete={autoComplete}
        defaultValue={defaultValue ?? ""}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
        className="h-10 rounded-lg border border-border/80 bg-surface px-3 text-sm text-foreground outline-none transition focus:border-foreground"
      />
    </label>
  );
}

export default function CompanyProfileForm({ company }: CompanyProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateCompanyProfile,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="company_id" value={company.id} />

      {state.message ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            state.ok
              ? "border-success/20 bg-success/10 text-success"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          defaultValue={company.name}
          label="Registered name"
          name="name"
          required
        />
        <Field
          defaultValue={company.trading_name}
          label="Trading name"
          name="trading_name"
        />
        <Field
          defaultValue={company.registration_number}
          label="Registration number"
          name="registration_number"
        />
        <Field
          defaultValue={company.tax_number}
          label="Tax number"
          name="tax_number"
        />
        <Field
          defaultValue={company.vat_number}
          label="VAT number"
          name="vat_number"
        />
        <Field
          defaultValue={company.industry}
          label="Industry"
          name="industry"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          defaultValue={company.website_url}
          label="Website"
          name="website_url"
          placeholder="https://example.co.za"
          type="url"
        />
        <Field
          autoComplete="email"
          defaultValue={company.contact_email}
          label="Contact email"
          name="contact_email"
          type="email"
        />
        <Field
          autoComplete="tel"
          defaultValue={company.contact_phone}
          label="Contact phone"
          name="contact_phone"
        />
        <Field
          defaultValue={company.payroll_cycle}
          label="Payroll cycle"
          name="payroll_cycle"
          required
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          autoComplete="address-line1"
          defaultValue={company.address_line_1}
          label="Address line 1"
          name="address_line_1"
        />
        <Field
          autoComplete="address-line2"
          defaultValue={company.address_line_2}
          label="Address line 2"
          name="address_line_2"
        />
        <Field
          autoComplete="address-level2"
          defaultValue={company.city}
          label="City"
          name="city"
        />
        <Field
          autoComplete="address-level1"
          defaultValue={company.province}
          label="Province"
          name="province"
        />
        <Field
          autoComplete="postal-code"
          defaultValue={company.postal_code}
          label="Postal code"
          name="postal_code"
        />
        <Field
          autoComplete="country-name"
          defaultValue={company.country}
          label="Country"
          name="country"
          required
        />
        <Field
          defaultValue={company.timezone}
          label="Timezone"
          name="timezone"
          required
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save company profile"}
        </button>
      </div>
    </form>
  );
}
