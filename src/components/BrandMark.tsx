"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type BrandMarkProps = {
  alwaysShowLogo?: boolean;
  brandName?: string;
  className?: string;
  imageClassName?: string;
  textClassName?: string;
  imageSize?: number;
  logoUrl?: string | null;
  priority?: boolean;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

type BrandVariant = "logo" | "text";

function getBrandVariant(now = Date.now()): BrandVariant {
  return Math.floor(now / THREE_DAYS_MS) % 2 === 0 ? "logo" : "text";
}

export default function BrandMark({
  alwaysShowLogo = false,
  brandName = "ClockWise People",
  className,
  imageClassName = "size-10 rounded-md",
  textClassName = "text-lg font-semibold text-primary",
  imageSize = 40,
  logoUrl = null,
  priority = false,
}: BrandMarkProps) {
  const [variant, setVariant] = useState<BrandVariant>(() => getBrandVariant());
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let timeout: number;

    const syncVariant = () => {
      const now = Date.now();
      setVariant(getBrandVariant(now));

      const nextChangeIn = THREE_DAYS_MS - (now % THREE_DAYS_MS);

      timeout = window.setTimeout(syncVariant, nextChangeIn);
    };

    syncVariant();
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <span className={className}>
      {logoUrl && failedLogoUrl !== logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`${brandName} logo`}
          className={imageClassName}
          loading={priority ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailedLogoUrl(logoUrl)}
        />
      ) : alwaysShowLogo || variant === "logo" ? (
        <Image
          src="/assets/clockwise-people-logo.png"
          alt={`${brandName} logo`}
          width={imageSize}
          height={imageSize}
          className={imageClassName}
          priority={priority}
        />
      ) : (
        <span className={textClassName}>{brandName}</span>
      )}
    </span>
  );
}
