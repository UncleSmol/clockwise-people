import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border/80 bg-surface p-6 sm:p-8 text-center shadow-soft">
        <BrandMark
          className="flex justify-center"
          imageSize={72}
          imageClassName="size-18 rounded-2xl shadow-soft"
          textClassName="text-2xl font-bold text-primary"
          priority
        />
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          Page not found
        </p>
        <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-foreground">
          This page is not available
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-xs sm:text-sm leading-6 text-muted">
          The link may be incorrect, expired, or you may not have access to this workspace area.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-white shadow-soft hover:bg-primary-hover transition-colors text-center"
          >
            Go to dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-border bg-surface px-6 py-3 text-sm font-semibold text-foreground hover:bg-surface-muted transition-colors shadow-soft text-center"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
