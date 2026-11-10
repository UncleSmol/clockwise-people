"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCompany, getCurrentUserAccess } from "@/lib/foundation/queries";
import {
  parseAndNormalizeUploadedTimesheet,
  type DetectedSpreadsheetFormat,
  type ImportDiagnostics,
  type NormalizedImportEntry,
} from "./timesheet-importer";

export type MigrationDuplicateSummary = {
  totalDuplicates: number;
  existingInDatabase: number;
  duplicatesInFile: number;
  affectedEmployees: string[];
};

export type MigrationPreviewResponse = {
  ok: boolean;
  message?: string;
  format?: DetectedSpreadsheetFormat;
  formatDescription?: string;
  entries?: NormalizedImportEntry[];
  diagnostics?: ImportDiagnostics;
  duplicateSummary?: MigrationDuplicateSummary;
};

export type ExecuteMigrationPayload = {
  entries: NormalizedImportEntry[];
  skipExisting: boolean;
  updateLeaveBalances: boolean;
  autoProvisionLeaveTypes: boolean;
  conflictResolution?: "overwrite" | "skip" | "stack";
};

export type ExecuteMigrationResponse = {
  ok: boolean;
  message: string;
  totalProcessed?: number;
  importedShifts?: number;
  importedLeaves?: number;
  skippedCount?: number;
  errorCount?: number;
};

/**
 * Server action to preview and validate an uploaded timesheet/leave spreadsheet.
 */
export async function previewTimesheetMigration(
  formData: FormData,
): Promise<MigrationPreviewResponse> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { ok: false, message: "No file was uploaded." };
    }

    const [{ company }, access, supabase] = await Promise.all([
      getActiveCompany(),
      getCurrentUserAccess(),
      createSupabaseServerClient(),
    ]);

    if (!access.canManageCompany && !access.canReviewBranchTime) {
      return {
        ok: false,
        message: "Unauthorized. Administrator or Manager access required.",
      };
    }

    // Query company context: employees, workstations, leave types, and existing time entries for duplicate detection
    const [empRes, wsRes, ltRes, existingEntriesRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, email, employee_number, full_name, known_as, workstation_id")
        .eq("company_id", company.id)
        .is("deleted_at", null),
      supabase
        .from("company_workstations")
        .select("id, name")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .is("deleted_at", null),
      supabase
        .from("leave_types")
        .select("id, name, category, is_paid")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .is("deleted_at", null),
      supabase
        .from("time_entries")
        .select("id, employee_id, work_date")
        .eq("company_id", company.id)
        .is("deleted_at", null),
    ]);

    if (empRes.error) throw new Error(empRes.error.message);
    if (wsRes.error) throw new Error(wsRes.error.message);
    if (ltRes.error) throw new Error(ltRes.error.message);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { format, entries, diagnostics } = parseAndNormalizeUploadedTimesheet(
      buffer,
      {
        employees: empRes.data || [],
        workstations: wsRes.data || [],
        leaveTypes: ltRes.data || [],
      },
    );

    // Duplicate detection against database and within uploaded file
    const dbTimesheetKeySet = new Set<string>();
    for (const te of existingEntriesRes.data || []) {
      if (te.employee_id && te.work_date) {
        dbTimesheetKeySet.add(`${te.employee_id}_${te.work_date}`);
      }
    }

    const seenFileKeys = new Set<string>();
    let existingInDbCount = 0;
    let fileDuplicateCount = 0;
    const affectedEmployeesSet = new Set<string>();

    for (const entry of entries) {
      if (entry.matchedEmployeeId && entry.workDate) {
        const key = `${entry.matchedEmployeeId}_${entry.workDate}`;
        const empLabel = entry.matchedEmployeeName || entry.employeeName || entry.employeeIdentifier;

        if (seenFileKeys.has(key)) {
          entry.isDuplicate = true;
          entry.duplicateType = "file";
          entry.duplicateDetails = `Multiple entries found in file for ${empLabel} on ${entry.workDate}`;
          fileDuplicateCount++;
          affectedEmployeesSet.add(empLabel);
          if (entry.validationStatus === "valid") {
            entry.validationStatus = "warning";
          }
          if (!entry.warningFlags) entry.warningFlags = [];
          entry.warningFlags.push("File duplicate");
        } else if (dbTimesheetKeySet.has(key)) {
          entry.isDuplicate = true;
          entry.duplicateType = "database";
          entry.duplicateDetails = `A timesheet entry already exists in database for ${empLabel} on ${entry.workDate}`;
          existingInDbCount++;
          affectedEmployeesSet.add(empLabel);
          if (entry.validationStatus === "valid") {
            entry.validationStatus = "warning";
          }
          if (!entry.warningFlags) entry.warningFlags = [];
          entry.warningFlags.push("Existing in DB");
        }
        seenFileKeys.add(key);
      }
    }

    const duplicateSummary: MigrationDuplicateSummary | undefined =
      existingInDbCount > 0 || fileDuplicateCount > 0
        ? {
            totalDuplicates: existingInDbCount + fileDuplicateCount,
            existingInDatabase: existingInDbCount,
            duplicatesInFile: fileDuplicateCount,
            affectedEmployees: Array.from(affectedEmployeesSet),
          }
        : undefined;

    return {
      ok: true,
      format,
      formatDescription: diagnostics.formatDescription,
      entries,
      diagnostics,
      duplicateSummary,
    };
  } catch (error) {
    console.error("Failed to preview timesheet migration:", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while parsing the spreadsheet.",
    };
  }
}

