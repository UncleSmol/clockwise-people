"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type BrandMarkProps = {
  className?: string;
  imageClassName?: string;
  textClassName?: string;
  imageSize?: number;
  priority?: boolean;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

type BrandVariant = "logo" | "text";

function getBrandVariant(now = Date.now()): BrandVariant {
  return Math.floor(now / THREE_DAYS_MS) % 2 === 0 ? "logo" : "text";
}

export default function BrandMark({
  className,
  imageClassName = "size-10 rounded-md",
  textClassName = "text-lg font-semibold text-primary",
  imageSize = 40,
  priority = false,
}: BrandMarkProps) {
  const [variant, setVariant] = useState<BrandVariant>(() => getBrandVariant());

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
      {variant === "logo" ? (
        <Image
          src="/assets/clockwise-people-logo.png"
          alt="ClockWise People logo"
          width={imageSize}
          height={imageSize}
          className={imageClassName}
          priority={priority}
        />
      ) : (
        <span className={textClassName}>ClockWise People</span>
      )}
    </span>
  );
}
