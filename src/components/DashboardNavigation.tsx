"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth/actions";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";

type DashboardNavigationProps = {
  canManageCompany: boolean;
  canManageEmployees: boolean;
  companyLogoUrl: string | null;
  companyName: string;
};

const baseLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/time", label: "Time" },
  { href: "/dashboard/leave", label: "Leave" },
  { href: "/dashboard/documents", label: "Documents" },
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
  companyLogoUrl,
  companyName,
}: DashboardNavigationProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const links = [
    baseLinks[0],
    baseLinks[1],
    baseLinks[2],
    baseLinks[3],
    ...(canManageCompany ? [{ href: "/dashboard/company", label: "Company" }] : []),
    ...(canManageEmployees ? [{ href: "/dashboard/employees", label: "Employees" }] : []),
    baseLinks[4],
  ];

  return (
    <div className="flex items-center gap-2">
      {/* Desktop nav */}
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

      {/* Mobile nav */}
      <div className="md:hidden">
        {/* Hamburger button */}
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          className={`grid size-11 place-items-center rounded-md border border-border bg-surface text-foreground shadow-sm transition-[background-color,border-color,color,box-shadow,transform] duration-200 ${
            open ? "fixed right-4 top-4 z-[60]" : "relative z-10"
          }`}
        >
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 top-0 h-0.5 w-5 origin-center rounded-full bg-current transition-transform duration-300 ease-out ${
                open ? "translate-y-[7px] rotate-45" : "translate-y-0 rotate-0"
              }`}
            />
            <span
              className={`absolute left-0 top-[7px] h-0.5 w-5 origin-center rounded-full bg-current transition-all duration-200 ease-out ${
                open ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100"
              }`}
            />
            <span
              className={`absolute bottom-0 left-0 h-0.5 w-5 origin-center rounded-full bg-current transition-transform duration-300 ease-out ${
                open ? "-translate-y-[7px] -rotate-45" : "translate-y-0 rotate-0"
              }`}
            />
          </span>
        </button>

        {/* Overlay */}
        <div
          aria-hidden={!open}
          className={`mobile-nav-overlay fixed inset-0 z-40 transition-opacity duration-200 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setOpen(false)}
        />

        {/* Slide-in panel — isolation:isolate + explicit solid bg fixes bleed-through */}
        <aside
          aria-label="Mobile navigation"
          style={{
            backgroundColor: "var(--color-surface)",
            isolation: "isolate",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
          className={`fixed inset-x-0 top-0 z-50 max-h-dvh w-screen overflow-y-auto overscroll-contain shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-y-0" : "-translate-y-full"
          }`}
        >
          <div
            className="flex min-h-dvh flex-col"
            style={{ backgroundColor: "var(--color-surface)" }}
          >
            {/* Header */}
            <div className="mobile-nav-header flex items-center justify-between gap-4 px-5 py-5 pr-20 text-foreground">
              <div className="flex min-w-0 items-center gap-3">
                <BrandMark
                  alwaysShowLogo
                  brandName={companyName}
                  logoUrl={companyLogoUrl}
                  imageSize={36}
                  imageClassName="size-9 shrink-0 rounded-md border border-border bg-surface object-cover p-1 shadow-sm"
                  textClassName="text-sm font-semibold text-primary"
                />
                <p className="truncate text-base font-semibold">{companyName}</p>
              </div>
            </div>

            {/* Links */}
            <nav
              className="grid gap-2 px-4 py-5"
              style={{ backgroundColor: "var(--color-surface)" }}
            >
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-4 py-3 text-sm font-semibold ${
                    isActive(pathname, link.href)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "mobile-nav-link border border-border text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Footer */}
            <div className="mobile-nav-footer mt-auto grid gap-4 border-t border-border px-5 py-5">
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
