import { redirect } from "next/navigation";
import { getCurrentUserAccess } from "@/lib/foundation/queries";

type EmployeesPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const access = await getCurrentUserAccess();
  if (!access.canManageEmployees) {
    const fallback = access.canViewLiveWorkforce ? "/dashboard?panel=attendance" : "/dashboard";
    redirect(`${fallback}&message=${encodeURIComponent("Access restricted: You do not have permission to view employee records.")}`);
  }
  const params = await searchParams;
  const message = params?.message ? `&message=${encodeURIComponent(params.message)}` : "";
  redirect(`/dashboard?panel=people${message}`);
}
