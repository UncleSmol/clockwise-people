import "server-only";

import { cache } from "react";
import { getActiveCompany, requireUser } from "@/lib/foundation/queries";
import type { AppUpdate } from "./schema";

export const getUnseenAppUpdates = cache(async function getUnseenAppUpdates(): Promise<AppUpdate[]> {
  const [{ company }, { supabase }] = await Promise.all([
    getActiveCompany(),
    requireUser(),
  ]);

  const { data, error } = await supabase.rpc("get_unseen_app_updates", {
    target_company_id: company.id,
  });

  if (error) {
    if (
      error.code === "PGRST202" ||
      error.message.includes("get_unseen_app_updates")
    ) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as AppUpdate[];
});
