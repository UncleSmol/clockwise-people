import { redirect } from "next/navigation";

export default async function LeavePage({
  searchParams,
}: {
  searchParams?: Promise<{ leave_request_id?: string }>;
}) {
  const params = await searchParams;
  const leaveRequestId = params?.leave_request_id;

  if (leaveRequestId) {
    redirect(`/dashboard?panel=leave&highlightLeaveId=${encodeURIComponent(leaveRequestId)}`);
  }

  redirect("/dashboard?panel=leave");
}

