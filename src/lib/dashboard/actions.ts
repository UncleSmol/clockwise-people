"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NotificationActionState = {
  ok: boolean;
  message: string;
};

export async function markDashboardNotificationRead(
  _previousState: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const notificationId = String(formData.get("notification_id") ?? "").trim();
  const targetHref = String(formData.get("target_href") ?? "").trim();

  if (!notificationId) {
    return { ok: false, message: "Choose a notification." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_app_notification_read", {
    target_notification_id: notificationId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");

  if (targetHref.startsWith("/dashboard")) {
    redirect(targetHref);
  }

  return { ok: true, message: "Notification cleared." };
}
