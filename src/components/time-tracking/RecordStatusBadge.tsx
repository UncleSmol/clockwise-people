"use client";

import Image from "next/image";

export type RecordStatus =
  | "submitted"
  | "draft"
  | "verified"
  | "approved"
  | "rejected"
  | "locked"
  | string;

type RecordStatusBadgeProps = {
  status: RecordStatus;
  isFixed?: boolean;
  className?: string;
  size?: number;
  priority?: boolean;
};

const BADGE_MAP: Record<string, { src: string; alt: string; label: string }> = {
  submitted: {
    src: "/assets/submitted-badge.png",
    alt: "Submitted badge",
    label: "Submitted",
  },
  draft: {
    src: "/assets/draft-badge.png",
    alt: "Draft badge",
    label: "Draft",
  },
  verified: {
    src: "/assets/verified-badge.png",
    alt: "Verified badge",
    label: "Verified",
  },
  approved: {
    src: "/assets/verified-badge.png",
    alt: "Verified badge",
    label: "Verified",
  },
  rejected: {
    src: "/assets/rejected-badge.png",
    alt: "Rejected badge",
    label: "Rejected",
  },
  locked: {
    src: "/assets/verified-badge.png",
    alt: "Verified & Locked badge",
    label: "Verified",
  },
};

export default function RecordStatusBadge({
  status,
  isFixed = false,
  className = "",
  size = 40,
  priority = false,
}: RecordStatusBadgeProps) {
  const normalizedKey = (status ?? "").toLowerCase().trim();
  const badgeKey = isFixed ? "draft" : normalizedKey === "approved" ? "verified" : normalizedKey;
  const config = BADGE_MAP[badgeKey];

  if (!config) {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${className}`}
      >
        {status}
      </span>
    );
  }

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center transition-transform hover:scale-105 ${className}`}
      title={isFixed ? "Draft (Fixed · Ready to submit)" : config.label}
    >
      <Image
        src={config.src}
        alt={config.alt}
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        decoding="async"
        className="size-10 sm:size-11 object-contain shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.22)] select-none pointer-events-none"
      />
    </div>
  );
}
