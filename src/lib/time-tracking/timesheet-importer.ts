import * as XLSX from "xlsx";

export type DetectedSpreadsheetFormat =
  | "clockwise_standard"
  | "quickbooks_time"
  | "unknown";

export type NormalizedImportEntry = {
  rowId: string;
  sourceRowNumber: number;
  entryType: "work" | "leave";
  employeeIdentifier: string; // email, number, or username
  employeeName?: string;
  matchedEmployeeId?: string;
  matchedEmployeeName?: string;
  workDate: string; // YYYY-MM-DD
  // Work shift fields
  clockIn?: string | null; // HH:mm:ss or HH:mm
  lunchStart?: string | null;
  lunchEnd?: string | null;
  clockOut?: string | null;
  workstationName?: string | null;
  matchedWorkstationId?: string | null;
  // Leave fields
  leaveTypeName?: string | null;
  leaveCategory?: string | null;
  matchedLeaveTypeId?: string | null;
  leaveHours?: number;
  isPaidLeave?: boolean;
  // Metadata
  status: "approved" | "submitted" | "draft";
  notes?: string | null;
  warningFlags?: string[];
  validationStatus: "valid" | "warning" | "error";
  validationErrors?: string[];
  rawIntervalCount?: number;
};

export type ImportDiagnostics = {
  format: DetectedSpreadsheetFormat;
  formatDescription: string;
  totalRowsRead: number;
  distinctDatesCount: number;
  workShiftsCount: number;
  leaveDaysCount: number;
  matchedEmployeesCount: number;
  unmatchedEmployees: string[];
  matchedWorkstationsCount: number;
  unmatchedWorkstations: string[];
  matchedLeaveTypesCount: number;
  unmatchedLeaveTypes: string[];
  validEntriesCount: number;
  warningEntriesCount: number;
  errorEntriesCount: number;
};

export type CompanyEmployeeRef = {
  id: string;
  email: string;
  employee_number: string | null;
  full_name: string;
  known_as?: string | null;
  workstation_id?: string | null;
};

export type CompanyWorkstationRef = {
  id: string;
  name: string;
};

export type CompanyLeaveTypeRef = {
  id: string;
  name: string;
  category: string;
  is_paid: boolean;
};

/**
 * Parses a standard CSV line respecting double quotes.
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Reads workbook buffer and returns an array of header/row string arrays.
 * Seamlessly handles single-column CSV strings stored in Excel sheets,
 * multi-column Excel sheets, and raw CSV files.
 */
export function extractRawGridFromBuffer(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): { headers: string[]; rows: Record<string, string>[] } {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames.includes("Timesheets")
    ? "Timesheets"
    : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  if (!sheet) {
    return { headers: [], rows: [] };
  }

  // Get raw 2D array of rows
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  if (!rawRows || rawRows.length === 0) {
    return { headers: [], rows: [] };
  }

  // Check if first row is a single cell containing CSV text
  const firstRow = rawRows[0];
  if (
    Array.isArray(firstRow) &&
    firstRow.length === 1 &&
    typeof firstRow[0] === "string" &&
    firstRow[0].includes(",")
  ) {
    const headers = parseCsvLine(firstRow[0]);
    const parsedRows: Record<string, string>[] = [];

    for (let r = 1; r < rawRows.length; r++) {
      const lineCell = rawRows[r][0];
      if (!lineCell) continue;
      const lineStr = String(lineCell).trim();
      if (!lineStr) continue;

      const cols = parseCsvLine(lineStr);
      const rowObj: Record<string, string> = {};
      headers.forEach((h, i) => {
        rowObj[h] = cols[i] ?? "";
      });
      parsedRows.push(rowObj);
    }

    return { headers, rows: parsedRows };
  }

  // Multi-column standard sheet
  const headers = (rawRows[0] || []).map((h) =>
    String(h || "").trim().toLowerCase(),
  );
  const parsedRows: Record<string, string>[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;
    // Check if entire row is empty
    const hasValue = row.some(
      (c) => c !== undefined && c !== null && String(c).trim() !== "",
    );
    if (!hasValue) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, i) => {
      rowObj[h] = String(row[i] ?? "").trim();
    });
    parsedRows.push(rowObj);
  }

  return { headers, rows: parsedRows };
}

