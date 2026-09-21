"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCompany, getCurrentUserAccess } from "@/lib/foundation/queries";
import {
  inspectSpreadsheet,
  normalizeDateValue,
  normalizeTimeValue,
  ENTITY_FIELD_DEFINITIONS,
  type ImportEntityType,
  type SpreadsheetInspectionResult,
} from "./universal-parser";
import { getOrGenerateNextPayrollId } from "@/lib/employees/payroll-id";

export type MappedRowStatus = "valid" | "warning" | "error";

export type MappedPreviewRow = {
  rowId: string;
  sourceRowNumber: number;
  status: MappedRowStatus;
  errors: string[];
  warnings: string[];
  // Raw mapped values from spreadsheet
  mappedData: Record<string, string>;
  // Resolved system values
  resolvedData: Record<string, unknown>;
  matchedEmployeeId?: string | null;
  matchedEmployeeName?: string | null;
  matchedWorkstationId?: string | null;
  matchedLeaveTypeId?: string | null;
};

export type ImportPreviewResult = {
  ok: boolean;
  message?: string;
  targetEntity: ImportEntityType;
  totalRows: number;
  validCount: number;
  warningCount: number;
  errorCount: number;
  unmatchedEmployees: string[];
  unmatchedWorkstations: string[];
  unmatchedLeaveTypes: string[];
  rows: MappedPreviewRow[];
};

export type ExecuteImportOptions = {
  skipExisting: boolean;
  autoCreateMissing: boolean; // Auto create missing workstations or leave types
};

export type ExecuteImportResult = {
  ok: boolean;
  message: string;
  totalProcessed?: number;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  createdLookups?: {
    workstations?: string[];
    leaveTypes?: string[];
  };
};

/**
 * Server action to inspect an uploaded spreadsheet and return sheet names, headers, sample rows, and suggested field mappings.
 */
export async function inspectSpreadsheetAction(
  formData: FormData,
  targetEntity: ImportEntityType,
  sheetName?: string
): Promise<SpreadsheetInspectionResult> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return {
        ok: false,
        message: "No file was uploaded.",
        sheetNames: [],
        selectedSheet: "",
        headers: [],
        sampleRows: [],
        suggestedMappings: {},
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return inspectSpreadsheet(buffer, targetEntity, sheetName);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to read uploaded spreadsheet.",
      sheetNames: [],
      selectedSheet: "",
      headers: [],
      sampleRows: [],
      suggestedMappings: {},
    };
  }
}

/**
 * Server action to parse all rows according to custom user column mapping and validate against Supabase database context.
 */
