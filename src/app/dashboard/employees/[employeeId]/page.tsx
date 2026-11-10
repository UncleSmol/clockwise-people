import { redirect } from "next/navigation";
import { getCurrentUserAccess } from "@/lib/foundation/queries";

type EmployeeDetailPageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ message?: string }>;
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  const access = await getCurrentUserAccess();
  if (!access.canManageEmployees) {
    const fallback = access.canViewLiveWorkforce ? "/dashboard?panel=attendance" : "/dashboard";
    redirect(`${fallback}&message=${encodeURIComponent("Access restricted: You do not have permission to view employee records.")}`);
  }
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
