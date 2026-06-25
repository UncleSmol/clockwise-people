"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionState = {
  ok: boolean;
  message: string;
};

function optionalUuid(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function numberValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? Number(value) : NaN;
}

function isMissingGeolocationRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.message?.includes("upsert_company_workstation") ||
    error.message?.includes("deactivate_company_workstation") ||
    error.message?.includes("assign_employee_workstation") ||
    error.message?.includes("schema cache")
  );
}

const migrationMessage =
  "Geolocation database migration is not active yet. Apply the Supabase production migrations, then retry.";

export async function saveCompanyWorkstation(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const latitude = numberValue(formData, "latitude");
  const longitude = numberValue(formData, "longitude");
  const radiusMeters = numberValue(formData, "radius_meters");

  if (!name) {
    return { ok: false, message: "Workstation name is required." };
  }

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { ok: false, message: "Use a valid latitude between -90 and 90." };
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { ok: false, message: "Use a valid longitude between -180 and 180." };
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters < 25 || radiusMeters > 5000) {
    return { ok: false, message: "Radius must be between 25m and 5000m." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("upsert_company_workstation", {
    target_workstation_id: optionalUuid(formData, "workstation_id"),
    workstation_address: String(formData.get("address") ?? "").trim() || null,
    workstation_branch_id: optionalUuid(formData, "branch_id"),
    workstation_latitude: latitude,
    workstation_longitude: longitude,
    workstation_name: name,
    workstation_radius_meters: Math.round(radiusMeters),
  });

  if (error) {
    if (isMissingGeolocationRpc(error)) {
      return { ok: false, message: migrationMessage };
    }

    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  return { ok: true, message: "Workstation saved." };
}

export async function deactivateCompanyWorkstation(formData: FormData) {
  const workstationId = optionalUuid(formData, "workstation_id");

  if (!workstationId) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("deactivate_company_workstation", {
    target_workstation_id: workstationId,
  });

  if (error) {
    if (isMissingGeolocationRpc(error)) {
      throw new Error(migrationMessage);
    }

    throw new Error(error.message);
  }

  revalidatePath("/dashboard/company");
}

export async function assignEmployeeWorkstation(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const employeeId = optionalUuid(formData, "employee_id");

  if (!employeeId) {
    return { ok: false, message: "Choose an employee." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("assign_employee_workstation", {
    target_employee_id: employeeId,
    target_workstation_id: optionalUuid(formData, "workstation_id"),
  });

  if (error) {
    if (isMissingGeolocationRpc(error)) {
      return { ok: false, message: migrationMessage };
    }

    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard/company");
  return { ok: true, message: "Employee workstation assignment saved." };
}
