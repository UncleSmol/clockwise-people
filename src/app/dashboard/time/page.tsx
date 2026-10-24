import { redirect } from "next/navigation";

export default async function TimePage({
  searchParams,
}: {
  searchParams?: Promise<{ time_entry_id?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const timeEntryId = params?.time_entry_id;
  const mode = params?.mode;

  if (timeEntryId) {
    redirect(
      `/dashboard?tab=review&highlightEntryId=${encodeURIComponent(timeEntryId)}${
        mode ? `&mode=${encodeURIComponent(mode)}` : ""
      }`,
    );
  }

  redirect("/dashboard?tab=review");
}

