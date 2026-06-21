import ChangePasswordForm from "@/components/account/ChangePasswordForm";

export default function AccountPage() {
  return (
    <div className="grid gap-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
          Security settings
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Update the password used to sign in to this workspace.
        </p>
      </header>

      <section className="grid max-w-xl gap-4 rounded-md border border-border bg-surface p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Change password</h2>
          <p className="mt-1 text-sm text-muted">
            Use this after receiving temporary credentials from your administrator.
          </p>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
