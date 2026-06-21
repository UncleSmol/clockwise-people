"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth/actions";
import ThemeToggle from "@/components/ThemeToggle";

type DashboardNavigationProps = {
  canManageCompany: boolean;
  canManageEmployees: boolean;
  companyName: string;
};

const baseLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/account", label: "Account" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardNavigation({
  canManageCompany,
  canManageEmployees,
  companyName,
}: DashboardNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [
    baseLinks[0],
    ...(canManageCompany ? [{ href: "/dashboard/company", label: "Company" }] : []),
    ...(canManageEmployees ? [{ href: "/dashboard/employees", label: "Employees" }] : []),
    baseLinks[1],
  ];

  return (
    <div className="flex items-center gap-2">
      <nav className="hidden items-center gap-2 rounded-full border border-border/80 bg-background/70 p-1 text-sm font-semibold text-muted shadow-sm backdrop-blur md:flex">
        <span className="max-w-44 truncate px-3 text-muted">{companyName}</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-2 hover:text-primary ${
              isActive(pathname, link.href)
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground"
            }`}
          >
            {link.label}
          </Link>
        ))}
        <ThemeToggle />
        <form action={signOut}>
          <button className="rounded-full px-3 py-2 font-semibold text-foreground hover:text-primary">
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
          className="grid size-11 place-items-center rounded-md border border-border bg-surface/90 text-foreground shadow-sm backdrop-blur"
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
          aria-hidden={!open}
          className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />

        <aside
          aria-label="Mobile navigation"
          className={`fixed bottom-0 right-0 top-0 z-50 w-[min(86vw,360px)] border-l border-border bg-surface/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="premium-hero flex items-center justify-between gap-4 px-5 py-5 text-white">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">
                  {companyName}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                  Navigation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="grid size-9 shrink-0 place-items-center rounded-md border border-white/20 bg-white/10 text-white"
              >
                <span className="relative block size-4">
                  <span className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                  <span className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
                </span>
              </button>
            </div>

            <nav className="grid gap-2 px-4 py-5">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-4 py-3 text-sm font-semibold ${
                    isActive(pathname, link.href)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background/60 text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto grid gap-4 border-t border-border px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">Theme</span>
                <ThemeToggle />
              </div>
              <form action={signOut}>
                <button className="w-full rounded-md border border-border bg-surface-muted px-4 py-3 text-sm font-semibold text-foreground">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
