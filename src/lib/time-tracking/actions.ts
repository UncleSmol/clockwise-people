"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClockEventType } from "./schema";

type ClockActionState = {
  ok: boolean;
  message: string;
};

export async function recordClockEvent(
  eventType: ClockEventType,
): Promise<ClockActionState> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("record_employee_time_event", {
    requested_event: eventType,
    device_metadata: {
      source: "dashboard",
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  return { ok: true, message: "Time record updated." };
}

export async function clockIn() {
  return recordClockEvent("clock_in");
}

export async function startLunch() {
  return recordClockEvent("lunch_start");
}

export async function endLunch() {
  return recordClockEvent("lunch_end");
}

export async function clockOut() {
  return recordClockEvent("clock_out");
}
