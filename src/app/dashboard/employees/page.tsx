import { redirect } from "next/navigation";
import { getCurrentUserAccess } from "@/lib/foundation/queries";

type EmployeesPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const access = await getCurrentUserAccess();
  if (!access.canManageEmployees) {
    redirect("/dashboard?panel=attendance&message=" + encodeURIComponent("Access restricted: You do not have permission to view employee records."));
  }
  const params = await searchParams;
  const message = params?.message ? `&message=${encodeURIComponent(params.message)}` : "";
  redirect(`/dashboard?panel=people${message}`);
}
