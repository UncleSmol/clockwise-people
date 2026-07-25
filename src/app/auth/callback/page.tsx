import { Suspense } from "react";
import AuthCallbackClient from "@/components/AuthCallbackClient";
import BrandMark from "@/components/BrandMark";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
          <section className="w-full max-w-sm">
            <BrandMark
              className="mb-6 flex justify-center"
              imageSize={48}
              imageClassName="size-12 rounded-lg"
              textClassName="text-lg font-bold text-primary"
              priority
            />
            <div className="card p-6 text-center">
              <h1 className="text-xl font-bold text-foreground">Please wait</h1>
              <p className="mt-1 text-sm text-muted">Completing secure sign in...</p>
            </div>
          </section>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