/**
 * Detects whether the uploaded file is a ClockWise Standard template
 * or a QuickBooks Time / TSheets export.
 */
export function detectSpreadsheetFormat(
  headers: string[],
): DetectedSpreadsheetFormat {
  const norm = headers.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9_]/g, "_").trim(),
  );

  if (
    norm.some((h) => h.includes("jobcode")) &&
    (norm.some((h) => h.includes("local_start_time") || h.includes("local_date")) ||
      norm.some((h) => h.includes("username")))
  ) {
    return "quickbooks_time";
  }

  if (
    norm.some((h) => h.includes("employee_email") || h.includes("work_date")) &&
    (norm.some((h) => h.includes("clock_in")) || norm.some((h) => h.includes("leave_type")))
  ) {
    return "clockwise_standard";
  }

  // Fallback checks
  if (norm.includes("work_date") || norm.includes("date")) {
    return "clockwise_standard";
  }

  return "unknown";
}

/**
 * Formats a raw time string (e.g. "07:56", "7:56:00", "2026-03-24 07:56:00") into "HH:mm:ss".
 */
export function normalizeTimeString(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  // If full ISO or datetime like "2026-03-24 07:56:00"
  if (trimmed.includes(" ")) {
    const timePart = trimmed.split(" ")[1];
    return normalizeTimeString(timePart);
  }

  // Time like "07:56" or "07:56:00"
  const parts = trimmed.split(":");
  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, "0");
    const mm = parts[1].padStart(2, "0");
    const ss = (parts[2] || "00").padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  return trimmed;
}

/**
 * Formats a date string (e.g. "2026-03-24", "24/03/2026", "3/24/26") into "YYYY-MM-DD".
 */
export function normalizeDateString(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, "-");
  }

  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try Date parse
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return trimmed;
}

/**
 * Stitches multi-row QuickBooks Time (TSheets) intervals into unified daily records,
 * segregating work shifts from full-day leave days.
 */
