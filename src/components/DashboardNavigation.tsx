"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth/actions";
import ThemeToggle from "@/components/ThemeToggle";

type DashboardNavigationProps = {
  companyName: string;
};

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/company", label: "Company" },
  { href: "/dashboard/employees", label: "Employees" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNavigation({ companyName }: DashboardNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <nav className="hidden items-center gap-4 text-sm font-medium text-muted md:flex">
        <span className="text-muted">{companyName}</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`hover:text-primary ${
              isActive(pathname, link.href) ? "text-primary" : "text-foreground"
            }`}
          >
            {link.label}
          </Link>
        ))}
        <ThemeToggle />
        <form action={signOut}>
          <button className="font-semibold text-foreground hover:text-primary">
            Sign out
          </button>
        </form>
      </nav>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          className="grid size-10 place-items-center rounded-md border border-border bg-surface text-foreground shadow-sm"
        >
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-200 ${
                open ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 ${
                open ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute bottom-0 left-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-200 ${
                open ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </span>
        </button>

        <div
          className={`absolute left-4 right-4 top-[72px] z-40 overflow-hidden rounded-md border border-border bg-surface shadow-lg transition-[max-height,opacity,transform] duration-200 ${
            open
              ? "max-h-96 translate-y-0 opacity-100"
              : "pointer-events-none max-h-0 -translate-y-2 opacity-0"
          }`}
        >
          <div className="grid gap-1 p-3">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {companyName}
            </p>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  isActive(pathname, link.href)
                    ? "bg-surface-muted text-primary"
                    : "text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-3">
              <ThemeToggle />
              <form action={signOut}>
                <button className="text-sm font-semibold text-foreground">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
