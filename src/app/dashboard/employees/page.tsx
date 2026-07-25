import { redirect } from "next/navigation";

type EmployeesPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const params = await searchParams;
  const message = params?.message ? `&message=${encodeURIComponent(params.message)}` : "";
  redirect(`/dashboard?panel=people${message}`);
}
