import Link from "next/link";
import type { ReactNode } from "react";
import { getActiveCompany } from "@/lib/foundation/queries";
import { getUnseenAppUpdates } from "@/lib/app-updates/queries";
import { getDashboardNotifications } from "@/lib/dashboard/queries";
import AppUpdateChangelog from "@/components/AppUpdateChangelog";
import DashboardNavigation from "@/components/DashboardNavigation";
import BrandMark from "@/components/BrandMark";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [{ company }, unseenUpdates] = await Promise.all([
    getActiveCompany(),
    getUnseenAppUpdates(),
  ]);
  const notifications = await getDashboardNotifications();
  const updateNoticeKey =
    unseenUpdates.map((update) => update.id).sort().join(":") || "no-updates";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1"
          >
            <BrandMark
              brandName={company.name}
              logoUrl={company.logo_url}
              imageSize={28}
              imageClassName="size-7 rounded"
              textClassName="truncate text-sm font-bold text-foreground"
              priority
            />
          </Link>
          <DashboardNavigation
            companyName={company.name}
            companyLogoUrl={company.logo_url}
            notifications={notifications}
          />
        </div>
      </div>
      {children}
      <AppUpdateChangelog key={updateNoticeKey} updates={unseenUpdates} />
      <PwaInstallPrompt />
    </main>
  );
}
