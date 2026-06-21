import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="text-center">
        <BrandMark
          className="mb-6 flex justify-center"
          imageSize={144}
          imageClassName="size-28 rounded-2xl shadow-sm sm:size-36"
          textClassName="font-sans text-5xl font-semibold tracking-normal text-primary sm:text-7xl"
          priority
        />
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
