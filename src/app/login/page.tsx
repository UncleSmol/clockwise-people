import BrandMark from "@/components/BrandMark";
import { signIn } from "@/lib/auth/actions";

type LoginPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10">
      <section className="w-full max-w-sm">
        <BrandMark
          className="mb-6 flex justify-center"
          imageSize={48}
          imageClassName="size-12 rounded-lg"
          textClassName="text-lg font-bold text-primary"
          priority
        />
        <div className="card p-6">
          <h1 className="text-xl font-bold text-foreground">Sign in</h1>
          <p className="mt-1 text-sm text-muted">
            Sign in to continue to your workspace.
          </p>

          {params?.message && (
            <div className="mt-4 rounded-lg border border-danger/20 bg-danger/8 px-4 py-3 text-sm font-medium text-danger">
              {params.message}
            </div>
          )}

          <form action={signIn} className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Email
              <input
                name="email"
                type="email"
                required
                placeholder="name@company.co.za"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Password
              <input
                name="password"
                type="password"
                required
                placeholder="Enter your password"
              />
            </label>
            <button className="btn btn-accent w-full text-center">
              Sign in
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            Need help? Contact your workspace administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
