"use client";

import { signOut } from "@/lib/auth/actions";
import NotificationMenu from "@/components/NotificationMenu";
import ThemeToggle from "@/components/ThemeToggle";
import type { DashboardNotification } from "@/lib/dashboard/schema";

type DashboardNavigationProps = {
  companyLogoUrl: string | null;
  companyName: string;
  notifications: DashboardNotification[];
};

export default function DashboardNavigation({
  notifications,
}: DashboardNavigationProps) {
  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <NotificationMenu notifications={notifications} />
      <form action={signOut}>
        <button
          className="btn btn-ghost text-sm"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