/**
 * Server action to execute the timesheet and leave migration into the database.
 */
export async function executeTimesheetMigration(
  payload: ExecuteMigrationPayload,
): Promise<ExecuteMigrationResponse> {
  try {
    const { entries, skipExisting, updateLeaveBalances, autoProvisionLeaveTypes, conflictResolution } =
      payload;
    const conflictStrategy: "overwrite" | "skip" | "stack" =
      conflictResolution || (skipExisting ? "skip" : "overwrite");

    if (!entries || entries.length === 0) {
      return { ok: false, message: "No entries provided for migration." };
    }

    const [{ company }, access, supabase] = await Promise.all([
      getActiveCompany(),
      getCurrentUserAccess(),
      createSupabaseServerClient(),
    ]);

    if (!access.canManageCompany && !access.canReviewBranchTime) {
      return {
        ok: false,
        message: "Unauthorized. Administrator or Manager access required.",
      };
    }

    // 1. If autoProvisionLeaveTypes is on, check for missing leave types
    const leaveTypesToCreate = new Set<string>();
    if (autoProvisionLeaveTypes) {
      for (const entry of entries) {
        if (
          entry.entryType === "leave" &&
          !entry.matchedLeaveTypeId &&
          entry.leaveTypeName
        ) {
          leaveTypesToCreate.add(entry.leaveTypeName.trim());
        }
      }

      if (leaveTypesToCreate.size > 0) {
        for (const ltName of leaveTypesToCreate) {
          const lower = ltName.toLowerCase();
          let category:
            | "annual"
            | "sick"
            | "family_responsibility"
            | "maternity"
            | "unpaid"
            | "toil_taken"
            | "other" = "other";

          if (lower.includes("annual") || lower.includes("vacation")) {
            category = "annual";
          } else if (lower.includes("sick") || lower.includes("medical")) {
            category = "sick";
          } else if (lower.includes("family") || lower.includes("frl")) {
            category = "family_responsibility";
          } else if (lower.includes("unpaid")) {
            category = "unpaid";
          }

          const { data: newLt, error: ltErr } = await supabase
            .from("leave_types")
            .insert({
              company_id: company.id,
              name: ltName,
              category,
              is_paid: category !== "unpaid",
              is_active: true,
            })
            .select("id, name, is_paid")
            .single();

          if (!ltErr && newLt) {
            // Update matchedLeaveTypeId on entries
            for (const entry of entries) {
              if (
                entry.entryType === "leave" &&
                entry.leaveTypeName?.trim().toLowerCase() ===
                  ltName.toLowerCase()
              ) {
                entry.matchedLeaveTypeId = newLt.id;
                entry.isPaidLeave = newLt.is_paid;
              }
            }
          }
        }
      }
    }

    // 2. Fetch or create timesheets in batch per employee
    const uniqueEmpIds = Array.from(
      new Set(entries.map((e) => e.matchedEmployeeId).filter(Boolean) as string[])
    );

    if (uniqueEmpIds.length === 0) {
      return {
        ok: false,
        message: "No entries with matched employees found to import.",
      };
    }

    // Query standard daily hours for overtime calculations
    const { data: compSettings } = await supabase
      .from("company_settings")
      .select("standard_daily_hours")
      .eq("company_id", company.id)
      .maybeSingle();
    const standardDailyHours = Number(compSettings?.standard_daily_hours) || 8;

    const { data: existingTimesheets } = await supabase
      .from("timesheets")
      .select("id, employee_id")
      .eq("company_id", company.id)
      .in("employee_id", uniqueEmpIds)
      .is("deleted_at", null);

    const timesheetMap = new Map<string, string>();
    (existingTimesheets || []).forEach((t) => {
      timesheetMap.set(t.employee_id, t.id);
    });

    const missingEmpIds = uniqueEmpIds.filter((id) => !timesheetMap.has(id));
    if (missingEmpIds.length > 0) {
      const { data: newTimesheets, error: tsErr } = await supabase
        .from("timesheets")
        .insert(
          missingEmpIds.map((id) => ({
            company_id: company.id,
            employee_id: id,
            status: "approved",
            notes: "Migrated from spreadsheet",
          }))
        )
        .select("id, employee_id");

      if (tsErr) {
        console.error("Batch timesheets creation error:", tsErr);
      }
      (newTimesheets || []).forEach((t) => timesheetMap.set(t.employee_id, t.id));
    }

    // Pre-fetch all existing entries for duplicate / overwrite detection in 1 query
    const { data: existingTimeEntries } = await supabase
      .from("time_entries")
      .select("id, employee_id, work_date")
      .eq("company_id", company.id)
      .in("employee_id", uniqueEmpIds)
      .is("deleted_at", null);

    const existingDatesMap = new Map<string, string>();
    (existingTimeEntries || []).forEach((e) => {
      existingDatesMap.set(`${e.employee_id}_${e.work_date}`, e.id);
    });

    const deleteIds: string[] = [];
    const insertPayloads: Array<Record<string, unknown>> = [];
    let skippedCount = 0;
    let importedShifts = 0;
    let importedLeaves = 0;

    for (const entry of entries) {
      if (!entry.matchedEmployeeId || !entry.workDate) continue;
      const key = `${entry.matchedEmployeeId}_${entry.workDate}`;
      const existingEntryId = existingDatesMap.get(key);

      if (existingEntryId) {
        if (conflictStrategy === "skip") {
          skippedCount++;
          continue;
        } else if (conflictStrategy === "overwrite") {
          deleteIds.push(existingEntryId);
        }
      }

      const timesheetId = timesheetMap.get(entry.matchedEmployeeId);
      if (!timesheetId) continue;

      if (entry.entryType === "work") {
        let gross = 0;
        let lunch = 0;
        if (entry.clockIn && entry.clockOut) {
          const [inH, inM] = entry.clockIn.split(":").map(Number);
          const [outH, outM] = entry.clockOut.split(":").map(Number);
          let startMin = inH * 60 + (inM || 0);
          let endMin = outH * 60 + (outM || 0);
          if (endMin < startMin) endMin += 24 * 60;
          gross = Math.max(0, (endMin - startMin) / 60);
        }
        if (entry.lunchStart && entry.lunchEnd) {
          const [lsH, lsM] = entry.lunchStart.split(":").map(Number);
          const [leH, leM] = entry.lunchEnd.split(":").map(Number);
          let lStart = lsH * 60 + (lsM || 0);
          let lEnd = leH * 60 + (leM || 0);
          if (lEnd < lStart) lEnd += 24 * 60;
          lunch = Math.max(0, (lEnd - lStart) / 60);
        }
        const paid = Math.max(0, gross - lunch);
        const normal = Math.min(paid, standardDailyHours);
        const overtime = Math.max(0, paid - standardDailyHours);

        insertPayloads.push({
          company_id: company.id,
          timesheet_id: timesheetId,
          employee_id: entry.matchedEmployeeId,
          work_date: entry.workDate,
          workstation_id: entry.matchedWorkstationId || null,
          clock_in: entry.clockIn || null,
          lunch_start: entry.lunchStart || null,
          lunch_end: entry.lunchEnd || null,
          clock_out: entry.clockOut || null,
          gross_hours: Math.round(gross * 100) / 100,
          lunch_hours: Math.round(lunch * 100) / 100,
          paid_hours: Math.round(paid * 100) / 100,
          normal_hours: Math.round(normal * 100) / 100,
          overtime_hours: Math.round(overtime * 100) / 100,
          missing_clocking:
            !entry.clockIn || !entry.clockOut || Boolean(entry.lunchStart && !entry.lunchEnd),
          status: entry.status || "approved",
          notes: entry.notes || null,
        });
        importedShifts++;
      } else if (entry.entryType === "leave") {
        const hours = entry.leaveHours || 8.0;
        const isPaid = entry.isPaidLeave ?? true;

        insertPayloads.push({
          company_id: company.id,
          timesheet_id: timesheetId,
          employee_id: entry.matchedEmployeeId,
          work_date: entry.workDate,
          workstation_id: entry.matchedWorkstationId || null,
          clock_in: null,
          lunch_start: null,
          lunch_end: null,
          clock_out: null,
          gross_hours: hours,
          lunch_hours: 0,
          paid_hours: isPaid ? hours : 0,
          normal_hours: isPaid ? hours : 0,
          overtime_hours: 0,
          missing_clocking: false,
          late_arrival: false,
          early_departure: false,
          leave_type_id: entry.matchedLeaveTypeId || null,
          status: "approved",
          notes: entry.notes || `Leave: ${entry.leaveTypeName || "Approved Leave"}`,
        });
        importedLeaves++;
      }
    }

    // Delete overwritten entries in chunks of 200
    for (let i = 0; i < deleteIds.length; i += 200) {
      const chunk = deleteIds.slice(i, i + 200);
      await supabase.from("time_entries").delete().in("id", chunk);
    }

    // Batch insert all records in chunks of 200
    for (let i = 0; i < insertPayloads.length; i += 200) {
      const chunk = insertPayloads.slice(i, i + 200);
      const { error: insErr } = await supabase.from("time_entries").insert(chunk);
      if (insErr) {
        console.error("Batch time_entries insert error:", insErr);
      }
    }

    // Aggregate and reconcile leave balances if requested
    if (updateLeaveBalances) {
      const leaveHoursByEmpAndType = new Map<
        string,
        { employeeId: string; leaveTypeId: string; totalHours: number; latestDate: string }
      >();

      for (const entry of entries) {
        if (entry.entryType === "leave" && entry.matchedEmployeeId && entry.matchedLeaveTypeId) {
          const key = `${entry.matchedEmployeeId}__${entry.matchedLeaveTypeId}`;
          const current = leaveHoursByEmpAndType.get(key) || {
            employeeId: entry.matchedEmployeeId,
            leaveTypeId: entry.matchedLeaveTypeId,
            totalHours: 0,
            latestDate: entry.workDate,
          };
          current.totalHours += entry.leaveHours || 8.0;
          if (entry.workDate > current.latestDate) current.latestDate = entry.workDate;
          leaveHoursByEmpAndType.set(key, current);
        }
      }

      if (leaveHoursByEmpAndType.size > 0) {
        const empIds = Array.from(
          new Set(Array.from(leaveHoursByEmpAndType.values()).map((x) => x.employeeId))
        );
        const { data: existingBals } = await supabase
          .from("leave_balances")
          .select("id, employee_id, leave_type_id, balance_hours, taken_hours")
          .eq("company_id", company.id)
          .in("employee_id", empIds);

        const balMap = new Map<string, { id: string; balance_hours: number; taken_hours: number }>();
        (existingBals || []).forEach((b) =>
          balMap.set(`${b.employee_id}__${b.leave_type_id}`, {
            id: b.id,
            balance_hours: Number(b.balance_hours) || 0,
            taken_hours: Number(b.taken_hours) || 0,
          })
        );

        for (const item of leaveHoursByEmpAndType.values()) {
          const key = `${item.employeeId}__${item.leaveTypeId}`;
          const existingBal = balMap.get(key);
          if (existingBal) {
            await supabase
              .from("leave_balances")
              .update({
                taken_hours: existingBal.taken_hours + item.totalHours,
                balance_hours: existingBal.balance_hours - item.totalHours,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingBal.id);
          } else {
            await supabase.from("leave_balances").insert({
              company_id: company.id,
              employee_id: item.employeeId,
              leave_type_id: item.leaveTypeId,
              accrued_hours: 0,
              taken_hours: item.totalHours,
              balance_hours: -item.totalHours,
              as_of_date: item.latestDate,
            });
          }
        }
      }
    }

    const totalImported = importedShifts + importedLeaves;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/company");
    revalidatePath("/dashboard/reports");

    return {
      ok: true,
      message: `Successfully migrated ${totalImported} records (${importedShifts} work shifts, ${importedLeaves} leave days). ${skippedCount > 0 ? `${skippedCount} duplicate dates skipped.` : ""}`,
      totalProcessed: totalImported + skippedCount,
      importedShifts,
      importedLeaves,
      skippedCount,
    };
  } catch (error) {
    console.error("Failed to execute timesheet migration:", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during timesheet migration execution.",
    };
  }
}
