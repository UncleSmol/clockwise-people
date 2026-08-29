import Link from "next/link";
import type { ReactNode } from "react";
import { getActiveCompany } from "@/lib/foundation/queries";
import { getAccountProfile } from "@/lib/account/queries";
import { getUnseenAppUpdates } from "@/lib/app-updates/queries";
import { getDashboardNotifications } from "@/lib/dashboard/queries";
import { PanelBridgeProvider } from "@/components/dashboard/panel-bridge";
import { RealtimeSyncProvider } from "@/components/realtime/RealtimeSyncProvider";
import AppUpdateChangelog from "@/components/AppUpdateChangelog";
import DashboardNavigation from "@/components/DashboardNavigation";
import BrandMark from "@/components/BrandMark";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import { UIQADashboard } from "@/components/UIQADashboard";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [{ company }, unseenUpdates, accountProfile] = await Promise.all([
    getActiveCompany(),
    getUnseenAppUpdates(),
    getAccountProfile(),
  ]);
  const notifications = await getDashboardNotifications();
  const updateNoticeKey =
    unseenUpdates.map((update) => update.id).sort().join(":") || "no-updates";

  return (
    <main className="min-h-screen text-foreground">
      <RealtimeSyncProvider companyId={company.id}>
        <PanelBridgeProvider>
          <div className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-xs">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <Link
              href="/dashboard"
              className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1"
            >
              <BrandMark
                brandName={company.name}
                logoUrl={company.logo_url}
                imageSize={28}
                imageClassName="h-7 w-auto rounded-lg"
                textClassName="truncate text-sm font-bold text-foreground"
                priority
              />
            </Link>
            <DashboardNavigation
              companyId={company.id}
              notifications={notifications}
              profileAvatarUrl={accountProfile.employee?.avatarUrl ?? null}
              profileName={accountProfile.employee?.knownAs ?? accountProfile.employee?.fullName ?? null}
            />
          </div>
        </div>
        {children}
        </PanelBridgeProvider>
      </RealtimeSyncProvider>
      <AppUpdateChangelog key={updateNoticeKey} updates={unseenUpdates} />
      <PwaInstallPrompt />
      {process.env.NODE_ENV === 'development' && <UIQADashboard />}
    </main>
  );
}