export async function previewMappedImportAction(
  formData: FormData,
  targetEntity: ImportEntityType,
  fieldMappings: Record<string, string>, // targetFieldKey -> headerName
  sheetName?: string
): Promise<ImportPreviewResult> {
  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return {
        ok: false,
        message: "No spreadsheet file uploaded.",
        targetEntity,
        totalRows: 0,
        validCount: 0,
        warningCount: 0,
        errorCount: 0,
        unmatchedEmployees: [],
        unmatchedWorkstations: [],
        unmatchedLeaveTypes: [],
        rows: [],
      };
    }

    const [{ company }, access, supabase] = await Promise.all([
      getActiveCompany(),
      getCurrentUserAccess(),
      createSupabaseServerClient(),
    ]);

    if (!access.canManageCompany && !access.canReviewBranchTime) {
      return {
        ok: false,
        message: "Unauthorized. Manager or Admin access required.",
        targetEntity,
        totalRows: 0,
        validCount: 0,
        warningCount: 0,
        errorCount: 0,
        unmatchedEmployees: [],
        unmatchedWorkstations: [],
        unmatchedLeaveTypes: [],
        rows: [],
      };
    }

    // Load active company lookup context
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

    const employees = empRes.data || [];
    const workstations = wsRes.data || [];
    const leaveTypes = ltRes.data || [];

    // Parse spreadsheet raw grid
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Reuse inspector to extract raw grid
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const targetSheetName = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
    const sheet = wb.Sheets[targetSheetName];

    if (!sheet) {
      return {
        ok: false,
        message: "Selected spreadsheet sheet is empty.",
        targetEntity,
        totalRows: 0,
        validCount: 0,
        warningCount: 0,
        errorCount: 0,
        unmatchedEmployees: [],
        unmatchedWorkstations: [],
        unmatchedLeaveTypes: [],
        rows: [],
      };
    }

    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rawRows || rawRows.length < 2) {
      return {
        ok: false,
        message: "Spreadsheet contains no data rows.",
        targetEntity,
        totalRows: 0,
        validCount: 0,
        warningCount: 0,
        errorCount: 0,
        unmatchedEmployees: [],
        unmatchedWorkstations: [],
        unmatchedLeaveTypes: [],
        rows: [],
      };
    }

    // Extract headers from first non-empty row
    let headerIdx = 0;
    while (headerIdx < rawRows.length && (!Array.isArray(rawRows[headerIdx]) || (rawRows[headerIdx] as unknown[]).every((c) => !c))) {
      headerIdx++;
    }

    const headers = (rawRows[headerIdx] as unknown[]).map((c, i) => (c ? String(c).trim() : `Column ${i + 1}`));

    // Process data rows
    const fieldDefs = ENTITY_FIELD_DEFINITIONS[targetEntity];
    const previewRows: MappedPreviewRow[] = [];
    const unmatchedEmpsSet = new Set<string>();
    const unmatchedWsSet = new Set<string>();
    const unmatchedLtSet = new Set<string>();

    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    for (let r = headerIdx + 1; r < rawRows.length; r++) {
      const rowCells = rawRows[r] as unknown[];
      if (!rowCells || rowCells.every((c) => !c || String(c).trim() === "")) {
        continue; // Skip blank rows
      }

      const rowObj: Record<string, string> = {};
      headers.forEach((h, i) => {
        rowObj[h] = rowCells[i] !== undefined && rowCells[i] !== null ? String(rowCells[i]).trim() : "";
      });

      const mappedData: Record<string, string> = {};
      const resolvedData: Record<string, unknown> = {};
      const errors: string[] = [];
      const warnings: string[] = [];

      // Extract values according to fieldMappings
      for (const field of fieldDefs) {
        const mappedHeader = fieldMappings[field.key];
        const val = mappedHeader ? rowObj[mappedHeader] ?? "" : "";
        mappedData[field.key] = val;

        // Check required fields
        if (field.required && !val) {
          errors.push(`Missing required field: ${field.label}`);
        }

        // Apply type normalizations
        if (val) {
          if (field.type === "date") {
            const normDate = normalizeDateValue(val);
            if (!normDate) {
              errors.push(`Invalid date format for ${field.label} ("${val}")`);
            } else {
              resolvedData[field.key] = normDate;
            }
          } else if (field.type === "time") {
            const normTime = normalizeTimeValue(val);
            if (!normTime) {
              warnings.push(`Could not parse time format for ${field.label} ("${val}")`);
            } else {
              resolvedData[field.key] = normTime;
            }
          } else if (field.type === "number") {
            const num = parseFloat(val.replace(/[^0-9.-]+/g, ""));
            if (isNaN(num)) {
              warnings.push(`Invalid number for ${field.label} ("${val}")`);
            } else {
              resolvedData[field.key] = num;
            }
          } else {
            resolvedData[field.key] = val;
          }
        }
      }

      // Entity-specific Database Lookups & Matching
      let matchedEmployeeId: string | null = null;
      let matchedEmployeeName: string | null = null;
      let matchedWorkstationId: string | null = null;
      let matchedLeaveTypeId: string | null = null;

      // 1. Employee Matching (for timesheets & leave balances)
      if (targetEntity === "timesheets" || targetEntity === "leave_balances") {
        const empIdentifier = mappedData["employee_identifier"]?.trim();
        if (empIdentifier) {
          const lowerId = empIdentifier.toLowerCase();
          const match = employees.find(
            (e) =>
              e.email?.toLowerCase() === lowerId ||
              e.employee_number?.toLowerCase() === lowerId ||
              e.full_name?.toLowerCase() === lowerId ||
              e.known_as?.toLowerCase() === lowerId
          );

          if (match) {
            matchedEmployeeId = match.id;
            matchedEmployeeName = match.full_name;
            resolvedData["matched_employee_id"] = match.id;
          } else {
            warnings.push(`Unmatched employee: "${empIdentifier}" (Will be skipped or needs provisioning)`);
            unmatchedEmpsSet.add(empIdentifier);
          }
        }
      }

      // 2. Workstation Matching (for employees & timesheets)
      const wsName = mappedData["workstation_name"]?.trim();
      if (wsName) {
        const lowerWs = wsName.toLowerCase();
        const matchWs = workstations.find((w) => w.name.toLowerCase() === lowerWs);
        if (matchWs) {
          matchedWorkstationId = matchWs.id;
          resolvedData["matched_workstation_id"] = matchWs.id;
        } else {
          warnings.push(`Workstation "${wsName}" does not exist in system (Will auto-create if enabled)`);
          unmatchedWsSet.add(wsName);
        }
      }

      // 3. Leave Type Matching & Multi-column Leave Balance Handling
      const MULTI_COL_LEAVE_MAP: Record<string, string> = {
        annual_leave_hours: "Annual Leave",
        sick_leave_hours: "Sick Leave",
        family_leave_hours: "Family Responsibility Leave",
        study_leave_hours: "Study Leave",
        maternity_leave_hours: "Maternity Leave",
        parental_leave_hours: "Parental Leave",
        toil_leave_hours: "TOIL / Overtime Comp Leave",
        unpaid_leave_hours: "Unpaid Leave",
      };

      const mappedMultiCols = Object.keys(MULTI_COL_LEAVE_MAP).filter(
        (k) => fieldMappings[k] && mappedData[k] !== undefined && mappedData[k] !== ""
      );

      if (targetEntity === "leave_balances" && mappedMultiCols.length > 0) {
        // Multi-column leave balance mode: create one plotted preview row per mapped leave column that has data
        for (const colKey of mappedMultiCols) {
          const ltName = MULTI_COL_LEAVE_MAP[colKey];
          const rawVal = mappedData[colKey];
          const balHours = parseFloat(String(rawVal).replace(/[^0-9.-]+/g, ""));
          if (isNaN(balHours)) continue;

          const rowErrors = [...errors];
          const rowWarnings = [...warnings];
          let colLtId: string | null = null;

          const matchLt = leaveTypes.find((l) => l.name.toLowerCase() === ltName.toLowerCase());
          if (matchLt) {
            colLtId = matchLt.id;
          } else {
            rowWarnings.push(`Leave type "${ltName}" does not exist in system (Will auto-create if enabled)`);
            unmatchedLtSet.add(ltName);
          }

          let rowStatus: MappedRowStatus = "valid";
          if (rowErrors.length > 0) {
            rowStatus = "error";
            errorCount++;
          } else if (rowWarnings.length > 0) {
            rowStatus = "warning";
            warningCount++;
          } else {
            validCount++;
          }

          previewRows.push({
            rowId: `row_${r}_${colKey}_${Date.now()}`,
            sourceRowNumber: r,
            status: rowStatus,
            errors: rowErrors,
            warnings: rowWarnings,
            mappedData: {
              ...mappedData,
              leave_type_name: ltName,
              balance_hours: String(balHours),
            },
            resolvedData: {
              ...resolvedData,
              matched_leave_type_id: colLtId,
              balance_hours: balHours,
              accrued_hours: balHours,
              taken_hours: 0,
            },
            matchedEmployeeId,
            matchedEmployeeName,
            matchedWorkstationId,
            matchedLeaveTypeId: colLtId,
          });
        }
      } else {
        // Standard single-column mode
        const ltName = mappedData["leave_type_name"]?.trim();
        if (ltName) {
          const lowerLt = ltName.toLowerCase();
          const matchLt = leaveTypes.find((l) => l.name.toLowerCase() === lowerLt);
          if (matchLt) {
            matchedLeaveTypeId = matchLt.id;
            resolvedData["matched_leave_type_id"] = matchLt.id;
          } else {
            warnings.push(`Leave type "${ltName}" does not exist in system (Will auto-create if enabled)`);
            unmatchedLtSet.add(ltName);
          }
        }

        let status: MappedRowStatus = "valid";
        if (errors.length > 0) {
          status = "error";
          errorCount++;
        } else if (warnings.length > 0) {
          status = "warning";
          warningCount++;
        } else {
          validCount++;
        }

        previewRows.push({
          rowId: `row_${r}_${Date.now()}`,
          sourceRowNumber: r,
          status,
          errors,
          warnings,
          mappedData,
          resolvedData,
          matchedEmployeeId,
          matchedEmployeeName,
          matchedWorkstationId,
          matchedLeaveTypeId,
        });
      }
    }

    return {
      ok: true,
      targetEntity,
      totalRows: previewRows.length,
      validCount,
      warningCount,
      errorCount,
      unmatchedEmployees: Array.from(unmatchedEmpsSet),
      unmatchedWorkstations: Array.from(unmatchedWsSet),
      unmatchedLeaveTypes: Array.from(unmatchedLtSet),
      rows: previewRows,
    };
  } catch (error) {
    console.error("Failed to preview mapped import:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "An unexpected error occurred during preview.",
      targetEntity,
      totalRows: 0,
      validCount: 0,
      warningCount: 0,
      errorCount: 0,
      unmatchedEmployees: [],
      unmatchedWorkstations: [],
      unmatchedLeaveTypes: [],
      rows: [],
    };
  }
}

