"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCompany } from "@/lib/foundation/queries";
import {
  isValidCoordinate,
  parseCoordinates,
  parseLocationInput,
  parseMapUrl,
} from "./location-parser";

export type ActionState = {
  ok: boolean;
  message: string;
  workstationId?: string | null;
};

export type GeocodeSearchResult = {
  lat: string;
  lon: string;
  display_name: string;
  source?: "coordinate" | "map_url" | "nominatim" | "photon";
};

const USER_AGENT = "ClockWisePeople/1.0 (support@clockwisepeople.co.za)";

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
  const workstationId = optionalUuid(formData, "workstation_id");

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

  const [{ company }, supabase] = await Promise.all([
    getActiveCompany(),
    createSupabaseServerClient(),
  ]);

  const nowIso = new Date().toISOString();
  let savedId = workstationId;

  if (workstationId) {
    const { data: updated, error: updateError } = await supabase
      .from("company_workstations")
      .update({
        name,
        address: String(formData.get("address") ?? "").trim() || null,
        latitude,
        longitude,
        radius_meters: Math.round(radiusMeters),
        is_active: true,
        deleted_at: null,
        updated_at: nowIso,
      })
      .eq("id", workstationId)
      .eq("company_id", company.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      const { data: rpcId, error: rpcError } = await supabase.rpc("upsert_company_workstation", {
        target_workstation_id: workstationId,
        workstation_address: String(formData.get("address") ?? "").trim() || null,
        workstation_latitude: latitude,
        workstation_longitude: longitude,
        workstation_name: name,
        workstation_radius_meters: Math.round(radiusMeters),
        target_company_id: company.id,
      });

      if (rpcError) {
        if (isMissingGeolocationRpc(rpcError)) {
          return { ok: false, message: migrationMessage };
        }
        return { ok: false, message: rpcError.message };
      }
      savedId = (rpcId as string) || workstationId;
    } else {
      savedId = updated?.id ?? workstationId;
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("company_workstations")
      .insert({
        company_id: company.id,
        name,
        address: String(formData.get("address") ?? "").trim() || null,
        latitude,
        longitude,
        radius_meters: Math.round(radiusMeters),
        is_active: true,
      })
      .select("id")
      .single();

    if (insertError) {
      const { data: rpcId, error: rpcError } = await supabase.rpc("upsert_company_workstation", {
        target_workstation_id: null,
        workstation_address: String(formData.get("address") ?? "").trim() || null,
        workstation_latitude: latitude,
        workstation_longitude: longitude,
        workstation_name: name,
        workstation_radius_meters: Math.round(radiusMeters),
        target_company_id: company.id,
      });

      if (rpcError) {
        if (isMissingGeolocationRpc(rpcError)) {
          return { ok: false, message: migrationMessage };
        }
        return { ok: false, message: rpcError.message };
      }
      savedId = rpcId as string;
    } else {
      savedId = inserted.id;
    }
  }

  // Revalidate the dashboard and all pages showing workstations
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/time");

  return {
    ok: true,
    message: workstationId ? "Workstation updated." : "Workstation created.",
    workstationId: savedId,
  };
}

