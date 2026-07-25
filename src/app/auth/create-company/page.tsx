import BrandMark from "@/components/BrandMark";
import CreateCompanyForm from "@/components/CreateCompanyForm";

export default function CreateCompanyPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-10 text-foreground">
      <section className="w-full max-w-sm">
        <BrandMark
          className="mb-6 flex justify-center"
          imageSize={48}
          imageClassName="size-12 rounded-lg"
          textClassName="text-lg font-bold text-primary"
          priority
        />
        <div className="card p-6">
          <h1 className="text-xl font-bold text-foreground">Create your workspace</h1>
          <p className="mt-1 text-sm text-muted">
            Set up your company to get started. You will be the workspace owner.
          </p>
          <CreateCompanyForm />
        </div>
      </section>
    </main>
  );
}
