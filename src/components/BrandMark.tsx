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

function getBrandVariant() {
  return Math.floor(Date.now() / THREE_DAYS_MS) % 2 === 0 ? "logo" : "text";
}

export default function BrandMark({
  className,
  imageClassName = "size-10 rounded-md",
  textClassName = "text-lg font-semibold text-primary",
  imageSize = 40,
  priority = false,
}: BrandMarkProps) {
  const [variant, setVariant] = useState<"logo" | "text">("logo");

  useEffect(() => {
    const syncVariant = () => setVariant(getBrandVariant());

    syncVariant();
    const interval = window.setInterval(syncVariant, 60 * 60 * 1000);

    return () => window.clearInterval(interval);
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
