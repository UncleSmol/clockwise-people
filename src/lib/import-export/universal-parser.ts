import * as XLSX from "xlsx";

export type ImportEntityType = "employees" | "timesheets" | "leave_balances";

export type TargetFieldDefinition = {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "date" | "time" | "number" | "enum";
  enumValues?: string[];
  description: string;
  aliases: string[]; // Common alternative header names for auto-matching
};

export const ENTITY_FIELD_DEFINITIONS: Record<ImportEntityType, TargetFieldDefinition[]> = {
  employees: [
    {
      key: "full_name",
      label: "Full Name",
      required: true,
      type: "string",
      description: "Employee full legal name (e.g. John Smith)",
      aliases: ["full name", "fullname", "name", "employee name", "staff name", "worker name"],
    },
    {
      key: "email",
      label: "Email Address",
      required: false,
      type: "string",
      description: "Work or personal email address",
      aliases: ["email", "e-mail", "email address", "mail", "contact email"],
    },
    {
      key: "employee_number",
      label: "Employee ID / Number",
      required: false,
      type: "string",
      description: "Company staff ID or badge number (e.g. EMP-001)",
      aliases: ["employee number", "emp no", "emp id", "staff id", "employee id", "badge no", "badge number"],
    },
    {
      key: "known_as",
      label: "Known As / Display Name",
      required: false,
      type: "string",
      description: "Preferred or nickname",
      aliases: ["known as", "preferred name", "nickname", "alias", "first name"],
    },
    {
      key: "phone_number",
      label: "Phone Number",
      required: false,
      type: "string",
      description: "Mobile or contact telephone number",
      aliases: ["phone", "phone number", "mobile", "cell", "telephone", "contact number"],
    },
    {
      key: "job_title",
      label: "Job Title",
      required: false,
      type: "string",
      description: "Position or role title",
      aliases: ["job title", "position", "role", "title", "designation"],
    },
    {
      key: "workstation_name",
      label: "Workstation / Branch / Location",
      required: false,
      type: "string",
      description: "Primary site or workstation name",
      aliases: ["workstation", "branch", "location", "site", "office", "store", "department"],
    },
    {
      key: "employment_type",
      label: "Employment Type",
      required: false,
      type: "enum",
      enumValues: ["full_time", "part_time", "contract", "casual", "temporary"],
      description: "Type of employment contract",
      aliases: ["employment type", "type", "contract type", "emp type", "status type"],
    },
    {
      key: "employment_status",
      label: "Employment Status",
      required: false,
      type: "enum",
      enumValues: ["active", "inactive", "on_leave", "terminated"],
      description: "Current employment status",
      aliases: ["employment status", "status", "active status", "state"],
    },
    {
      key: "start_date",
      label: "Start / Hire Date",
      required: false,
      type: "date",
      description: "Date joined company (YYYY-MM-DD)",
      aliases: ["start date", "hire date", "joining date", "date joined", "start"],
    },
    {
      key: "hourly_rate",
      label: "Hourly Rate ($ / R)",
      required: false,
      type: "number",
      description: "Hourly compensation rate",
      aliases: ["hourly rate", "rate", "pay rate", "hour rate", "hourly pay"],
    },
    {
      key: "monthly_salary",
      label: "Monthly Salary ($ / R)",
      required: false,
      type: "number",
      description: "Fixed monthly remuneration",
      aliases: ["monthly salary", "salary", "basic salary", "month pay", "gross salary"],
    },
    {
      key: "payroll_identifier",
      label: "Payroll ID",
      required: false,
      type: "string",
      description: "External payroll code or tax reference",
      aliases: ["payroll id", "payroll identifier", "tax id", "payroll code"],
    },
  ],

  timesheets: [
    {
      key: "employee_identifier",
      label: "Employee (Name / Email / ID)",
      required: true,
      type: "string",
      description: "Identifies the staff member (email, employee number, or full name)",
      aliases: [
        "employee",
        "staff",
        "employee name",
        "staff name",
        "user",
        "worker",
        "email",
        "employee email",
        "employee number",
        "emp no",
        "emp id",
      ],
    },
    {
      key: "work_date",
      label: "Work Date",
      required: true,
      type: "date",
      description: "Date of shift or leave (YYYY-MM-DD)",
      aliases: ["date", "work date", "shift date", "log date", "day"],
    },
    {
      key: "clock_in",
      label: "Clock In Time",
      required: false,
      type: "time",
      description: "Time shift started (e.g. 08:00 or 8:00 AM)",
      aliases: ["clock in", "start time", "in time", "time in", "in", "start", "clock_in"],
    },
    {
      key: "lunch_start",
      label: "Break Start Time",
      required: false,
      type: "time",
      description: "Time meal break started (e.g. 12:00)",
      aliases: ["lunch start", "break start", "meal start", "lunch_start", "break in"],
    },
    {
      key: "lunch_end",
      label: "Break End Time",
      required: false,
      type: "time",
      description: "Time meal break ended (e.g. 12:30)",
      aliases: ["lunch end", "break end", "meal end", "lunch_end", "break out"],
    },
    {
      key: "clock_out",
      label: "Clock Out Time",
      required: false,
      type: "time",
      description: "Time shift ended (e.g. 17:00 or 5:00 PM)",
      aliases: ["clock out", "end time", "out time", "time out", "out", "end", "clock_out"],
    },
    {
      key: "workstation_name",
      label: "Workstation / Branch",
      required: false,
      type: "string",
      description: "Location where work was performed",
      aliases: ["workstation", "branch", "location", "site", "job site", "department"],
    },
    {
      key: "entry_type",
      label: "Entry Type (Work vs Leave)",
      required: false,
      type: "enum",
      enumValues: ["work", "leave"],
      description: "'work' for shifts, 'leave' for leave history",
      aliases: ["entry type", "type", "log type", "category"],
    },
    {
      key: "leave_type_name",
      label: "Leave Type Name (if Leave)",
      required: false,
      type: "string",
      description: "Name of leave rule (e.g. Annual Leave, Sick Leave)",
      aliases: ["leave type", "leave category", "type of leave", "leave name"],
    },
    {
      key: "leave_hours",
      label: "Leave Hours",
      required: false,
      type: "number",
      description: "Hours of leave taken on this date",
      aliases: ["leave hours", "hours taken", "leave duration", "leave_hours"],
    },
    {
      key: "notes",
      label: "Notes / Comments",
      required: false,
      type: "string",
      description: "Remarks or reason for entry",
      aliases: ["notes", "comments", "reason", "memo", "description", "remark"],
    },
  ],

  leave_balances: [
    {
      key: "employee_identifier",
      label: "Employee (Name / Email / ID)",
      required: true,
      type: "string",
      description: "Identifies the employee (email, employee number, or full name)",
      aliases: [
        "employee",
        "staff",
        "employee name",
        "staff name",
        "email",
        "employee email",
        "employee number",
        "emp no",
      ],
    },
    {
      key: "leave_type_name",
      label: "Leave Type Name (Single Column Mode)",
      required: false,
      type: "string",
      description: "Type of leave (e.g. Annual Leave, Sick Leave, Family Responsibility)",
      aliases: ["leave type", "leave type name", "leave category", "type", "leave name"],
    },
    {
      key: "balance_hours",
      label: "Available Balance (Hours - Single Column)",
      required: false,
      type: "number",
      description: "Current remaining leave balance in hours",
      aliases: ["balance hours", "balance", "available balance", "remaining balance", "hours remaining", "current balance"],
    },
    {
      key: "annual_leave_hours",
      label: "Annual Leave Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Annual / Vacation Leave",
      aliases: ["annual leave", "annual balance", "vacation balance", "annual leave hours", "annual", "vacation"],
    },
    {
      key: "sick_leave_hours",
      label: "Sick Leave Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Sick / Medical Leave",
      aliases: ["sick leave", "sick balance", "sick leave hours", "medical leave", "sick"],
    },
    {
      key: "family_leave_hours",
      label: "Family Responsibility Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Family Responsibility Leave",
      aliases: ["family responsibility", "family leave", "frl balance", "family leave hours", "family responsibility leave", "family"],
    },
    {
      key: "study_leave_hours",
      label: "Study Leave Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Study / Exam Leave",
      aliases: ["study leave", "study balance", "study leave hours", "exam leave", "education leave", "study"],
    },
    {
      key: "maternity_leave_hours",
      label: "Maternity Leave Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Maternity Leave",
      aliases: ["maternity leave", "maternity balance", "maternity hours", "maternity"],
    },
    {
      key: "parental_leave_hours",
      label: "Parental / Paternity Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Parental / Paternity Leave",
      aliases: ["parental leave", "paternity leave", "parental balance", "paternity"],
    },
    {
      key: "toil_leave_hours",
      label: "TOIL / Overtime Comp Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Time Off In Lieu (TOIL)",
      aliases: ["toil", "overtime leave", "comp time", "toil balance", "time off in lieu"],
    },
    {
      key: "unpaid_leave_hours",
      label: "Unpaid Leave Balance (Hours)",
      required: false,
      type: "number",
      description: "Available balance hours for Unpaid Leave",
      aliases: ["unpaid leave", "unpaid balance", "unpaid"],
    },
    {
      key: "accrued_hours",
      label: "Accrued Hours",
      required: false,
      type: "number",
      description: "Total accrued/allocated leave hours",
      aliases: ["accrued hours", "accrued", "total accrued", "entitlement", "earned hours"],
    },
    {
      key: "taken_hours",
      label: "Taken Hours",
      required: false,
      type: "number",
      description: "Total leave hours taken to date",
      aliases: ["taken hours", "taken", "used hours", "hours taken", "consumed hours"],
    },
    {
      key: "as_of_date",
      label: "As Of Date",
      required: false,
      type: "date",
      description: "Effective date of balance",
      aliases: ["as of date", "effective date", "date", "balance date"],
    },
  ],
};

