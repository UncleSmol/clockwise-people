import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-foreground">
      <div className="text-center">
        <BrandMark
          className="mb-6 flex justify-center"
          imageSize={120}
          imageClassName="size-28 rounded-2xl sm:size-32"
          textClassName="text-4xl font-bold tracking-tight text-primary sm:text-6xl"
          priority
        />
        <p className="mt-3 text-base font-medium text-muted sm:text-lg">
          Track Time. Manage People. Prepare Payroll.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="btn btn-accent"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
