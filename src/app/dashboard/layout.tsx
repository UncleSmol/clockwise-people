import Link from "next/link";
import type { ReactNode } from "react";
import { getActiveCompany } from "@/lib/foundation/queries";
import DashboardNavigation from "@/components/DashboardNavigation";
import BrandMark from "@/components/BrandMark";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { company } = await getActiveCompany();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="relative border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3 text-lg font-semibold text-primary"
          >
            <BrandMark
              imageSize={36}
              imageClassName="size-9 rounded-md"
              textClassName="truncate text-lg font-semibold text-primary"
              priority
            />
          </Link>
          <DashboardNavigation companyName={company.name} />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </main>
  );
}
