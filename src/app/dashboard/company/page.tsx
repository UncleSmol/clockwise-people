import { redirect } from "next/navigation";

type CompanyPageProps = {
  searchParams?: Promise<{ message?: string }>;
};

export default async function CompanyPage({ searchParams }: CompanyPageProps) {
  const params = await searchParams;
  const message = params?.message ? `&message=${encodeURIComponent(params.message)}` : "";
  redirect(`/dashboard?panel=company${message}`);
}