/**
 * Helper to auto-create missing workstations for company.
 */
async function autoCreateWorkstations(
  supabase: ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never,
  companyId: string,
  workstationNames: string[]
): Promise<Map<string, string>> {
  const wsMap = new Map<string, string>();
  for (const wsName of workstationNames) {
    if (!wsName.trim()) continue;
    const { data: existing } = await supabase
      .from("company_workstations")
      .select("id")
      .eq("company_id", companyId)
      .ilike("name", wsName.trim())
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      wsMap.set(wsName.toLowerCase(), existing.id);
    } else {
      const { data: newWs } = await supabase
        .from("company_workstations")
        .insert({ company_id: companyId, name: wsName.trim(), is_active: true })
        .select("id")
        .single();
      if (newWs) {
        wsMap.set(wsName.toLowerCase(), newWs.id);
      }
    }
  }
  return wsMap;
}

/**
 * Helper to auto-create missing leave types for company.
 */
async function autoCreateLeaveTypes(
  supabase: ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never,
  companyId: string,
  leaveTypeNames: string[]
): Promise<Map<string, string>> {
  const ltMap = new Map<string, string>();
  for (const ltName of leaveTypeNames) {
    if (!ltName.trim()) continue;
    const { data: existing } = await supabase
      .from("leave_types")
      .select("id")
      .eq("company_id", companyId)
      .ilike("name", ltName.trim())
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      ltMap.set(ltName.toLowerCase(), existing.id);
    } else {
      const lower = ltName.toLowerCase();
      let category: "annual" | "sick" | "family_responsibility" | "maternity" | "unpaid" | "toil_taken" | "other" = "other";
      if (lower.includes("annual") || lower.includes("vacation")) category = "annual";
      else if (lower.includes("sick") || lower.includes("medical")) category = "sick";
      else if (lower.includes("family") || lower.includes("frl")) category = "family_responsibility";
      else if (lower.includes("unpaid")) category = "unpaid";

      const { data: newLt } = await supabase
        .from("leave_types")
        .insert({
          company_id: companyId,
          name: ltName.trim(),
          category,
          is_paid: category !== "unpaid",
          is_active: true,
        })
        .select("id")
        .single();
      if (newLt) {
        ltMap.set(ltName.toLowerCase(), newLt.id);
      }
    }
  }
  return ltMap;
}

