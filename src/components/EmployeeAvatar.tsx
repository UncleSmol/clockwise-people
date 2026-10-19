"use client";

import { UserRound } from "lucide-react";
import { useState } from "react";

type EmployeeAvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
  statusBadge?: "working" | "on_lunch" | "on_leave" | "review" | "offline" | null;
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
  statusBadge,
}: EmployeeAvatarProps) {
  const [failed, setFailed] = useState(false);
  const label = initials(name);
  const defaultClass = className.includes("rounded-")
    ? ""
    : " rounded-full";
  const defaultBorder = className.includes("border-") ? "" : " border border-border";

  const statusBadgeElement = statusBadge === "on_leave" ? (
    <span
      className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-violet-600 ring-2 ring-white shadow-xs z-10"
      title="On Leave"
      aria-label="On Leave"
    />
  ) : statusBadge === "working" ? (
    <span
      className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-emerald-500 ring-2 ring-white shadow-xs z-10"
      title="Clocked In"
      aria-label="Clocked In"
    />
  ) : statusBadge === "on_lunch" ? (
    <span
      className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-amber-500 ring-2 ring-white shadow-xs z-10"
      title="On Lunch"
      aria-label="On Lunch"
    />
  ) : statusBadge === "review" ? (
    <span
      className="absolute -bottom-0.5 -right-0.5 block size-2.5 rounded-full bg-rose-500 ring-2 ring-white shadow-xs z-10"
      title="Review Needed"
      aria-label="Review Needed"
    />
  ) : null;

  const leaveRingClass = statusBadge === "on_leave" ? " ring-2 ring-violet-500 ring-offset-1" : "";

  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={`relative grid shrink-0 place-items-center overflow-hidden bg-surface-muted text-xs font-semibold text-foreground${defaultClass}${defaultBorder}${leaveRingClass} ${className}`}
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
      {statusBadgeElement}
    </span>
  );
}
