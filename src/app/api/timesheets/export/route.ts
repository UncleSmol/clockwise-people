import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCompany, getCurrentUserAccess } from "@/lib/foundation/queries";
import { isBalanceEligibleLeaveType } from "@/lib/work-rules/realtime-accrual";

export async function GET(request: Request) {
  try {
    const [{ company }, access, supabase] = await Promise.all([
      getActiveCompany(),
      getCurrentUserAccess(),
      createSupabaseServerClient(),
    ]);

    if (!access.canManageCompany && !access.canReviewBranchTime && !access.isSuperAdmin) {
      return new NextResponse("Unauthorized. Administrator or Manager access required.", {
        status: 403,
      });
    }

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    // 1. Fetch all company employees
    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, email, employee_number, full_name, known_as, job_title, department_id, workstation_id, status")
      .eq("company_id", company.id)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });

    if (empErr) throw new Error(empErr.message);

    const empMap = new Map((employees || []).map((e) => [e.id, e]));

    // 2. Fetch workstations, leave types, departments & company TOIL settings
    const [wsRes, ltRes, deptRes, settingsRes] = await Promise.all([
      supabase
        .from("company_workstations")
        .select("id, name")
        .eq("company_id", company.id)
        .is("deleted_at", null),
      supabase
        .from("leave_types")
        .select("id, name, category, is_paid")
        .eq("company_id", company.id)
        .is("deleted_at", null),
      supabase
        .from("company_departments")
        .select("id, name")
        .eq("company_id", company.id)
        .is("deleted_at", null),
      supabase
        .from("company_settings")
        .select("toil_rules")
        .eq("company_id", company.id)
        .maybeSingle(),
    ]);

    const toilEnabled = Boolean(
      (settingsRes.data?.toil_rules as Record<string, unknown> | undefined)?.enabled,
    );

    const wsMap = new Map((wsRes.data || []).map((w) => [w.id, w.name]));
    const ltMap = new Map((ltRes.data || []).map((l) => [l.id, l]));
    const deptMap = new Map((deptRes.data || []).map((d) => [d.id, d.name]));

    // 3. Fetch all timesheet entries (historical imported + live clocked)
    const PAGE_SIZE = 1000;
    type ExportTimeEntry = {
      id: string;
      employee_id: string;
      work_date: string;
      entry_type?: string | null;
      clock_in: string | null;
      lunch_start: string | null;
      lunch_end: string | null;
      clock_out: string | null;
      gross_hours: number | null;
      paid_hours: number | null;
      normal_hours: number | null;
      overtime_hours: number | null;
      status: string;
      notes: string | null;
      workstation_id: string | null;
    };
    const timeEntries: ExportTimeEntry[] = [];
    let teFrom = 0;

    while (true) {
      let pageQuery = supabase
        .from("time_entries")
        .select(
          "id, employee_id, work_date, entry_type, clock_in, lunch_start, lunch_end, clock_out, gross_hours, paid_hours, normal_hours, overtime_hours, status, notes, workstation_id",
        )
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .order("work_date", { ascending: true })
        .range(teFrom, teFrom + PAGE_SIZE - 1);

      if (startDate) pageQuery = pageQuery.gte("work_date", startDate);
      if (endDate) pageQuery = pageQuery.lte("work_date", endDate);

      const { data: pageData, error: teErr } = await pageQuery;
      if (teErr) throw new Error(teErr.message);
      if (!pageData || pageData.length === 0) break;
      timeEntries.push(...(pageData as unknown as ExportTimeEntry[]));
      if (pageData.length < PAGE_SIZE) break;
      teFrom += PAGE_SIZE;
    }

    // 4. Fetch leave requests to map leave_type names for leave entries
    type ExportLeaveRequest = {
      id: string;
      employee_id: string;
      leave_type_id: string;
      start_date: string;
      end_date: string;
      total_hours: number | null;
      status: string;
    };
    const leaveRequests: ExportLeaveRequest[] = [];
    let lrFrom = 0;

    while (true) {
      const { data: lrPage, error: lrErr } = await supabase
        .from("leave_requests")
        .select("id, employee_id, leave_type_id, start_date, end_date, total_hours, status")
        .eq("company_id", company.id)
        .neq("status", "cancelled")
        .range(lrFrom, lrFrom + PAGE_SIZE - 1);

      if (lrErr) throw new Error(lrErr.message);
      if (!lrPage || lrPage.length === 0) break;
      leaveRequests.push(...(lrPage as unknown as ExportLeaveRequest[]));
      if (lrPage.length < PAGE_SIZE) break;
      lrFrom += PAGE_SIZE;
    }

    // Build Timesheet Rows
    const timesheetRows = (timeEntries || []).map((entry) => {
      const emp = empMap.get(entry.employee_id);
      const wsName = entry.workstation_id ? wsMap.get(entry.workstation_id) ?? "" : "";

      let leaveTypeName = "";
      let leaveHours: number | string = "";

      if (entry.entry_type === "leave") {
        leaveHours = Number(entry.paid_hours || entry.gross_hours || 8.0);
        const matchingLeave = (leaveRequests || []).find(
          (lr) =>
            lr.employee_id === entry.employee_id &&
            lr.start_date <= entry.work_date &&
            lr.end_date >= entry.work_date,
        );
        if (matchingLeave) {
          const lt = ltMap.get(matchingLeave.leave_type_id);
          leaveTypeName = lt ? lt.name : "Approved Leave";
        } else {
          leaveTypeName = "Leave";
        }
      }

      return {
        employee_email: emp?.email || "",
        employee_number: emp?.employee_number || "",
        work_date: entry.work_date,
        entry_type: entry.entry_type === "leave" ? "leave" : "work",
        clock_in: entry.clock_in ? entry.clock_in.slice(0, 5) : "",
        lunch_start: entry.lunch_start ? entry.lunch_start.slice(0, 5) : "",
        lunch_end: entry.lunch_end ? entry.lunch_end.slice(0, 5) : "",
        clock_out: entry.clock_out ? entry.clock_out.slice(0, 5) : "",
        leave_type: leaveTypeName,
        leave_hours: leaveHours,
        workstation: wsName,
        status: entry.status || "approved",
        notes: entry.notes || "",
      };
    });

    // 5. Fetch leave balances for the second sheet
    const { data: leaveBalances } = await supabase
      .from("leave_balances")
      .select("id, employee_id, leave_type_id, balance_hours, accrued_hours, taken_hours, as_of_date")
      .eq("company_id", company.id);

    const balanceRows = (leaveBalances || [])
      .filter((b) => {
        const lt = ltMap.get(b.leave_type_id);
        return isBalanceEligibleLeaveType(lt?.name, lt?.category, toilEnabled);
      })
      .map((b) => {
        const emp = empMap.get(b.employee_id);
        const lt = ltMap.get(b.leave_type_id);
        return {
          employee_email: emp?.email || "",
          employee_number: emp?.employee_number || "",
          employee_name: emp?.full_name || "",
          leave_type: lt?.name || "Leave",
          category: lt?.category || "general",
          accrued_hours: Number(b.accrued_hours || 0),
          taken_hours: Number(b.taken_hours || 0),
          balance_hours: Number(b.balance_hours || 0),
          as_of_date: b.as_of_date || "",
        };
      });

    // 6. Build Employees Sheet
    const employeeRows = (employees || []).map((e) => ({
      employee_number: e.employee_number || "",
      email: e.email || "",
      full_name: e.full_name || "",
      known_as: e.known_as || "",
      job_title: e.job_title || "",
      department: e.department_id ? deptMap.get(e.department_id) || "" : "",
      workstation: e.workstation_id ? wsMap.get(e.workstation_id) || "" : "",
      status: e.status || "active",
    }));

    // Generate XLSX workbook
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Sheet 1: Timesheets (matches ClockWise_Import.xlsx structure 1:1)
    const wsTimesheets = XLSX.utils.json_to_sheet(timesheetRows);
    XLSX.utils.book_append_sheet(wb, wsTimesheets, "Timesheets");

    // Sheet 2: Leave_Balances
    const wsBalances = XLSX.utils.json_to_sheet(balanceRows);
    XLSX.utils.book_append_sheet(wb, wsBalances, "Leave_Balances");

    // Sheet 3: Employees
    const wsEmployees = XLSX.utils.json_to_sheet(employeeRows);
    XLSX.utils.book_append_sheet(wb, wsEmployees, "Employees");

    const fileBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeCompany = company.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const today = new Date().toISOString().slice(0, 10);
    const filename = `ClockWise_Live_Timesheets_${safeCompany}_${today}.xlsx`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error exporting live timesheet spreadsheet:", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal server error exporting timesheets",
      { status: 500 },
    );
  }
}

