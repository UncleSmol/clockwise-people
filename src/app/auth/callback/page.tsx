import { Suspense } from "react";
import AuthCallbackClient from "@/components/AuthCallbackClient";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
          <section className="w-full max-w-md rounded-md border border-border bg-surface p-6 text-center shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
              ClockWise People
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">Please wait</h1>
            <p className="mt-2 text-sm text-muted">Completing secure sign in...</p>
          </section>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