export type SpreadsheetInspectionResult = {
  ok: boolean;
  message?: string;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMappings: Record<string, string>; // targetKey -> headerName
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
 * Extracts sheets, headers, sample rows, and generates smart field suggestions.
 */
export function inspectSpreadsheet(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  targetEntity: ImportEntityType,
  sheetNameChoice?: string
): SpreadsheetInspectionResult {
  try {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return {
        ok: false,
        message: "Spreadsheet contains no readable sheets.",
        sheetNames: [],
        selectedSheet: "",
        headers: [],
        sampleRows: [],
        suggestedMappings: {},
      };
    }

    const selectedSheet =
      sheetNameChoice && wb.SheetNames.includes(sheetNameChoice)
        ? sheetNameChoice
        : wb.SheetNames[0];

    const sheet = wb.Sheets[selectedSheet];
    if (!sheet) {
      return {
        ok: false,
        message: `Sheet "${selectedSheet}" is empty.`,
        sheetNames: wb.SheetNames,
        selectedSheet,
        headers: [],
        sampleRows: [],
        suggestedMappings: {},
      };
    }

    // Get 2D grid
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    if (!rawRows || rawRows.length === 0) {
      return {
        ok: false,
        message: "Spreadsheet sheet is empty.",
        sheetNames: wb.SheetNames,
        selectedSheet,
        headers: [],
        sampleRows: [],
        suggestedMappings: {},
      };
    }

    // Header extraction (skip leading blank rows if any)
    let headerRowIdx = 0;
    while (
      headerRowIdx < rawRows.length &&
      (!Array.isArray(rawRows[headerRowIdx]) ||
        (rawRows[headerRowIdx] as unknown[]).every((cell) => !cell || String(cell).trim() === ""))
    ) {
      headerRowIdx++;
    }

    if (headerRowIdx >= rawRows.length) {
      return {
        ok: false,
        message: "Could not find header row in spreadsheet.",
        sheetNames: wb.SheetNames,
        selectedSheet,
        headers: [],
        sampleRows: [],
        suggestedMappings: {},
      };
    }

    let headers: string[] = [];
    const rawHeaderCells = rawRows[headerRowIdx] as unknown[];

    // Handle single-column CSV packed in first cell
    if (
      rawHeaderCells.length === 1 &&
      typeof rawHeaderCells[0] === "string" &&
      rawHeaderCells[0].includes(",")
    ) {
      headers = parseCsvLine(rawHeaderCells[0]);
    } else {
      headers = rawHeaderCells.map((c, idx) => (c ? String(c).trim() : `Column ${idx + 1}`));
    }

    // Filter out completely blank trailing header labels
    headers = headers.map((h, idx) => (h ? h : `Column ${idx + 1}`));

    // Extract sample rows (up to 5 rows)
    const sampleRows: Record<string, string>[] = [];
    for (let r = headerRowIdx + 1; r < Math.min(rawRows.length, headerRowIdx + 6); r++) {
      const rowObj: Record<string, string> = {};
      const rowCells = rawRows[r] as unknown[];
      if (!rowCells) continue;

      let isSingleCsv = false;
      if (
        rowCells.length === 1 &&
        typeof rowCells[0] === "string" &&
        rowCells[0].includes(",")
      ) {
        isSingleCsv = true;
      }

      const parsedCols = isSingleCsv
        ? parseCsvLine(String(rowCells[0]))
        : rowCells.map((c) => (c !== undefined && c !== null ? String(c).trim() : ""));

      headers.forEach((h, colIdx) => {
        rowObj[h] = parsedCols[colIdx] ?? "";
      });

      // Only add non-empty rows
      if (Object.values(rowObj).some((val) => val.length > 0)) {
        sampleRows.push(rowObj);
      }
    }

    // Auto-match headers to target fields based on aliases
    const suggestedMappings: Record<string, string> = {};
    const fieldDefs = ENTITY_FIELD_DEFINITIONS[targetEntity] || [];

    for (const field of fieldDefs) {
      const fieldKey = field.key;
      const cleanLabel = field.label.toLowerCase();

      // Find matching header
      const matchedHeader = headers.find((h) => {
        const cleanH = h.toLowerCase().trim();
        if (cleanH === fieldKey || cleanH === cleanLabel) return true;
        return field.aliases.some((alias) => cleanH === alias.toLowerCase() || cleanH.includes(alias.toLowerCase()));
      });

      if (matchedHeader) {
        suggestedMappings[fieldKey] = matchedHeader;
      }
    }

    return {
      ok: true,
      sheetNames: wb.SheetNames,
      selectedSheet,
      headers,
      sampleRows,
      suggestedMappings,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to inspect spreadsheet file format.",
      sheetNames: [],
      selectedSheet: "",
      headers: [],
      sampleRows: [],
      suggestedMappings: {},
    };
  }
}

