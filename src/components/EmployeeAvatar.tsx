"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";

type EmployeeAvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
};

function initials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase()).join("") || null;
}

export default function EmployeeAvatar({
  className = "size-9",
  name,
  src,
}: EmployeeAvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = initials(name);

  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-muted text-xs font-semibold text-foreground ${className}`}
      aria-label={`${name} profile picture`}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : label ? (
        <span aria-hidden="true">{label}</span>
      ) : (
        <UserRound className="size-4 text-muted" aria-hidden="true" />
      )}
    </span>
  );
}
