import BrandMark from "@/components/BrandMark";
import SetPasswordForm from "@/components/SetPasswordForm";

export default function SetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-10 text-foreground">
      <section className="w-full max-w-sm">
        <BrandMark
          className="mb-6 flex justify-center"
          imageSize={48}
          imageClassName="size-12 rounded-lg"
          textClassName="text-lg font-bold text-primary"
          priority
        />
        <div className="card p-6">
          <h1 className="text-xl font-bold text-foreground">Set your password</h1>
          <p className="mt-1 text-sm text-muted">
            Create a password for future sign-ins.
          </p>
          <SetPasswordForm />
        </div>
      </section>
    </main>
  );
}