/**
 * Normalizes flexible date strings (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, Excel serials) to YYYY-MM-DD.
 */
export function normalizeDateValue(rawVal: unknown): string | null {
  if (rawVal === undefined || rawVal === null) return null;
  const str = String(rawVal).trim();
  if (!str) return null;

  // Check if numeric Excel serial date
  if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 60000) {
    const excelNum = Number(str);
    const dateObj = new Date(Math.round((excelNum - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split("T")[0];
    }
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const parts = str.split(/[/.\-]/);
  if (parts.length === 3) {
    const [p1, p2, p3] = parts;

    // YYYY/MM/DD
    if (p1.length === 4) {
      const year = p1;
      const month = p2.padStart(2, "0");
      const day = p3.padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    // DD/MM/YYYY or MM/DD/YYYY where p3 is YYYY
    if (p3.length === 4) {
      const num1 = parseInt(p1, 10);
      const num2 = parseInt(p2, 10);

      // If num1 > 12, it MUST be day (DD/MM/YYYY)
      if (num1 > 12) {
        return `${p3}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
      }
      // If num2 > 12, it MUST be day (MM/DD/YYYY)
      if (num2 > 12) {
        return `${p3}-${p1.padStart(2, "0")}-${p2.padStart(2, "0")}`;
      }
      // Default to DD/MM/YYYY (UK/SA standard)
      return `${p3}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
    }
  }

  // Try Native Date parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

/**
 * Normalizes flexible time strings (14:30, 2:30 PM, 08:00:00, 0.375 decimal) to HH:mm.
 */
export function normalizeTimeValue(rawVal: unknown): string | null {
  if (rawVal === undefined || rawVal === null) return null;
  const str = String(rawVal).trim();
  if (!str) return null;

  // Decimal day fraction from Excel (e.g. 0.375 = 09:00)
  if (!isNaN(Number(str)) && Number(str) >= 0 && Number(str) < 1) {
    const totalMinutes = Math.round(Number(str) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  // 12-hour format with AM/PM (e.g., "08:30 AM", "2:15 PM", "12:00 PM")
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const mins = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  // 24-hour format (e.g., "08:30", "14:15", "08:30:00")
  const h24Match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const mins = parseInt(h24Match[2], 10);
    if (hours >= 0 && hours < 24 && mins >= 0 && mins < 60) {
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }
  }

  return null;
}
