import { redirect } from "next/navigation";

type EmployeeDetailPageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ message?: string }>;
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  const { employeeId } = await params;
  const resolvedSearchParams = await searchParams;
  const search = new URLSearchParams({ panel: "people", employeeId });

  if (resolvedSearchParams?.message) {
    search.set("message", resolvedSearchParams.message);
  }

  if (typeof (resolvedSearchParams as { manualInviteUrl?: string } | undefined)?.manualInviteUrl === "string") {
    search.set("manualInviteUrl", (resolvedSearchParams as { manualInviteUrl?: string }).manualInviteUrl ?? "");
  }

  redirect(`/dashboard?${search.toString()}`);
}
