"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Search,
  Filter,
  RefreshCw,
  User,
  AlertCircle,
  Check,
  X,
  FileText,
  ChevronDown,
} from "lucide-react";
import EmployeeAvatar from "@/components/EmployeeAvatar";
import {
  getSuperAdminTimesheetsAction,
  getSuperAdminLeaveRequestsAction,
  superAdminSetTimesheetsStatusAction,
  superAdminSetLeaveRequestStatusAction,
  type SuperAdminTimesheetItem,
  type SuperAdminLeaveItem,
} from "@/lib/sysadmin/override-actions";

type SuperAdminApprovalOverridePanelProps = {
  companyId: string;
  companyName: string;
  employees: {
    id: string;
    name: string;
  }[];
};

export default function SuperAdminApprovalOverridePanel({
  companyId,
  companyName,
  employees,
}: SuperAdminApprovalOverridePanelProps) {
  const [activeTab, setActiveTab] = useState<"timesheets" | "leave">("timesheets");
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null);

  // Filters
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<"all" | "30d" | "60d">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Data
  const [timesheets, setTimesheets] = useState<SuperAdminTimesheetItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<SuperAdminLeaveItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  // Selections
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchNote, setBatchNote] = useState("");

  // Compute date limits based on dateRangeFilter
  const { startDate, endDate } = useMemo(() => {
    if (dateRangeFilter === "all") return {};
    const end = new Date();
    const start = new Date();
    if (dateRangeFilter === "30d") {
      start.setDate(end.getDate() - 30);
    } else if (dateRangeFilter === "60d") {
      start.setDate(end.getDate() - 60);
    }
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, [dateRangeFilter]);

  // Load data
  const loadData = async (preserveFeedback = false) => {
    setIsLoading(true);
    if (!preserveFeedback) setFeedback(null);
    setSelectedIds(new Set());

    if (activeTab === "timesheets") {
      const res = await getSuperAdminTimesheetsAction({
        companyId,
        employeeId: selectedEmployeeId,
        status: statusFilter,
        startDate,
        endDate,
        search: searchQuery,
        pageSize: 100,
      });
      setIsLoading(false);
      if (res.ok && res.data) {
        setTimesheets(res.data.items);
        setTotalCount(res.data.totalCount);
      } else {
        setFeedback({ message: res.message || "Failed to load timesheets.", ok: false });
      }
    } else {
      const res = await getSuperAdminLeaveRequestsAction({
        companyId,
        employeeId: selectedEmployeeId,
        status: statusFilter,
        startDate,
        endDate,
        search: searchQuery,
        pageSize: 100,
      });
      setIsLoading(false);
      if (res.ok && res.data) {
        setLeaveRequests(res.data.items);
        setTotalCount(res.data.totalCount);
      } else {
        setFeedback({ message: res.message || "Failed to load leave requests.", ok: false });
      }
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedEmployeeId, statusFilter, dateRangeFilter]);

  // Toggle selection
  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentItems = activeTab === "timesheets" ? timesheets : leaveRequests;
  const allSelected = currentItems.length > 0 && currentItems.every((it) => selectedIds.has(it.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentItems.map((it) => it.id)));
    }
  };

  // Perform bulk action
  const handleBatchAction = (status: "approved" | "rejected") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    startTransition(async () => {
      if (activeTab === "timesheets") {
        const res = await superAdminSetTimesheetsStatusAction({
          companyId,
          timeEntryIds: ids,
          status,
          notes: batchNote.trim() || undefined,
        });
        setFeedback({ message: res.message, ok: res.ok });
        if (res.ok) {
          setBatchNote("");
          await loadData(true);
        }
      } else {
        const res = await superAdminSetLeaveRequestStatusAction({
          companyId,
          leaveRequestIds: ids,
          status,
          notes: batchNote.trim() || undefined,
        });
        setFeedback({ message: res.message, ok: res.ok });
        if (res.ok) {
          setBatchNote("");
          await loadData(true);
        }
      }
    });
  };

  // Perform single row action
  const handleSingleAction = (id: string, status: "approved" | "rejected") => {
    startTransition(async () => {
      if (activeTab === "timesheets") {
        const res = await superAdminSetTimesheetsStatusAction({
          companyId,
          timeEntryIds: [id],
          status,
          notes: "Super Admin direct review",
        });
        setFeedback({ message: res.message, ok: res.ok });
        if (res.ok) await loadData(true);
      } else {
        const res = await superAdminSetLeaveRequestStatusAction({
          companyId,
          leaveRequestIds: [id],
          status,
          notes: "Super Admin direct review",
        });
        setFeedback({ message: res.message, ok: res.ok });
        if (res.ok) await loadData(true);
      }
    });
  };

  return (
    <section className="rounded-3xl border border-primary/30 bg-surface shadow-soft overflow-hidden transition-all">
      {/* Super Admin Banner Header */}
      <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-transparent p-5 sm:p-6 border-b border-primary/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary text-white shadow-soft">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/20 text-primary border border-primary/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
                  Super Admin Override
                </span>
                <span className="text-xs font-semibold text-muted">{companyName}</span>
              </div>
              <h2 className="mt-0.5 text-lg sm:text-xl font-extrabold text-foreground">
                Approval &amp; Status Override Control
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Directly mark any employee&apos;s timesheet shifts or leave requests as{" "}
                <span className="font-bold text-emerald-700">Approved</span> or{" "}
                <span className="font-bold text-rose-700">Rejected</span> without workstation locks.
              </p>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="inline-flex rounded-2xl border border-border bg-background p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab("timesheets")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "timesheets"
                  ? "bg-primary text-white shadow-soft"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Clock className="size-3.5" />
              <span>Timesheets &amp; Shifts</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("leave")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "leave"
                  ? "bg-primary text-white shadow-soft"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Calendar className="size-3.5" />
              <span>Leave Requests</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Employee Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted uppercase">Employee</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
            >
              <option value="all">All Employees ({employees.length})</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted uppercase">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted (Pending Review)</option>
              <option value="draft">Draft (Unclocked / Unsubmitted)</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted uppercase">Date Range</label>
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value as any)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
            >
              <option value="all">All Recorded Dates</option>
              <option value="30d">Last 30 Days</option>
              <option value="60d">Last 60 Days</option>
            </select>
          </div>

          {/* Quick Search */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-muted uppercase">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-3.5 text-muted" />
              <input
                type="text"
                placeholder="Search name, notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") loadData();
                }}
                className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback ? (
          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold shadow-soft ${
              feedback.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : "border-rose-300 bg-rose-50 text-rose-950"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-rose-600" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-muted hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {/* Bulk Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface-muted/40 p-3.5 shadow-2xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={currentItems.length === 0}
                className="size-4 rounded accent-primary cursor-pointer"
              />
              <span>Select All</span>
            </label>
            <span className="rounded-full bg-surface border border-border px-2.5 py-0.5 text-xs font-extrabold text-foreground shadow-2xs">
              {selectedIds.size} of {currentItems.length} selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Add optional review note..."
              value={batchNote}
              onChange={(e) => setBatchNote(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted outline-none focus:border-primary shadow-2xs sm:w-64"
            />
            <button
              type="button"
              onClick={() => handleBatchAction("rejected")}
              disabled={isPending || selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors cursor-pointer shadow-soft"
            >
              <XCircle className="size-4 shrink-0" />
              <span>Mark Rejected</span>
            </button>
            <button
              type="button"
              onClick={() => handleBatchAction("approved")}
              disabled={isPending || selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer shadow-soft"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              <span>Mark Approved</span>
            </button>
            <button
              type="button"
              onClick={() => loadData()}
              disabled={isLoading || isPending}
              className="grid size-8 place-items-center rounded-full border border-border bg-surface text-muted hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer shadow-2xs"
              title="Refresh records"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin text-primary" : ""}`} />
            </button>
          </div>
        </div>

        {/* Content Table */}
        <div className="rounded-2xl border border-border bg-background overflow-hidden shadow-soft">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-xs font-semibold text-muted">
              <RefreshCw className="size-4 animate-spin text-primary" />
              <span>Loading records...</span>
            </div>
          ) : activeTab === "timesheets" ? (
            timesheets.length === 0 ? (
              <div className="py-16 text-center text-xs font-semibold text-muted">
                No timesheet shifts found matching your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/60 text-muted font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="size-4 rounded accent-primary cursor-pointer"
                        />
                      </th>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Work Date</th>
                      <th className="p-3">Clock In / Out</th>
                      <th className="p-3">Paid Hours</th>
                      <th className="p-3">Workstation</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {timesheets.map((ts) => {
                      const isSelected = selectedIds.has(ts.id);
                      return (
                        <tr
                          key={ts.id}
                          className={`hover:bg-surface-muted/40 transition-colors ${
                            isSelected ? "bg-primary/[0.04]" : ""
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectId(ts.id)}
                              className="size-4 rounded accent-primary cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <EmployeeAvatar
                                src={ts.avatar_url}
                                name={ts.employee_name}
                                className="size-8"
                              />
                              <div>
                                <p className="font-bold text-foreground">{ts.employee_name}</p>
                                <p className="text-[10px] text-muted">{ts.employee_number}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-semibold text-foreground">
                            {ts.work_date}
                          </td>
                          <td className="p-3 text-muted">
                            {ts.clock_in ? (
                              <span>
                                {ts.clock_in} &rarr; {ts.clock_out || "--:--"}
                              </span>
                            ) : (
                              <span className="italic text-muted/70">No punches</span>
                            )}
                          </td>
                          <td className="p-3 font-bold text-foreground">
                            {ts.paid_hours != null ? `${ts.paid_hours.toFixed(2)}h` : "0.00h"}
                            {ts.overtime_hours != null && ts.overtime_hours > 0 ? (
                              <span className="ml-1 text-[10px] font-semibold text-emerald-600">
                                (+{ts.overtime_hours.toFixed(2)} OT)
                              </span>
                            ) : null}
                          </td>
                          <td className="p-3 text-muted">
                            {ts.workstation_name || "—"}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                                ts.status === "approved"
                                  ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                  : ts.status === "rejected"
                                  ? "bg-rose-100 text-rose-900 border border-rose-300"
                                  : ts.status === "submitted"
                                  ? "bg-sky-100 text-sky-900 border border-sky-300"
                                  : "bg-amber-100 text-amber-900 border border-amber-300"
                              }`}
                            >
                              {ts.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {ts.status !== "approved" ? (
                                <button
                                  type="button"
                                  onClick={() => handleSingleAction(ts.id, "approved")}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 px-2.5 py-1 text-[11px] font-bold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer shadow-2xs"
                                  title="Approve this timesheet"
                                >
                                  <Check className="size-3" />
                                  <span>Approve</span>
                                </button>
                              ) : null}
                              {ts.status !== "rejected" ? (
                                <button
                                  type="button"
                                  onClick={() => handleSingleAction(ts.id, "rejected")}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-300 px-2.5 py-1 text-[11px] font-bold hover:bg-rose-100 disabled:opacity-50 cursor-pointer shadow-2xs"
                                  title="Reject this timesheet"
                                >
                                  <X className="size-3" />
                                  <span>Reject</span>
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : leaveRequests.length === 0 ? (
            <div className="py-16 text-center text-xs font-semibold text-muted">
              No leave requests found matching your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/60 text-muted font-bold uppercase text-[10px] tracking-wider">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="size-4 rounded accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Leave Type</th>
                    <th className="p-3">Dates</th>
                    <th className="p-3">Total Hours</th>
                    <th className="p-3">Reason / Notes</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {leaveRequests.map((lr) => {
                    const isSelected = selectedIds.has(lr.id);
                    return (
                      <tr
                        key={lr.id}
                        className={`hover:bg-surface-muted/40 transition-colors ${
                          isSelected ? "bg-primary/[0.04]" : ""
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectId(lr.id)}
                            className="size-4 rounded accent-primary cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <EmployeeAvatar
                              src={lr.avatar_url}
                              name={lr.employee_name}
                              className="size-8"
                            />
                            <div>
                              <p className="font-bold text-foreground">{lr.employee_name}</p>
                              <p className="text-[10px] text-muted">{lr.employee_number}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 font-semibold text-foreground">
                          {lr.leave_type_name}
                        </td>
                        <td className="p-3 text-muted">
                          {lr.start_date === lr.end_date ? (
                            lr.start_date
                          ) : (
                            <span>
                              {lr.start_date} &rarr; {lr.end_date}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-bold text-foreground">
                          {lr.total_hours.toFixed(1)}h
                        </td>
                        <td className="p-3 max-w-[200px] truncate text-muted" title={lr.reason || ""}>
                          {lr.reason || "—"}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                              lr.status === "approved"
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                : lr.status === "rejected"
                                ? "bg-rose-100 text-rose-900 border border-rose-300"
                                : lr.status === "submitted"
                                ? "bg-sky-100 text-sky-900 border border-sky-300"
                                : "bg-amber-100 text-amber-900 border border-amber-300"
                            }`}
                          >
                            {lr.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {lr.status !== "approved" ? (
                              <button
                                type="button"
                                onClick={() => handleSingleAction(lr.id, "approved")}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 px-2.5 py-1 text-[11px] font-bold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer shadow-2xs"
                                title="Approve this leave request"
                              >
                                <Check className="size-3" />
                                <span>Approve</span>
                              </button>
                            ) : null}
                            {lr.status !== "rejected" ? (
                              <button
                                type="button"
                                onClick={() => handleSingleAction(lr.id, "rejected")}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-300 px-2.5 py-1 text-[11px] font-bold hover:bg-rose-100 disabled:opacity-50 cursor-pointer shadow-2xs"
                                title="Reject this leave request"
                              >
                                <X className="size-3" />
                                <span>Reject</span>
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
