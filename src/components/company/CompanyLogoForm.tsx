"use client";

import { Image as ImageIcon, Save } from "lucide-react";
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
      <div className="flex items-center gap-3">
        <span className="grid size-14 place-items-center rounded-lg border border-border bg-background">
          <BrandMark
            logoUrl={previewUrl}
            brandName={companyName}
            imageSize={44}
            imageClassName="h-11 w-auto rounded-md"
            textClassName="px-2 text-center text-xs font-semibold text-primary"
            alwaysShowLogo
          />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">
            {companyName}
          </p>
          <p className="text-xs text-muted">
            Use a public image link or upload a logo.
          </p>
        </div>
      </div>

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

      <label className="grid gap-1.5 text-sm font-semibold text-foreground">
        <span className="inline-flex items-center gap-2">
          <ImageIcon className="size-4 text-accent" />
          Company logo link
        </span>
        <input
          name="logo_url"
          value={currentLogoUrl}
          onChange={(event) => setCurrentLogoUrl(event.target.value)}
          placeholder="https://..."
        />
      </label>

      <StorageUploadButton
        accept="image/*"
        folder="logo"
        hint="Or upload a logo under 5 MB."
        onUploaded={(publicUrl) => setCurrentLogoUrl(publicUrl)}
      />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <Save className="size-4" />
          {pending ? "Saving..." : "Save logo"}
        </button>
      </div>
    </form>
  );
}
