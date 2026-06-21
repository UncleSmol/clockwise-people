import "server-only";

import { requireUser } from "@/lib/foundation/queries";
import type { EmployeeInvitation } from "./schema";

export async function getEmployeeInvitation(employeeId: string, companyId: string) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("user_invitations")
    .select(
      "id, company_id, employee_id, email, role_key, status, invited_at, accepted_at, cancelled_at, expires_at",
    )
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as EmployeeInvitation | null;
}