export function processQuickBooksTimeRows(
  rows: Record<string, string>[],
): NormalizedImportEntry[] {
  // Group rows by employee identifier + local_date
  const grouped = new Map<string, Record<string, string>[]>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const username = (r.username || r.user || r.email || "").trim();
    const date = normalizeDateString(r.local_date || r.date || "");
    if (!username && !date) continue;

    const groupKey = `${username}___${date || `row_${i}`}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)!.push({ ...r, _origRowIndex: String(i + 2) });
  }

  const results: NormalizedImportEntry[] = [];

  for (const [key, dateRows] of grouped.entries()) {
    const [username, date] = key.split("___");
    const firstRow = dateRows[0];
    const employeeName =
      firstRow.fname && firstRow.lname
        ? `${firstRow.fname} ${firstRow.lname}`.trim()
        : firstRow.name || undefined;

    // Check if any row is a leave/holiday entry
    const leaveRow = dateRows.find((r) => {
      const jc = (r.jobcode || "").toLowerCase();
      return (
        jc === "annual" ||
        jc === "sick" ||
        jc === "holiday" ||
        jc.includes("leave") ||
        jc.includes("day off") ||
        jc.includes("vacation")
      );
    });

    if (leaveRow) {
      // Treat as Leave Entry
      const rawJobcode = leaveRow.jobcode.trim();
      const lower = rawJobcode.toLowerCase();
      let leaveTypeName = rawJobcode;
      let category = "other";

      if (lower === "annual" || lower.includes("annual") || lower.includes("vacation")) {
        leaveTypeName = "Annual Leave";
        category = "annual";
      } else if (lower === "sick" || lower.includes("sick") || lower.includes("medical")) {
        leaveTypeName = "Sick Leave";
        category = "sick";
      } else if (lower === "holiday" || lower.includes("holiday")) {
        leaveTypeName = "Public Holiday";
        category = "other";
      } else if (lower.includes("day off")) {
        leaveTypeName = "Approved Day Off";
        category = "other";
      } else if (lower.includes("family") || lower.includes("frl")) {
        leaveTypeName = "Family Responsibility Leave";
        category = "family_responsibility";
      }

      // Parse hours: e.g. "8:00" or "8"
      let leaveHours = 8.0;
      if (leaveRow.hours) {
        if (leaveRow.hours.includes(":")) {
          const [h, m] = leaveRow.hours.split(":");
          leaveHours = Number(h || 0) + Number(m || 0) / 60;
        } else {
          leaveHours = Number(leaveRow.hours) || 8.0;
        }
      }

      const notesParts: string[] = [];
      if (leaveRow.notes) notesParts.push(leaveRow.notes);
      if (lower === "holiday" && !leaveRow.notes) notesParts.push("Statutory Public Holiday");

      results.push({
        rowId: `qb_${key}`,
        sourceRowNumber: Number(firstRow._origRowIndex) || 2,
        entryType: "leave",
        employeeIdentifier: username,
        employeeName,
        workDate: date,
        leaveTypeName,
        leaveCategory: category,
        leaveHours: Math.round(leaveHours * 100) / 100,
        isPaidLeave: true,
        status: "approved",
        notes: notesParts.length > 0 ? `Leave: ${leaveTypeName} - ${notesParts.join(" | ")}` : `Leave: ${leaveTypeName}`,
        validationStatus: "valid",
        validationErrors: [],
        rawIntervalCount: dateRows.length,
      });
      continue;
    }

    // Regular work shift: filter intervals
    const workIntervals = dateRows.filter(
      (r) =>
        (r.jobcode || "").toLowerCase() !== "lunch break" &&
        Boolean(r.local_start_time || r.start_time),
    );
    const lunchIntervals = dateRows.filter(
      (r) => (r.jobcode || "").toLowerCase() === "lunch break",
    );

    if (workIntervals.length === 0 && lunchIntervals.length === 0) {
      continue;
    }

    // Sort work intervals by local_start_time
    workIntervals.sort((a, b) => {
      const sa = a.local_start_time || a.start_time || "";
      const sb = b.local_start_time || b.start_time || "";
      return sa.localeCompare(sb);
    });

    const earliestStartRaw =
      workIntervals[0]?.local_start_time || workIntervals[0]?.start_time;
    // Find latest end time across all work intervals
    let latestEndRaw: string | undefined = undefined;
    for (const wi of workIntervals) {
      const endCandidate = wi.local_end_time || wi.end_time;
      if (!endCandidate) continue;
      if (!latestEndRaw || endCandidate > latestEndRaw) {
        latestEndRaw = endCandidate;
      }
    }

    const clockIn = normalizeTimeString(earliestStartRaw);
    const clockOut = normalizeTimeString(latestEndRaw);
    const workstation = workIntervals[0]?.jobcode || firstRow.jobcode || null;

    // Resolve lunch break
    let lunchStart: string | null = null;
    let lunchEnd: string | null = null;

    if (lunchIntervals.length > 0) {
      // Pick longest lunch interval or first
      let longestDuration = -1;
      let pickedLunch = lunchIntervals[0];

      for (const li of lunchIntervals) {
        const s = li.local_start_time || li.start_time;
        const e = li.local_end_time || li.end_time;
        if (s && e) {
          const startMs = new Date(s).getTime();
          const endMs = new Date(e).getTime();
          const dur = endMs - startMs;
          if (dur > longestDuration) {
            longestDuration = dur;
            pickedLunch = li;
          }
        }
      }

      lunchStart = normalizeTimeString(
        pickedLunch.local_start_time || pickedLunch.start_time,
      );
      lunchEnd = normalizeTimeString(
        pickedLunch.local_end_time || pickedLunch.end_time,
      );
    }

    // Collect audit notes / flags
    const noteItems: string[] = [];
    for (const r of dateRows) {
      if (r.flag_types) noteItems.push(`Flag: ${r.flag_types}`);
      if (r.notes && !noteItems.includes(r.notes)) noteItems.push(r.notes);
      if (r.location && r.location !== "iPhone App" && r.location !== "Smart phone") {
        noteItems.push(`Device: ${r.location}`);
      }
    }

    results.push({
      rowId: `qb_${key}`,
      sourceRowNumber: Number(firstRow._origRowIndex) || 2,
      entryType: "work",
      employeeIdentifier: username,
      employeeName,
      workDate: date,
      clockIn,
      lunchStart,
      lunchEnd,
      clockOut,
      workstationName: workstation,
      status: "approved",
      notes: noteItems.length > 0 ? noteItems.join(" | ") : null,
      validationStatus: clockIn && clockOut ? "valid" : "warning",
      validationErrors: !clockIn || !clockOut ? ["Incomplete clocking intervals"] : [],
      rawIntervalCount: dateRows.length,
    });
  }

  // Sort chronological
  results.sort((a, b) => a.workDate.localeCompare(b.workDate));
  return results;
}

/**
 * Normalizes rows from ClockWise People standard template.
 */
export function processClockWiseStandardRows(
  rows: Record<string, string>[],
): NormalizedImportEntry[] {
  const results: NormalizedImportEntry[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sourceRowNumber = i + 2;
    const employeeIdentifier =
      r.employee_email || r.employee_number || r.email || r.username || "";
    const workDate = normalizeDateString(r.work_date || r.date);

    if (!employeeIdentifier && !workDate) continue;

    const rawType = (r.entry_type || "").toLowerCase().trim();
    const hasLeave = Boolean(r.leave_type && r.leave_type.trim() !== "");
    const isLeave = rawType === "leave" || (rawType !== "work" && hasLeave);

    if (isLeave) {
      const leaveTypeName = r.leave_type || "Annual Leave";
      const leaveHours = Number(r.leave_hours) || 8.0;
      results.push({
        rowId: `cw_${i}_${workDate}`,
        sourceRowNumber,
        entryType: "leave",
        employeeIdentifier,
        workDate: workDate || "",
        leaveTypeName,
        leaveHours,
        isPaidLeave: true,
        status: (r.status as "approved" | "submitted" | "draft") || "approved",
        notes: r.notes || `Leave: ${leaveTypeName}`,
        validationStatus: workDate && employeeIdentifier ? "valid" : "error",
        validationErrors: !workDate ? ["Missing work_date"] : [],
      });
    } else {
      const clockIn = normalizeTimeString(r.clock_in);
      const lunchStart = normalizeTimeString(r.lunch_start);
      const lunchEnd = normalizeTimeString(r.lunch_end);
      const clockOut = normalizeTimeString(r.clock_out);
      const workstationName = r.workstation || null;

      const errors: string[] = [];
      if (!workDate) errors.push("Missing work_date");
      if (!employeeIdentifier) errors.push("Missing employee email/number");
      if (!clockIn) errors.push("Missing clock_in");
      if (!clockOut) errors.push("Missing clock_out");

      results.push({
        rowId: `cw_${i}_${workDate}`,
        sourceRowNumber,
        entryType: "work",
        employeeIdentifier,
        workDate: workDate || "",
        clockIn,
        lunchStart,
        lunchEnd,
        clockOut,
        workstationName,
        status: (r.status as "approved" | "submitted" | "draft") || "approved",
        notes: r.notes || null,
        validationStatus: errors.length === 0 ? "valid" : "error",
        validationErrors: errors,
      });
    }
  }

  results.sort((a, b) => a.workDate.localeCompare(b.workDate));
  return results;
}

/**
 * Reconciles parsed entries against the active company database context:
 * matches employee IDs, workstation IDs, and leave_type IDs.
 */
export function reconcileEntriesWithCompany(
  entries: NormalizedImportEntry[],
  context: {
    employees: CompanyEmployeeRef[];
    workstations: CompanyWorkstationRef[];
    leaveTypes: CompanyLeaveTypeRef[];
  },
): {
  entries: NormalizedImportEntry[];
  diagnostics: ImportDiagnostics;
} {
  const { employees, workstations, leaveTypes } = context;

  const unmatchedEmployeesSet = new Set<string>();
  const unmatchedWorkstationsSet = new Set<string>();
  const unmatchedLeaveTypesSet = new Set<string>();
  const matchedEmployeeIds = new Set<string>();
  const matchedWorkstationIds = new Set<string>();
  const matchedLeaveTypeIds = new Set<string>();

  const processed: NormalizedImportEntry[] = [];

  for (const entry of entries) {
    const errors: string[] = [...(entry.validationErrors || [])];
    const warnings: string[] = [...(entry.warningFlags || [])];

    // 1. Employee Matching
    const ident = entry.employeeIdentifier.toLowerCase().trim();
    const matchedEmployee = employees.find((e) => {
      const email = e.email.toLowerCase().trim();
      const num = (e.employee_number || "").toLowerCase().trim();
      const name = e.full_name.toLowerCase().trim();
      return email === ident || (num && num === ident) || name === ident;
    });

    if (matchedEmployee) {
      entry.matchedEmployeeId = matchedEmployee.id;
      entry.matchedEmployeeName = matchedEmployee.full_name;
      matchedEmployeeIds.add(matchedEmployee.id);
    } else {
      errors.push(`Employee "${entry.employeeIdentifier}" not found in this company`);
      unmatchedEmployeesSet.add(entry.employeeIdentifier);
    }

    // 2. Workstation Matching (for work shifts)
    if (entry.entryType === "work") {
      if (entry.workstationName) {
        const rawWs = entry.workstationName.toLowerCase().trim();
        const matchedWs = workstations.find((ws) => {
          const name = ws.name.toLowerCase().trim();
          return (
            name === rawWs ||
            rawWs.includes(name) ||
            name.includes(rawWs) ||
            name.replace(/ branch$/i, "") === rawWs.replace(/ branch$/i, "")
          );
        });

        if (matchedWs) {
          entry.matchedWorkstationId = matchedWs.id;
          entry.workstationName = matchedWs.name;
          matchedWorkstationIds.add(matchedWs.id);
        } else {
          // If employee has a default workstation, use it as fallback
          if (matchedEmployee?.workstation_id) {
            entry.matchedWorkstationId = matchedEmployee.workstation_id;
            warnings.push(
              `Workstation "${entry.workstationName}" not found; defaulted to employee's assigned workstation`,
            );
          } else if (workstations.length === 1) {
            entry.matchedWorkstationId = workstations[0].id;
            entry.workstationName = workstations[0].name;
            warnings.push(
              `Workstation "${entry.workstationName}" not found; assigned to company primary workstation`,
            );
          } else {
            warnings.push(
              `Workstation "${entry.workstationName}" could not be resolved`,
            );
            unmatchedWorkstationsSet.add(entry.workstationName);
          }
        }
      } else if (matchedEmployee?.workstation_id) {
        entry.matchedWorkstationId = matchedEmployee.workstation_id;
      }
    }

    // 3. Leave Type Matching (for leave entries)
    if (entry.entryType === "leave" && entry.leaveTypeName) {
      const rawLt = entry.leaveTypeName.toLowerCase().trim();
      const matchedLt = leaveTypes.find((lt) => {
        const name = lt.name.toLowerCase().trim();
        const cat = lt.category.toLowerCase().trim();
        return (
          name === rawLt ||
          name.includes(rawLt) ||
          rawLt.includes(name) ||
          (entry.leaveCategory && cat === entry.leaveCategory) ||
          (rawLt.includes("annual") && cat === "annual") ||
          (rawLt.includes("sick") && cat === "sick") ||
          (rawLt.includes("family") && cat === "family_responsibility") ||
          (rawLt.includes("holiday") && (name.includes("holiday") || cat === "other"))
        );
      });

      if (matchedLt) {
        entry.matchedLeaveTypeId = matchedLt.id;
        entry.leaveTypeName = matchedLt.name;
        entry.isPaidLeave = matchedLt.is_paid;
        matchedLeaveTypeIds.add(matchedLt.id);
      } else {
        warnings.push(
          `Leave type "${entry.leaveTypeName}" will be automatically provisioned under company leave policies`,
        );
        unmatchedLeaveTypesSet.add(entry.leaveTypeName);
      }
    }

    // Final status
    entry.validationErrors = errors;
    entry.warningFlags = warnings;
    entry.validationStatus =
      errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "valid";

    processed.push(entry);
  }

  const distinctDates = new Set(processed.map((p) => p.workDate));
  const workShiftsCount = processed.filter((p) => p.entryType === "work").length;
  const leaveDaysCount = processed.filter((p) => p.entryType === "leave").length;
  const validCount = processed.filter((p) => p.validationStatus === "valid").length;
  const warningCount = processed.filter((p) => p.validationStatus === "warning").length;
  const errorCount = processed.filter((p) => p.validationStatus === "error").length;

  const diagnostics: ImportDiagnostics = {
    format: "clockwise_standard",
    formatDescription: "",
    totalRowsRead: processed.length,
    distinctDatesCount: distinctDates.size,
    workShiftsCount,
    leaveDaysCount,
    matchedEmployeesCount: matchedEmployeeIds.size,
    unmatchedEmployees: Array.from(unmatchedEmployeesSet),
    matchedWorkstationsCount: matchedWorkstationIds.size,
    unmatchedWorkstations: Array.from(unmatchedWorkstationsSet),
    matchedLeaveTypesCount: matchedLeaveTypeIds.size,
    unmatchedLeaveTypes: Array.from(unmatchedLeaveTypesSet),
    validEntriesCount: validCount,
    warningEntriesCount: warningCount,
    errorEntriesCount: errorCount,
  };

  return { entries: processed, diagnostics };
}

