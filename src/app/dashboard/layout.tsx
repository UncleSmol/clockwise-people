import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth/actions";
import { getActiveCompany } from "@/lib/foundation/queries";
import ThemeToggle from "@/components/ThemeToggle";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { company } = await getActiveCompany();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 text-lg font-semibold text-primary"
          >
            <Image
              src="/assets/clockwise-people-logo.png"
              alt="ClockWise People logo"
              width={36}
              height={36}
              className="size-9 rounded-md"
            />
            <span>ClockWise People</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted">
            <span className="hidden text-muted md:inline">{company.name}</span>
            <Link href="/dashboard" className="text-foreground hover:text-primary">
              Dashboard
            </Link>
            <Link href="/dashboard/company" className="text-foreground hover:text-primary">
              Company
            </Link>
            <Link href="/dashboard/employees" className="text-foreground hover:text-primary">
              Employees
            </Link>
            <ThemeToggle />
            <form action={signOut}>
              <button className="font-semibold text-foreground hover:text-primary">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
    </main>
  );
}
