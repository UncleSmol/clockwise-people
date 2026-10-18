"use client";

import { useActionState, useMemo, useState } from "react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import StorageUploadButton from "@/components/StorageUploadButton";
import { updateOwnProfile } from "@/lib/account/actions";

type ProfileFormProps = {
  employee: {
    avatarUrl: string | null;
    email: string | null;
    fullName: string;
    knownAs: string | null;
    phoneNumber: string | null;
  };
};

const initialState = {
  ok: true,
  message: "",
};

export default function ProfileForm({ employee }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateOwnProfile,
    initialState,
  );
  const [avatarUrl, setAvatarUrl] = useState(employee.avatarUrl ?? "");
  const displayName = employee.knownAs || employee.fullName;
  const previewUrl = useMemo(() => avatarUrl.trim() || null, [avatarUrl]);

  return (
    <form action={formAction} className="grid gap-5">
      <div className="flex flex-col items-center justify-center gap-3 text-center sm:flex-row sm:text-left">
        <div className="relative">
          <EmployeeAvatar
            name={displayName}
            src={previewUrl}
            className="size-20 rounded-full border-2 border-border shadow-soft object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-foreground">
            {displayName}
          </p>
          <p className="text-xs text-muted">
            Paste a public image link or upload a new photo.
          </p>
        </div>
      </div>

      {state.message ? (
        <p
          className={`rounded-2xl border px-4 py-2.5 text-xs font-semibold ${
            state.ok
              ? "border-success/20 bg-success/10 text-success"
              : "border-danger/20 bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <span>Preferred name</span>
          <input
            name="known_as"
            defaultValue={employee.knownAs ?? ""}
            placeholder="Name people use"
            className="h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <span>Work email</span>
          <input
            name="email"
            type="email"
            defaultValue={employee.email ?? ""}
            placeholder="name@company.com"
            className="h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <span>Phone</span>
          <input
            name="phone_number"
            defaultValue={employee.phoneNumber ?? ""}
            placeholder="Phone number"
            className="h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <span>Picture link</span>
          <input
            name="avatar_url"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://..."
            className="h-11 rounded-full border border-border bg-surface px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <StorageUploadButton
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          folder="avatar"
          hint="Allowed: JPG, PNG, WebP (Max 5 MB). SVG & script files are blocked for security."
          onUploaded={(publicUrl) => setAvatarUrl(publicUrl)}
        />

      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary rounded-full px-6 py-2.5 text-sm font-bold shadow-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
