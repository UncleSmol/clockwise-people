import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import SignInButton from "@/components/auth/SignInButton";
import { signIn } from "@/lib/auth/actions";

type LoginPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8 sm:px-6 transition-all duration-300">
      <section className="w-full max-w-sm">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-2xs hover:bg-surface-muted transition-colors"
            aria-label="Back to home"
          >
            <ChevronLeft className="size-5" />
          </Link>
        </div>

        <div className="mb-6">
          <BrandMark
            className="mb-3 flex"
            imageSize={44}
            imageClassName="size-11 rounded-2xl p-1 bg-surface border border-border object-contain shadow-2xs"
            textClassName="text-base font-bold text-foreground"
            alwaysShowLogo
            priority
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to continue to your workspace.
          </p>
        </div>

        <div className="card p-5 sm:p-7 shadow-soft">
          {params?.message && (
            <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-xs font-semibold text-danger">
              {params.message}
            </div>
          )}

          <form action={signIn} className="grid gap-4">
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                required
                placeholder="name@company.co.za"
                className="w-full rounded-full border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              <span>Password</span>
              <input
                name="password"
                type="password"
                required
                placeholder="Enter your password"
                className="w-full rounded-full border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <div className="mt-2">
              <SignInButton />
            </div>
          </form>

          <p className="mt-6 text-center text-xs font-medium text-muted">
            Need help? Contact your workspace administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
