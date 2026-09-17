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

export type MigrationPreviewResponse = {
  ok: boolean;
  message?: string;
  format?: DetectedSpreadsheetFormat;
  formatDescription?: string;
  entries?: NormalizedImportEntry[];
  diagnostics?: ImportDiagnostics;
};

export type ExecuteMigrationPayload = {
  entries: NormalizedImportEntry[];
  skipExisting: boolean;
  updateLeaveBalances: boolean;
  autoProvisionLeaveTypes: boolean;
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

    // Query company context: employees, workstations, leave types
    const [empRes, wsRes, ltRes] = await Promise.all([
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

    return {
      ok: true,
      format,
      formatDescription: diagnostics.formatDescription,
      entries,
      diagnostics,
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
    const { entries, skipExisting, updateLeaveBalances, autoProvisionLeaveTypes } =
      payload;

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

    // 2. Fetch or create timesheets per employee
    // Group entries by matchedEmployeeId
    const entriesByEmployee = new Map<string, NormalizedImportEntry[]>();
    for (const entry of entries) {
      if (!entry.matchedEmployeeId) continue;
      if (!entriesByEmployee.has(entry.matchedEmployeeId)) {
        entriesByEmployee.set(entry.matchedEmployeeId, []);
      }
      entriesByEmployee.get(entry.matchedEmployeeId)!.push(entry);
    }

    let totalImported = 0;
    let importedShifts = 0;
    let importedLeaves = 0;
    let skippedCount = 0;

    for (const [employeeId, empEntries] of entriesByEmployee.entries()) {
      // Find or create active draft or approved timesheet for this employee
      const { data: existingTimesheets } = await supabase
        .from("timesheets")
        .select("id, status")
        .eq("company_id", company.id)
        .eq("employee_id", employeeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      let timesheetId: string;
      if (existingTimesheets && existingTimesheets.length > 0) {
        timesheetId = existingTimesheets[0].id;
      } else {
        const { data: newTimesheet, error: tsErr } = await supabase
          .from("timesheets")
          .insert({
            company_id: company.id,
            employee_id: employeeId,
            status: "approved",
            notes: "Migrated from spreadsheet",
          })
          .select("id")
          .single();

        if (tsErr || !newTimesheet) {
          throw new Error(
            `Failed to create timesheet for employee: ${tsErr?.message}`,
          );
        }
        timesheetId = newTimesheet.id;
      }

      // Check existing time_entries dates for this employee
      const { data: existingTimeEntries } = await supabase
        .from("time_entries")
        .select("id, work_date")
        .eq("company_id", company.id)
        .eq("employee_id", employeeId)
        .is("deleted_at", null);

      const existingDatesMap = new Map<string, string>();
      (existingTimeEntries || []).forEach((e) => {
        existingDatesMap.set(e.work_date, e.id);
      });

      // Process each entry for this employee
      for (const entry of empEntries) {
        if (!entry.workDate) continue;

        const existingEntryId = existingDatesMap.get(entry.workDate);

        if (existingEntryId) {
          if (skipExisting) {
            skippedCount++;
            continue;
          }
          // Overwrite: delete existing entry for that date first
          await supabase
            .from("time_entries")
            .delete()
            .eq("id", existingEntryId);
        }

        if (entry.entryType === "work") {
          // Insert shift
          const { data: insertedShift, error: shiftErr } = await supabase
            .from("time_entries")
            .insert({
              company_id: company.id,
              timesheet_id: timesheetId,
              employee_id: employeeId,
              work_date: entry.workDate,
              workstation_id: entry.matchedWorkstationId || null,
              clock_in: entry.clockIn || null,
              lunch_start: entry.lunchStart || null,
              lunch_end: entry.lunchEnd || null,
              clock_out: entry.clockOut || null,
              status: entry.status || "approved",
              notes: entry.notes || null,
            })
            .select("id")
            .single();

          if (shiftErr || !insertedShift) {
            console.error("Error inserting shift entry:", shiftErr);
            continue;
          }

          // Trigger PostgreSQL stored procedure to calculate hours, lunch, and overtime
          if (entry.clockIn && entry.clockOut) {
            await supabase.rpc("refresh_time_entry_calculations", {
              target_time_entry_id: insertedShift.id,
            });
          }

          importedShifts++;
          totalImported++;
        } else if (entry.entryType === "leave") {
          // Insert leave entry
          const hours = entry.leaveHours || 8.0;
          const isPaid = entry.isPaidLeave ?? true;

          const { data: insertedLeave, error: leaveErr } = await supabase
            .from("time_entries")
            .insert({
              company_id: company.id,
              timesheet_id: timesheetId,
              employee_id: employeeId,
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
              notes:
                entry.notes ||
                `Leave: ${entry.leaveTypeName || "Approved Leave"}`,
            })
            .select("id")
            .single();

          if (leaveErr || !insertedLeave) {
            console.error("Error inserting leave entry:", leaveErr);
            continue;
          }

          // Reconcile leave balances if requested and leave_type is linked
          if (updateLeaveBalances && entry.matchedLeaveTypeId) {
            const { data: bal } = await supabase
              .from("leave_balances")
              .select("id, balance_hours, taken_hours")
              .eq("company_id", company.id)
              .eq("employee_id", employeeId)
              .eq("leave_type_id", entry.matchedLeaveTypeId)
              .maybeSingle();

            if (bal) {
              const currentTaken = Number(bal.taken_hours) || 0;
              const currentBal = Number(bal.balance_hours) || 0;
              await supabase
                .from("leave_balances")
                .update({
                  taken_hours: currentTaken + hours,
                  balance_hours: currentBal - hours,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", bal.id);
            } else {
              // Create balance row
              await supabase.from("leave_balances").insert({
                company_id: company.id,
                employee_id: employeeId,
                leave_type_id: entry.matchedLeaveTypeId,
                accrued_hours: 0,
                taken_hours: hours,
                balance_hours: -hours,
                as_of_date: entry.workDate,
              });
            }
          }

          importedLeaves++;
          totalImported++;
        }
      }
    }

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
