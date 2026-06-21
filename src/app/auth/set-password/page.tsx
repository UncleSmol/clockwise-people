import BrandMark from "@/components/BrandMark";
import SetPasswordForm from "@/components/SetPasswordForm";

export default function SetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-md rounded-md border border-border bg-surface p-6 shadow-sm">
        <BrandMark
          className="mb-6 flex"
          imageSize={56}
          imageClassName="size-14 rounded-md"
          textClassName="text-xl font-semibold text-primary"
          priority
        />
        <h1 className="text-2xl font-semibold text-foreground">Set your password</h1>
        <p className="mt-2 text-sm text-muted">
          Create a password for future sign-ins.
        </p>
        <SetPasswordForm />
      </section>
    </main>
  );
}
