import ComplianceDocuments from "@/components/compliance/ComplianceDocuments";
import { getActiveCompany } from "@/lib/foundation/queries";

export default async function DocumentsPage() {
  const { company } = await getActiveCompany();

  return (
    <div className="grid gap-4">
      <header className="premium-hero rounded-md p-4 text-white sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
          Documents
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
          Compliance documents
        </h1>
        <p className="mt-2 max-w-2xl text-sm opacity-80">
          Policies for {company.name} users covering location data, privacy, monitoring,
          retention, security, and acceptable use.
        </p>
      </header>

      <ComplianceDocuments />
    </div>
  );
}
