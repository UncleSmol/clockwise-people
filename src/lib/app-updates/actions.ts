"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/foundation/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MarkUpdatesSeenState = {
  ok: boolean;
  message: string;
};

export async function markAppUpdatesSeen(
  _previousState: MarkUpdatesSeenState,
  formData: FormData,
): Promise<MarkUpdatesSeenState> {
  const updateIds = formData
    .getAll("update_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (updateIds.length === 0) {
    return { ok: true, message: "" };
  }

  const { company } = await getActiveCompany();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_app_updates_seen", {
    target_company_id: company.id,
    target_update_ids: updateIds,
  });

  if (error) {
    if (
      error.code === "PGRST202" ||
      error.message.includes("mark_app_updates_seen")
    ) {
      return { ok: true, message: "" };
    }

    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "" };
}
