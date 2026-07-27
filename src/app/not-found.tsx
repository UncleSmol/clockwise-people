import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10 text-foreground">
      <section className="card w-full max-w-lg p-6 text-center">
        <BrandMark
          className="flex justify-center"
          imageSize={72}
          imageClassName="size-18 rounded-xl"
          textClassName="text-2xl font-semibold text-primary"
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
            className="btn btn-primary"
          >
            Go to dashboard
          </Link>
          <Link
            href="/login"
            className="btn btn-outline"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
