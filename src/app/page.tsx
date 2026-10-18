import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12 text-foreground">
      <div className="w-full max-w-sm text-center">
        <BrandMark
          className="mb-8 flex justify-center"
          imageSize={120}
          imageClassName="size-28 rounded-3xl object-contain shadow-soft p-2 bg-surface border border-border sm:size-32"
          textClassName="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
          priority
        />
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Stay on top of your workforce with us.
        </h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-muted sm:text-base">
          Track Time. Manage People. Prepare Payroll. All in one modern mobile workspace.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/login"
            className="btn btn-primary w-full max-w-xs py-3.5 text-base font-bold shadow-primary"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