/**
 * Master parser: takes uploaded file buffer, detects format, stitches intervals,
 * and reconciles against company data.
 */
export function parseAndNormalizeUploadedTimesheet(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  context: {
    employees: CompanyEmployeeRef[];
    workstations: CompanyWorkstationRef[];
    leaveTypes: CompanyLeaveTypeRef[];
  },
): {
  format: DetectedSpreadsheetFormat;
  entries: NormalizedImportEntry[];
  diagnostics: ImportDiagnostics;
} {
  const { headers, rows } = extractRawGridFromBuffer(buffer);
  const detectedFormat = detectSpreadsheetFormat(headers);

  let rawEntries: NormalizedImportEntry[] = [];
  if (detectedFormat === "quickbooks_time") {
    rawEntries = processQuickBooksTimeRows(rows);
  } else {
    rawEntries = processClockWiseStandardRows(rows);
  }

  const { entries, diagnostics } = reconcileEntriesWithCompany(
    rawEntries,
    context,
  );

  diagnostics.format = detectedFormat;
  diagnostics.formatDescription =
    detectedFormat === "quickbooks_time"
      ? "QuickBooks Time / TSheets (Auto-Stitched Shifts & Leave)"
      : "ClockWise People Standard Attendance Template";

  return {
    format: detectedFormat,
    entries,
    diagnostics,
  };
}
