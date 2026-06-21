import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-md border border-border bg-surface p-6 text-center shadow-sm">
        <Image
          src="/assets/clockwise-people-logo.png"
          alt="ClockWise People logo"
          width={72}
          height={72}
          className="mx-auto size-18 rounded-xl"
          priority
        />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
          Page not found
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          This page is not available
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">
          The link may be incorrect, expired, or you may not have access to this workspace area.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Go to dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
