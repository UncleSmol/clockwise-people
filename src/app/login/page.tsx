import Image from "next/image";
import { signIn } from "@/lib/auth/actions";

type LoginPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-6 shadow-sm">
        <Image
          src="/assets/clockwise-people-logo.png"
          alt="ClockWise People logo"
          width={56}
          height={56}
          className="mb-6 size-14 rounded-md"
          priority
        />
        <h1 className="text-2xl font-semibold text-foreground">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to continue to ClockWise People.
        </p>

        {params?.message && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {params.message}
          </div>
        )}

        <form action={signIn} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Email
            <input
              name="email"
              type="email"
              required
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Password
            <input
              name="password"
              type="password"
              required
              className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-ring focus:ring-2"
            />
          </label>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Sign in
          </button>
        </form>

        <p className="mt-5 text-sm text-muted">
          Need help? Contact your workspace administrator.
        </p>
      </section>
    </main>
  );
}