/**
 * Server action to execute database bulk import for mapped rows.
 */
export async function executeMappedImportAction(
  targetEntity: ImportEntityType,
  rows: MappedPreviewRow[],
  options: ExecuteImportOptions
): Promise<ExecuteImportResult> {
  try {
    const [{ company }, access, supabase] = await Promise.all([
      getActiveCompany(),
      getCurrentUserAccess(),
      createSupabaseServerClient(),
    ]);

    if (!access.canManageCompany && !access.canReviewBranchTime) {
      return { ok: false, message: "Unauthorized. Admin or Manager access required." };
    }

    if (!rows || rows.length === 0) {
      return { ok: false, message: "No rows were provided for import." };
    }

    // Filter out error rows
    const validRows = rows.filter((r) => r.status !== "error");
    if (validRows.length === 0) {
      return { ok: false, message: "All rows contained critical validation errors. Fix errors before importing." };
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const createdWorkstationsList: string[] = [];
    const createdLeaveTypesList: string[] = [];

    // Auto-create missing lookups if requested
    let createdWsMap = new Map<string, string>();
    let createdLtMap = new Map<string, string>();

    if (options.autoCreateMissing) {
      const missingWs = Array.from(
        new Set(
          validRows
            .filter((row) => Boolean(row.mappedData["workstation_name"]?.trim()) && !row.matchedWorkstationId)
            .map((row) => row.mappedData["workstation_name"]!.trim())
        )
      );
      if (missingWs.length > 0) {
        createdWsMap = await autoCreateWorkstations(supabase, company.id, missingWs);
        createdWorkstationsList.push(...missingWs);
      }

      const missingLt = Array.from(
        new Set(
          validRows
            .filter((row) => Boolean(row.mappedData["leave_type_name"]?.trim()) && !row.matchedLeaveTypeId)
            .map((row) => row.mappedData["leave_type_name"]!.trim())
        )
      );
      if (missingLt.length > 0) {
        createdLtMap = await autoCreateLeaveTypes(supabase, company.id, missingLt);
        createdLeaveTypesList.push(...missingLt);
      }
    }

    // Execute entity-specific import
    if (targetEntity === "employees") {
      // Get default workstation if employee doesn't specify one
      const { data: defaultWs } = await supabase
        .from("company_workstations")
        .select("id")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      const fallbackWsId = defaultWs?.id;

      for (const row of validRows) {
        try {
          const fullName = row.mappedData["full_name"]?.trim();
          if (!fullName) {
            errorCount++;
            continue;
          }

          const email = row.mappedData["email"]?.trim() || null;
          const empNum = row.mappedData["employee_number"]?.trim() || null;
          const knownAs = row.mappedData["known_as"]?.trim() || null;
          const phone = row.mappedData["phone_number"]?.trim() || null;
          const jobTitle = row.mappedData["job_title"]?.trim() || null;
          const empType = row.mappedData["employment_type"]?.trim() || "full_time";
          const empStatus = row.mappedData["employment_status"]?.trim() || "active";
          const startDate = (row.resolvedData["start_date"] as string) || new Date().toISOString().split("T")[0];
          const hourlyRate = (row.resolvedData["hourly_rate"] as number) || null;
          const monthlySalary = (row.resolvedData["monthly_salary"] as number) || null;
          const payrollId = row.mappedData["payroll_identifier"]?.trim() || (await getOrGenerateNextPayrollId(company.id, supabase));

          const wsName = row.mappedData["workstation_name"]?.trim() || "";
          const wsId =
            row.matchedWorkstationId ||
            (wsName ? createdWsMap.get(wsName.toLowerCase()) : null) ||
            fallbackWsId;

          if (!wsId) {
            errorCount++;
            continue; // Employee must have a workstation
          }

          // Check existing employee by Email or Employee Number
          let existingEmpId: string | null = null;
          if (email) {
            const { data: foundByEmail } = await supabase
              .from("employees")
              .select("id")
              .eq("company_id", company.id)
              .eq("email", email)
              .is("deleted_at", null)
              .maybeSingle();
            if (foundByEmail) existingEmpId = foundByEmail.id;
          }

          if (!existingEmpId && empNum) {
            const { data: foundByNum } = await supabase
              .from("employees")
              .select("id")
              .eq("company_id", company.id)
              .eq("employee_number", empNum)
              .is("deleted_at", null)
              .maybeSingle();
            if (foundByNum) existingEmpId = foundByNum.id;
          }

          if (existingEmpId) {
            if (options.skipExisting) {
              skippedCount++;
              continue;
            }
            // Update existing employee
            await supabase
              .from("employees")
              .update({
                full_name: fullName,
                known_as: knownAs,
                phone_number: phone,
                workstation_id: wsId,
                job_title: jobTitle,
                employment_type: empType,
                employment_status: empStatus,
                start_date: startDate,
                hourly_rate: hourlyRate,
                monthly_salary: monthlySalary,
                payroll_identifier: payrollId,
                compensation_type: hourlyRate ? "hourly" : "monthly",
              })
              .eq("id", existingEmpId);
            updatedCount++;
          } else {
            // Get next employee number if not provided
            let nextNum = empNum;
            if (!nextNum) {
              const { data: rpcNum } = await supabase.rpc("next_company_employee_number", {
                target_company_id: company.id,
              });
              nextNum = String(rpcNum || Math.floor(1000 + Math.random() * 9000));
            }

            await supabase.from("employees").insert({
              company_id: company.id,
              employee_number: nextNum,
              full_name: fullName,
              known_as: knownAs,
              email: email,
              phone_number: phone,
              workstation_id: wsId,
              job_title: jobTitle,
              employment_type: empType,
              employment_status: empStatus,
              start_date: startDate,
              hourly_rate: hourlyRate,
              monthly_salary: monthlySalary,
              payroll_identifier: payrollId,
              compensation_type: hourlyRate ? "hourly" : "monthly",
            });
            insertedCount++;
          }
        } catch (err) {
          console.error("Failed to import employee row:", err);
          errorCount++;
        }
      }
      revalidatePath("/dashboard/employees");
    } else if (targetEntity === "timesheets") {
      // Group by matched employee
      for (const row of validRows) {
        try {
          const empId = row.matchedEmployeeId;
          const workDate = row.resolvedData["work_date"] as string;

          if (!empId || !workDate) {
            skippedCount++;
            continue;
          }

          // Check if employee has active timesheet container
          const { data: timesheets } = await supabase
            .from("timesheets")
            .select("id")
            .eq("company_id", company.id)
            .eq("employee_id", empId)
            .is("deleted_at", null)
            .limit(1);

          let timesheetId: string;
          if (timesheets && timesheets.length > 0) {
            timesheetId = timesheets[0].id;
          } else {
            const { data: newTs } = await supabase
              .from("timesheets")
              .insert({
                company_id: company.id,
                employee_id: empId,
                status: "approved",
                notes: "Imported via Universal Importer",
              })
              .select("id")
              .single();
            if (!newTs) {
              errorCount++;
              continue;
            }
            timesheetId = newTs.id;
          }

          // Check existing entry for date
          const { data: existingEntry } = await supabase
            .from("time_entries")
            .select("id")
            .eq("company_id", company.id)
            .eq("employee_id", empId)
            .eq("work_date", workDate)
            .is("deleted_at", null)
            .maybeSingle();

          if (existingEntry) {
            if (options.skipExisting) {
              skippedCount++;
              continue;
            }
            await supabase.from("time_entries").delete().eq("id", existingEntry.id);
          }

          const clockIn = (row.resolvedData["clock_in"] as string) || null;
          const clockOut = (row.resolvedData["clock_out"] as string) || null;
          const lunchStart = (row.resolvedData["lunch_start"] as string) || null;
          const lunchEnd = (row.resolvedData["lunch_end"] as string) || null;
          const notes = row.mappedData["notes"]?.trim() || null;
          const entryType = row.mappedData["entry_type"]?.trim() === "leave" ? "leave" : "work";

          await supabase.from("time_entries").insert({
            company_id: company.id,
            timesheet_id: timesheetId,
            employee_id: empId,
            work_date: workDate,
            entry_type: entryType,
            clock_in: clockIn,
            clock_out: clockOut,
            lunch_start: lunchStart,
            lunch_end: lunchEnd,
            notes: notes,
            status: "approved",
          });
          insertedCount++;
        } catch (err) {
          console.error("Failed to import timesheet row:", err);
          errorCount++;
        }
      }
      revalidatePath("/dashboard/timesheets");
      revalidatePath("/dashboard");
    } else if (targetEntity === "leave_balances") {
      const today = new Date().toISOString().split("T")[0];

      for (const row of validRows) {
        try {
          const empId = row.matchedEmployeeId;
          const ltName = row.mappedData["leave_type_name"]?.trim();
          const ltId = row.matchedLeaveTypeId || (ltName ? createdLtMap.get(ltName.toLowerCase()) : null);
          const balanceHours = (row.resolvedData["balance_hours"] as number) ?? 0;
          const accruedHours = (row.resolvedData["accrued_hours"] as number) ?? balanceHours;
          const takenHours = (row.resolvedData["taken_hours"] as number) ?? 0;

          if (!empId || !ltId) {
            skippedCount++;
            continue;
          }

          // Upsert leave_balances
          const { data: existingBal } = await supabase
            .from("leave_balances")
            .select("id")
            .eq("company_id", company.id)
            .eq("employee_id", empId)
            .eq("leave_type_id", ltId)
            .maybeSingle();

          if (existingBal) {
            if (options.skipExisting) {
              skippedCount++;
              continue;
            }
            await supabase
              .from("leave_balances")
              .update({
                accrued_hours: accruedHours,
                balance_hours: balanceHours,
                taken_hours: takenHours,
                as_of_date: today,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingBal.id);
            updatedCount++;
          } else {
            await supabase.from("leave_balances").insert({
              company_id: company.id,
              employee_id: empId,
              leave_type_id: ltId,
              accrued_hours: accruedHours,
              balance_hours: balanceHours,
              taken_hours: takenHours,
              adjusted_hours: 0,
              as_of_date: today,
            });
            insertedCount++;
          }
        } catch (err) {
          console.error("Failed to import leave balance row:", err);
          errorCount++;
        }
      }

      // Automatically update company accrual baseline date to today upon leave balance import
      if (insertedCount + updatedCount > 0) {
        const { data: currentSettings } = await supabase
          .from("company_settings")
          .select("leave_rules")
          .eq("company_id", company.id)
          .maybeSingle();

        const leaveRules = (currentSettings?.leave_rules ?? {}) as Record<string, unknown>;
        await supabase.from("company_settings").upsert(
          {
            company_id: company.id,
            leave_rules: {
              ...leaveRules,
              accrual_baseline_date: today,
              lock_imported_leave_baselines: true,
            },
          },
          { onConflict: "company_id" }
        );
      }

      revalidatePath("/dashboard");
      revalidatePath("/dashboard/leave");
      revalidatePath("/dashboard/employees");
      revalidatePath("/dashboard/timesheets");
      revalidatePath("/dashboard/company");
      revalidatePath("/dashboard/reports");
    }

    // Revalidate global dashboard routes after any import
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/employees");
    revalidatePath("/dashboard/timesheets");
    revalidatePath("/dashboard/leave");
    revalidatePath("/dashboard/company");
    revalidatePath("/dashboard/reports");

    return {
      ok: true,
      message: `Successfully completed import. ${insertedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped.`,
      totalProcessed: validRows.length,
      insertedCount,
      updatedCount,
      skippedCount,
      errorCount,
      createdLookups: {
        workstations: createdWorkstationsList,
        leaveTypes: createdLeaveTypesList,
      },
    };
  } catch (error) {
    console.error("Failed to execute mapped import:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to execute database import.",
    };
  }
}
