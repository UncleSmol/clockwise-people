"use client";

import { useActionState, useMemo, useState } from "react";
import BrandMark from "@/components/BrandMark";
import StorageUploadButton from "@/components/StorageUploadButton";
import { updateCompanyLogo } from "@/lib/foundation/actions";

type CompanyLogoFormProps = {
  companyName: string;
  logoUrl: string | null;
};

const initialState = {
  ok: true,
  message: "",
};

export default function CompanyLogoForm({
  companyName,
  logoUrl,
}: CompanyLogoFormProps) {
  const [state, formAction, pending] = useActionState(
    updateCompanyLogo,
    initialState,
  );
  const [currentLogoUrl, setCurrentLogoUrl] = useState(logoUrl ?? "");
  const previewUrl = useMemo(() => currentLogoUrl.trim() || null, [currentLogoUrl]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="flex items-center gap-3.5">
        <span className="grid size-16 place-items-center rounded-2xl border border-border/80 bg-background shadow-soft p-1">
          <BrandMark
            logoUrl={previewUrl}
            brandName={companyName}
            imageSize={48}
            imageClassName="h-12 w-auto rounded-xl"
            textClassName="px-2 text-center text-xs font-bold text-primary"
            alwaysShowLogo
          />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-foreground">
            {companyName}
          </p>
          <p className="text-xs text-muted">
            Use a public image link or upload a logo.
          </p>
        </div>
      </div>

      {state.message ? (
        <p
          className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-xs ${
            state.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <label className="grid gap-1.5 text-sm font-bold text-foreground">
        <span>Company logo link</span>
        <input
          name="logo_url"
          value={currentLogoUrl}
          onChange={(event) => setCurrentLogoUrl(event.target.value)}
          placeholder="https://..."
          className="h-11 sm:h-12 w-full rounded-full border border-border/80 bg-background px-4 text-sm text-foreground outline-none focus:border-primary shadow-xs"
        />
      </label>

      <StorageUploadButton
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        folder="logo"
        hint="Allowed: JPG, PNG, WebP (Max 5 MB). SVG & script files are blocked for security."
        onUploaded={(publicUrl) => setCurrentLogoUrl(publicUrl)}
      />


      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[44px] h-11 items-center justify-center rounded-full bg-primary px-6 text-xs font-bold text-white shadow-soft hover:brightness-105 disabled:opacity-60 transition-all cursor-pointer"
        >
          {pending ? "Saving..." : "Save logo"}
        </button>
      </div>
    </form>
  );
}
