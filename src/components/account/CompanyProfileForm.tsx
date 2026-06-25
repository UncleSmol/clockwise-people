"use client";

import { Building2, Globe2, Mail, MapPin, Phone, Save } from "lucide-react";
import type { ReactNode } from "react";
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
  icon,
  label,
  name,
  placeholder,
  required,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue?: string | null;
  icon?: ReactNode;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className="flex items-center gap-2 rounded-md border border-border bg-background px-3">
        {icon ? <span className="text-muted">{icon}</span> : null}
        <input
          autoComplete={autoComplete}
          defaultValue={defaultValue ?? ""}
          name={name}
          placeholder={placeholder}
          required={required}
          type={type}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
        />
      </span>
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
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            state.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          defaultValue={company.name}
          icon={<Building2 className="size-4" />}
          label="Registered name"
          name="name"
          required
        />
        <Field
          defaultValue={company.trading_name}
          icon={<Building2 className="size-4" />}
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
          icon={<Globe2 className="size-4" />}
          label="Website"
          name="website_url"
          placeholder="https://example.co.za"
          type="url"
        />
        <Field
          autoComplete="email"
          defaultValue={company.contact_email}
          icon={<Mail className="size-4" />}
          label="Contact email"
          name="contact_email"
          type="email"
        />
        <Field
          autoComplete="tel"
          defaultValue={company.contact_phone}
          icon={<Phone className="size-4" />}
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
          icon={<MapPin className="size-4" />}
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
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Save className="size-4" />
          {pending ? "Saving..." : "Save company profile"}
        </button>
      </div>
    </form>
  );
}
