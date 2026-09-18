import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ParsedPayrollIdentifier = {
  prefix: string;
  num: number;
  padLen: number;
};

export type CompanyPayrollFormat = {
  prefix: string;
  padLen: number;
  usedNumbers: Set<number>;
  maxNumber: number;
};

/**
 * Parses an existing payroll identifier into its prefix, integer sequence, and padding length.
 * Handles patterns like "ee001", "EMP001", "PAY-0042", or pure numbers "1001".
 */
export function parsePayrollIdentifier(id: string | null | undefined): ParsedPayrollIdentifier | null {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed) return null;

  // Pattern with alphabetical prefix: e.g. "ee001", "PAY-001", "EMP_12"
  const prefixMatch = trimmed.match(/^([a-zA-Z]+[-_]?)(\d+)$/);
  if (prefixMatch) {
    return {
      prefix: prefixMatch[1],
      num: parseInt(prefixMatch[2], 10),
      padLen: prefixMatch[2].length,
    };
  }

  // Pure numeric pattern: e.g. "1001", "005"
  const numMatch = trimmed.match(/^(\d+)$/);
  if (numMatch) {
    return {
      prefix: "",
      num: parseInt(numMatch[1], 10),
      padLen: numMatch[1].length,
    };
  }

  return null;
}

/**
 * Analyzes all existing payroll identifiers within a company to determine the prevailing
 * naming convention (prefix, zero-padding width, and allocated numbers).
 * Defaults to prefix 'ee' with 3-digit padding (e.g. 'ee001') if no identifiers exist.
 */
export function detectCompanyPayrollFormat(existingIds: (string | null | undefined)[]): CompanyPayrollFormat {
  let detectedPrefix = "ee";
  let maxPadLen = 3;
  let maxNumber = 0;
  const usedNumbers = new Set<number>();
  const prefixCounts = new Map<string, number>();

  for (const id of existingIds) {
    const parsed = parsePayrollIdentifier(id);
    if (parsed) {
      prefixCounts.set(parsed.prefix, (prefixCounts.get(parsed.prefix) ?? 0) + 1);
      if (parsed.padLen > maxPadLen) {
        maxPadLen = parsed.padLen;
      }
      if (parsed.num > maxNumber) {
        maxNumber = parsed.num;
      }
      usedNumbers.add(parsed.num);
    }
  }

  // Use the most frequently used prefix among existing employees
  if (prefixCounts.size > 0) {
    let topCount = -1;
    for (const [prefix, count] of prefixCounts.entries()) {
      if (count > topCount) {
        topCount = count;
        detectedPrefix = prefix;
      }
    }
  }

  return {
    prefix: detectedPrefix,
    padLen: maxPadLen,
    usedNumbers,
    maxNumber,
  };
}

/**
 * Generates the next available non-colliding payroll identifier string based on existing IDs.
 */
export function getNextAvailablePayrollId(existingIds: (string | null | undefined)[]): string {
  const format = detectCompanyPayrollFormat(existingIds);
  let nextNum = 1;
  while (format.usedNumbers.has(nextNum)) {
    nextNum++;
  }
  return `${format.prefix}${String(nextNum).padStart(format.padLen, "0")}`;
}

export type AutoAssignResult = {
  updatedCount: number;
  assignments: Array<{
    employeeId: string;
    employeeName: string;
    employeeNumber: string;
    payrollIdentifier: string;
  }>;
};

/**
 * Inspects all employees for a company, detects unassigned/empty payroll identifiers,
 * generates sequential non-colliding payroll IDs matching the company convention (e.g. ee001, ee002...),
 * and updates them in the database.
 */
export async function autoAssignCompanyPayrollIdentifiers(
  companyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): Promise<AutoAssignResult> {
  const supabase = client ?? (await createSupabaseServerClient());

  // 1. Fetch all active and soft-deleted employees to prevent collisions
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, full_name, employee_number, payroll_identifier, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("employee_number", { ascending: true });

  if (error || !employees) {
    return { updatedCount: 0, assignments: [] };
  }

  // 2. Identify existing valid IDs
  const existingIds = employees
    .map((e: { payroll_identifier: string | null }) => e.payroll_identifier)
    .filter(Boolean);

  const format = detectCompanyPayrollFormat(existingIds);
  const runningUsed = new Set<number>(format.usedNumbers);

  // 3. Find employees with empty or blank payroll_identifier
  const unassigned = employees.filter(
    (e: { payroll_identifier: string | null }) =>
      !e.payroll_identifier || e.payroll_identifier.trim() === "",
  );

  if (unassigned.length === 0) {
    return { updatedCount: 0, assignments: [] };
  }

  const assignments: AutoAssignResult["assignments"] = [];
  let candidateNum = 1;

  for (const emp of unassigned) {
    while (runningUsed.has(candidateNum)) {
      candidateNum++;
    }

    const newId = `${format.prefix}${String(candidateNum).padStart(format.padLen, "0")}`;
    runningUsed.add(candidateNum);

    assignments.push({
      employeeId: emp.id,
      employeeName: emp.full_name,
      employeeNumber: emp.employee_number,
      payrollIdentifier: newId,
    });

    candidateNum++;
  }

  // 4. Update employees in database
  for (const item of assignments) {
    await supabase
      .from("employees")
      .update({ payroll_identifier: item.payrollIdentifier })
      .eq("id", item.employeeId)
      .eq("company_id", companyId);
  }

  return {
    updatedCount: assignments.length,
    assignments,
  };
}

/**
 * Returns the next suggested payroll ID for a company (e.g. for prefilling forms or defaults).
 */
export async function getOrGenerateNextPayrollId(
  companyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any,
): Promise<string> {
  const supabase = client ?? (await createSupabaseServerClient());

  const { data: employees } = await supabase
    .from("employees")
    .select("payroll_identifier")
    .eq("company_id", companyId)
    .is("deleted_at", null);

  const existingIds = (employees ?? [])
    .map((e: { payroll_identifier: string | null }) => e.payroll_identifier)
    .filter(Boolean);

  return getNextAvailablePayrollId(existingIds);
}