export async function deactivateCompanyWorkstation(formData: FormData) {
  const workstationId = optionalUuid(formData, "workstation_id");

  if (!workstationId) {
    return;
  }

  const [{ company }, supabase] = await Promise.all([
    getActiveCompany(),
    createSupabaseServerClient(),
  ]);

  const nowIso = new Date().toISOString();

  // 1. Direct update on company_workstations scoped to current active company
  const { error: updateError } = await supabase
    .from("company_workstations")
    .update({
      is_active: false,
      deleted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", workstationId)
    .eq("company_id", company.id);

  if (updateError) {
    // 2. Fallback to RPC if direct table update has policy issues
    const { error: rpcError } = await supabase.rpc("deactivate_company_workstation", {
      target_workstation_id: workstationId,
    });

    if (rpcError) {
      if (isMissingGeolocationRpc(rpcError)) {
        throw new Error(migrationMessage);
      }
      throw new Error(rpcError.message);
    }
  }

  // 3. Clear employee assignments linked to this workstation
  await supabase
    .from("employee_workstation_assignments")
    .update({
      is_active: false,
      deleted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("workstation_id", workstationId)
    .eq("company_id", company.id);

  // 4. Clear workstation_id foreign key on employees if any
  await supabase
    .from("employees")
    .update({ workstation_id: null })
    .eq("workstation_id", workstationId)
    .eq("company_id", company.id);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/time");
}

export async function assignEmployeeWorkstation(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const employeeId = optionalUuid(formData, "employee_id");
  const targetWorkstationId = optionalUuid(formData, "workstation_id");

  if (!employeeId) {
    return { ok: false, message: "Choose an employee." };
  }

  const [{ company }, supabase] = await Promise.all([
    getActiveCompany(),
    createSupabaseServerClient(),
  ]);

  const { error } = await supabase.rpc("assign_employee_workstation", {
    target_employee_id: employeeId,
    target_workstation_id: targetWorkstationId,
  });

  if (error) {
    if (isMissingGeolocationRpc(error)) {
      return { ok: false, message: migrationMessage };
    }

    return { ok: false, message: error.message };
  }

  // Keep employee table foreign key in sync
  await supabase
    .from("employees")
    .update({ workstation_id: targetWorkstationId })
    .eq("id", employeeId)
    .eq("company_id", company.id);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/company");
  revalidatePath("/dashboard/time");

  return { ok: true, message: "Employee workstation assignment saved." };
}

/**
 * Resolves a map URL (including shortened Google Maps links) on the server,
 * following redirects to extract coordinates.
 */
export async function resolveMapLocationUrl(
  urlInput: string,
): Promise<{
  ok: boolean;
  latitude?: number;
  longitude?: number;
  address?: string;
  message?: string;
}> {
  const input = String(urlInput ?? "").trim();
  if (!input) {
    return { ok: false, message: "Please provide a map URL or coordinates." };
  }

  // 1. Direct coordinate string check
  const coords = parseCoordinates(input);
  if (coords) {
    const rev = await reverseGeocodeLocation(coords.latitude, coords.longitude);
    return {
      ok: true,
      latitude: coords.latitude,
      longitude: coords.longitude,
      address: rev.address ?? undefined,
    };
  }

  // 2. Direct map URL parse
  const directParsed = parseMapUrl(input);
  if (directParsed && !directParsed.isShortLink && isValidCoordinate(directParsed.latitude, directParsed.longitude)) {
    const rev = await reverseGeocodeLocation(directParsed.latitude, directParsed.longitude);
    return {
      ok: true,
      latitude: directParsed.latitude,
      longitude: directParsed.longitude,
      address: rev.address ?? undefined,
    };
  }

  // 3. Short URL resolution (e.g. maps.app.goo.gl or goo.gl/maps)
  let targetUrl = input;
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const finalUrl = response.url || targetUrl;
    const resolvedParsed = parseMapUrl(finalUrl);

    if (resolvedParsed && isValidCoordinate(resolvedParsed.latitude, resolvedParsed.longitude)) {
      const rev = await reverseGeocodeLocation(resolvedParsed.latitude, resolvedParsed.longitude);
      return {
        ok: true,
        latitude: resolvedParsed.latitude,
        longitude: resolvedParsed.longitude,
        address: rev.address ?? undefined,
      };
    }

    // Sometimes the redirected HTML has meta tags or links with coordinates
    const html = await response.text();
    const metaMatch = html.match(/itemprop="location"[^>]*content="(-?\d+\.\d+);\s*(-?\d+\.\d+)"/i) ||
      html.match(/content="https:\/\/maps\.google\.com\/maps\/api\/staticmap\?[^"]*center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i) ||
      html.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

    if (metaMatch) {
      const lat = Number(metaMatch[1]);
      const lon = Number(metaMatch[2]);
      if (isValidCoordinate(lat, lon)) {
        const rev = await reverseGeocodeLocation(lat, lon);
        return {
          ok: true,
          latitude: Number(lat.toFixed(7)),
          longitude: Number(lon.toFixed(7)),
          address: rev.address ?? undefined,
        };
      }
    }

    return {
      ok: false,
      message: "Could not extract exact coordinates from this map URL. Please try copying coordinates or standard Google Maps URL.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to resolve map URL.",
    };
  }
}

/**
 * Multi-engine address & location search:
 * - Checks for coordinates or map URLs first.
 * - Queries OpenStreetMap Nominatim with proper User-Agent and SA country bias.
 * - Falls back to Komoot Photon API if Nominatim returns few/no results.
 */
export async function searchGeocodedLocations(
  query: string,
): Promise<{ ok: boolean; results: GeocodeSearchResult[]; message?: string }> {
  const trimmed = String(query ?? "").trim();
  if (!trimmed || trimmed.length < 2) {
    return { ok: true, results: [] };
  }

  // 1. If user typed/pasted coordinates
  const coords = parseCoordinates(trimmed);
  if (coords) {
    const rev = await reverseGeocodeLocation(coords.latitude, coords.longitude);
    return {
      ok: true,
      results: [
        {
          lat: String(coords.latitude),
          lon: String(coords.longitude),
          display_name: rev.address
            ? `${rev.address} (${coords.latitude}, ${coords.longitude})`
            : `Coordinates: ${coords.latitude}, ${coords.longitude}`,
          source: "coordinate",
        },
      ],
    };
  }

  // 2. If user pasted a map URL
  const inputType = parseLocationInput(trimmed);
  if (inputType.type === "map_url" && inputType.latitude !== undefined && inputType.longitude !== undefined) {
    const rev = await reverseGeocodeLocation(inputType.latitude, inputType.longitude);
    return {
      ok: true,
      results: [
        {
          lat: String(inputType.latitude),
          lon: String(inputType.longitude),
          display_name: rev.address
            ? `${rev.address} (${inputType.latitude}, ${inputType.longitude})`
            : `Map Location (${inputType.latitude}, ${inputType.longitude})`,
          source: "map_url",
        },
      ],
    };
  }

  if (inputType.type === "short_url") {
    const resolved = await resolveMapLocationUrl(trimmed);
    if (resolved.ok && resolved.latitude !== undefined && resolved.longitude !== undefined) {
      return {
        ok: true,
        results: [
          {
            lat: String(resolved.latitude),
            lon: String(resolved.longitude),
            display_name: resolved.address
              ? `${resolved.address} (${resolved.latitude}, ${resolved.longitude})`
              : `Map Short Link (${resolved.latitude}, ${resolved.longitude})`,
            source: "map_url",
          },
        ],
      };
    }
  }

  const results: GeocodeSearchResult[] = [];

  // 3. Primary: OpenStreetMap Nominatim
  try {
    // Attempt with South Africa priority first
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      trimmed,
    )}&limit=5&countrycodes=za&addressdetails=1`;

    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (res.ok) {
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          results.push({
            lat: item.lat,
            lon: item.lon,
            display_name: item.display_name,
            source: "nominatim",
          });
        }
      }
    }
  } catch (e) {
    console.warn("Nominatim search error:", e);
  }

  // 4. Secondary fallback: Photon (Komoot)
  // If Nominatim gave fewer than 2 results, search Photon (specialized in POIs, places, typo tolerance)
  if (results.length < 2) {
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
        trimmed,
      )}&limit=5&lat=-26.2041&lon=28.0473`;

      const photonRes = await fetch(photonUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (photonRes.ok) {
        const data = (await photonRes.json()) as {
          features?: Array<{
            geometry: { coordinates: [number, number] };
            properties: {
              name?: string;
              street?: string;
              housenumber?: string;
              city?: string;
              state?: string;
              country?: string;
            };
          }>;
        };

        if (Array.isArray(data.features)) {
          for (const feature of data.features) {
            const [lon, lat] = feature.geometry.coordinates;
            const p = feature.properties;
            const parts = [
              p.name,
              p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street,
              p.city,
              p.state,
              p.country,
            ].filter(Boolean);

            const displayName = parts.join(", ");
            // Avoid exact duplicates
            const isDuplicate = results.some(
              (r) =>
                Math.abs(Number(r.lat) - lat) < 0.0005 &&
                Math.abs(Number(r.lon) - lon) < 0.0005,
            );

            if (!isDuplicate && displayName) {
              results.push({
                lat: String(lat),
                lon: String(lon),
                display_name: displayName,
                source: "photon",
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn("Photon fallback search error:", e);
    }
  }

  return { ok: true, results };
}

/**
 * Reverse geocodes latitude & longitude into a human-readable street address.
 */
export async function reverseGeocodeLocation(
  latitude: number,
  longitude: number,
): Promise<{ ok: boolean; address?: string }> {
  if (!isValidCoordinate(latitude, longitude)) {
    return { ok: false };
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };

    if (data.display_name) {
      return { ok: true, address: data.display_name };
    }

    return { ok: false };
  } catch {
    return { ok: false };
  }
}
