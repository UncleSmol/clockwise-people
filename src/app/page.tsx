import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="text-center">
        <Image
          src="/assets/clockwise-people-logo.png"
          alt="ClockWise People logo"
          width={144}
          height={144}
          className="mx-auto mb-6 size-28 rounded-2xl shadow-sm sm:size-36"
          priority
        />
        <h1 className="font-sans text-5xl font-semibold tracking-normal text-primary sm:text-7xl">
          ClockWise People
        </h1>
        <p className="mt-4 text-lg font-medium text-muted sm:text-2xl">
          Track Time. Manage People. Prepare Payroll.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
