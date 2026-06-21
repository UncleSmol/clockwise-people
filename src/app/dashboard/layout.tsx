import Link from "next/link";
import type { ReactNode } from "react";
import { getActiveCompany, getCurrentUserAccess } from "@/lib/foundation/queries";
import DashboardNavigation from "@/components/DashboardNavigation";
import BrandMark from "@/components/BrandMark";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [{ company }, access] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
  ]);

  return (
    <main className="premium-shell min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border/70 bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3 rounded-md px-1 py-1 text-lg font-semibold text-primary"
          >
            <BrandMark
              imageSize={36}
              imageClassName="size-9 rounded-md shadow-sm"
              textClassName="truncate text-lg font-semibold text-primary"
              priority
            />
          </Link>
          <DashboardNavigation
            canManageCompany={access.canManageCompany}
            canManageEmployees={access.canManageEmployees}
            companyName={company.name}
          />
        </div>
      </div>
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </main>
  );
}
