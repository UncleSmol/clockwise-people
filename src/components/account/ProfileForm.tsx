"use client";

import { Image as ImageIcon, Mail, Phone, Save, UserRound } from "lucide-react";
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
    <form action={formAction} className="grid gap-4">
      <div className="flex items-center gap-3">
        <EmployeeAvatar
          name={displayName}
          src={previewUrl}
          className="size-14 rounded-lg"
        />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">
            {displayName}
          </p>
          <p className="text-xs text-muted">
            Paste a public image link or upload a picture.
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-foreground">
          <span className="inline-flex items-center gap-2">
            <UserRound className="size-4 text-accent" />
            Preferred name
          </span>
          <input
            name="known_as"
            defaultValue={employee.knownAs ?? ""}
            placeholder="Name people use"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-semibold text-foreground">
          <span className="inline-flex items-center gap-2">
            <Mail className="size-4 text-accent" />
            Work email
          </span>
          <input
            name="email"
            type="email"
            defaultValue={employee.email ?? ""}
            placeholder="name@company.com"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-semibold text-foreground">
          <span className="inline-flex items-center gap-2">
            <Phone className="size-4 text-accent" />
            Phone
          </span>
          <input
            name="phone_number"
            defaultValue={employee.phoneNumber ?? ""}
            placeholder="Phone number"
          />
        </label>

        <label className="grid gap-1.5 text-sm font-semibold text-foreground">
          <span className="inline-flex items-center gap-2">
            <ImageIcon className="size-4 text-accent" />
            Picture link
          </span>
          <input
            name="avatar_url"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://..."
          />
        </label>
        <StorageUploadButton
          accept="image/*"
          folder="avatar"
          hint="Or upload an image under 5 MB."
          onUploaded={(publicUrl) => setAvatarUrl(publicUrl)}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <Save className="size-4" />
          {pending ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}
