"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Database,
  Building2,
  Search,
  RefreshCw,
  Trash2,
  Edit2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  MapPin,
  ShieldAlert,
  FileSpreadsheet,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Coins,
} from "lucide-react";
import {
  getCompanyDatabaseRowsAction,
  updateDatabaseRowAction,
  deleteDatabaseRowAction,
  insertDatabaseRowAction,
  clearCompanyTimesheetsAndLeaveAction,
  executeTalaneMigrationAction,
  type SupportedDatabaseTable,
} from "@/lib/sysadmin/database-maintenance-actions";
import type { SysAdminCompanyOverview } from "@/lib/sysadmin/schema";
import AccrualMaintenanceModal from "./AccrualMaintenanceModal";

type SuperAdminDatabaseMaintenancePanelProps = {
  companies: SysAdminCompanyOverview[];
  initialCompanyId: string;
};

export default function SuperAdminDatabaseMaintenancePanel({
  companies,
  initialCompanyId,
}: SuperAdminDatabaseMaintenancePanelProps) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(initialCompanyId);
  const [activeTable, setActiveTable] = useState<SupportedDatabaseTable>("time_entries");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const [isPending, startTransition] = useTransition();

  // Modals state
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [isNewRowModalOpen, setIsNewRowModalOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, unknown>>({});
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState("");
  const [isAccrualModalOpen, setIsAccrualModalOpen] = useState(false);
  const [accrualInitialEmployeeId, setAccrualInitialEmployeeId] = useState<string | undefined>(undefined);
  const [accrualInitialLeaveTypeId, setAccrualInitialLeaveTypeId] = useState<string | undefined>(undefined);

  const openAccrualModal = (empId?: string, leaveTypeId?: string) => {
    setAccrualInitialEmployeeId(empId);
    setAccrualInitialLeaveTypeId(leaveTypeId);
    setIsAccrualModalOpen(true);
  };

  const currentCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0];

  // Load rows when company, table, page, or search changes
  const loadRows = async (preserveStatus = false) => {
    if (!selectedCompanyId) return;
    setIsLoading(true);
    if (!preserveStatus) {
      setStatusMessage(null);
    }

    const res = await getCompanyDatabaseRowsAction({
      companyId: selectedCompanyId,
      table: activeTable,
      page,
      pageSize,
      search: searchQuery,
    });

    setIsLoading(false);
    if (res.ok && res.data) {
      setRows(res.data.rows);
      setTotalCount(res.data.totalCount);
    } else {
      setStatusMessage({ text: res.message || "Failed to load records.", isError: true });
    }
  };

  useEffect(() => {
    loadRows(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId, activeTable, page, pageSize]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadRows();
  };

  const handleSaveEdit = async () => {
    if (!editingRow || !selectedCompanyId) return;
    startTransition(async () => {
      const rowId = editingRow.id as string;
      const res = await updateDatabaseRowAction({
        companyId: selectedCompanyId,
        table: activeTable,
        rowId,
        values: editingRow,
      });

      if (res.ok) {
        setStatusMessage({ text: "Record updated directly in database." });
        setEditingRow(null);
        loadRows(true);
      } else {
        setStatusMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleDeleteRow = async (rowId: string) => {
    if (!confirm("Are you sure you want to delete this row permanently from the database?")) return;
    startTransition(async () => {
      const res = await deleteDatabaseRowAction({
        companyId: selectedCompanyId,
        table: activeTable,
        rowId,
      });

      if (res.ok) {
        setStatusMessage({ text: "Record permanently removed from database." });
        loadRows(true);
      } else {
        setStatusMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleCreateRow = async () => {
    if (!selectedCompanyId) return;
    startTransition(async () => {
      const res = await insertDatabaseRowAction({
        companyId: selectedCompanyId,
        table: activeTable,
        values: newRowData,
      });

      if (res.ok) {
        setStatusMessage({ text: "New record created directly in database." });
        setIsNewRowModalOpen(false);
        setNewRowData({});
        loadRows();
      } else {
        setStatusMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleClearAll = async () => {
    if (clearConfirmationText !== "CLEAR ALL") {
      alert("Please type 'CLEAR ALL' to confirm deletion.");
      return;
    }
    startTransition(async () => {
      const res = await clearCompanyTimesheetsAndLeaveAction(selectedCompanyId);
      setIsClearModalOpen(false);
      setClearConfirmationText("");
      if (res.ok) {
        setStatusMessage({ text: res.message });
        loadRows();
      } else {
        setStatusMessage({ text: res.message, isError: true });
      }
    });
  };

  const handleRunTalaneMigration = async () => {
    if (!confirm("This will upload the migration sheet directly into Talane and Associates. Proceed?")) return;
    startTransition(async () => {
      const res = await executeTalaneMigrationAction(selectedCompanyId);
      if (res.ok) {
        setStatusMessage({ text: res.message });
        loadRows();
      } else {
        setStatusMessage({ text: res.message, isError: true });
      }
    });
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="space-y-5">
      {/* Top Header & Company Selector Bar */}
      <div className="rounded-2xl border border-border/80 bg-surface p-4 sm:p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-soft">
              <Database className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">Super Admin Database Maintenance Console</h2>
                <span className="rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase text-primary">
                  Direct Live Database Access
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Maintain, inspect, and modify database records across company tenants with full administrative authority.
              </p>
            </div>
          </div>

          {/* Company Picker Dropdown */}
          <div className="flex items-center gap-2 bg-surface-muted/60 p-2 rounded-xl border border-border">
            <Building2 className="size-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-muted shrink-0">Company:</span>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-extrabold text-foreground shadow-2xs focus:border-primary focus:outline-none cursor-pointer min-w-[200px]"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.id === initialCompanyId ? "(Active)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Message Banner */}
        {statusMessage && (
          <div
            className={`mt-4 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
              statusMessage.isError
                ? "border-rose-500/30 bg-rose-500/10 text-rose-700"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.isError ? (
                <AlertTriangle className="size-4 shrink-0" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Company Quick Actions & Migration Tools */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3.5">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>
              Target ID: <code className="font-mono text-foreground font-bold text-[11px]">{selectedCompanyId}</code>
            </span>
            <span>·</span>
            <span>
              Tenant: <strong className="text-foreground">{currentCompany?.name}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Top Up / Overwrite Employee Leave Accruals */}
            <button
              type="button"
              disabled={isPending}
              onClick={() => openAccrualModal()}
              className="flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-600/15 px-3.5 py-1.5 text-xs font-extrabold text-emerald-800 dark:text-emerald-300 shadow-2xs hover:bg-emerald-600/25 transition-all disabled:opacity-50 cursor-pointer"
              title="Top up or overwrite employee leave accruals for this company"
            >
              <Coins className="size-3.5" />
              <span>Top Up / Overwrite Accruals</span>
            </button>

            {/* Run Migration Sheet Button for Talane */}
            {selectedCompanyId === "be6a1fb3-2cac-4cf8-b01b-b1339ee07095" && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleRunTalaneMigration}
                className="flex items-center gap-1.5 rounded-full bg-emerald-700 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-soft hover:bg-emerald-800 transition-all disabled:opacity-50 cursor-pointer"
                title="Upload migration sheet directly from workforce-clockins/Talane & Associates"
              >
                <FileSpreadsheet className="size-3.5" />
                <span>Upload Migration Sheet (Talane)</span>
              </button>
            )}

            {/* Clear Timesheets & Leave button */}
            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsClearModalOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-500/20 transition-all disabled:opacity-50 cursor-pointer"
              title="Clear all timesheets and leave records for this company"
            >
              <Trash2 className="size-3.5" />
              <span>Clear Timesheets &amp; Leave</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNewRowData({});
                setIsNewRowModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-extrabold text-white shadow-soft hover:bg-primary-hover transition-all cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Add Record</span>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => loadRows(false)}
              className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground shadow-2xs hover:bg-surface-muted transition-colors cursor-pointer"
              title="Refresh records"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin text-primary" : "text-muted"}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table Selection Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 pb-2">
        {[
          { key: "time_entries", label: "Timesheets (time_entries)", icon: Clock },
          { key: "leave_requests", label: "Leave Requests (leave_requests)", icon: Calendar },
          { key: "leave_balances", label: "Leave Accruals (leave_balances)", icon: Coins },
          { key: "employees", label: "Employees (employees)", icon: User },
          { key: "company_workstations", label: "Workstations (company_workstations)", icon: MapPin },
          { key: "leave_types", label: "Leave Types (leave_types)", icon: Filter },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTable === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTable(tab.key as SupportedDatabaseTable);
                setPage(1);
                setSearchQuery("");
              }}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all cursor-pointer ${
                isActive
                  ? "bg-primary text-white shadow-soft"
                  : "bg-surface text-muted hover:text-foreground border border-border hover:bg-surface-muted"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter & Pagination Controls Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-surface p-3 rounded-xl border border-border shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder={`Search ${activeTable}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer shadow-2xs"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span>
            Total: <strong className="text-foreground">{totalCount}</strong> records
          </span>
          <div className="flex items-center gap-1.5">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-border bg-background px-2 py-1 text-xs font-bold text-foreground cursor-pointer"
            >
              {[25, 50, 100, 200].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Pagination buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded border border-border bg-background disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="text-[11px] font-bold">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded border border-border bg-background disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Database Table Container */}
      <div className="rounded-2xl border border-border bg-surface shadow-soft overflow-hidden">
        <div className="overflow-x-auto min-w-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-muted/50 text-[10px] uppercase font-bold text-muted">
                <th className="px-3 py-2.5">Actions</th>
                {activeTable === "time_entries" && (
                  <>
                    <th className="px-2 py-2.5">Date</th>
                    <th className="px-2 py-2.5">Employee</th>
                    <th className="px-2 py-2.5">In</th>
                    <th className="px-2 py-2.5">Lunch</th>
                    <th className="px-2 py-2.5">Out</th>
                    <th className="px-2 py-2.5 text-right">Normal</th>
                    <th className="px-2 py-2.5 text-right">OT</th>
                    <th className="px-2 py-2.5 text-right">Paid</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-2 py-2.5">Workstation</th>
                    <th className="px-3 py-2.5">Notes</th>
                  </>
                )}
                {activeTable === "leave_requests" && (
                  <>
                    <th className="px-2 py-2.5">Employee</th>
                    <th className="px-2 py-2.5">Leave Type</th>
                    <th className="px-2 py-2.5">Start Date</th>
                    <th className="px-2 py-2.5">End Date</th>
                    <th className="px-2 py-2.5 text-right">Hours</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Reason / Notes</th>
                  </>
                )}
                {activeTable === "leave_balances" && (
                  <>
                    <th className="px-2 py-2.5">Employee</th>
                    <th className="px-2 py-2.5">Leave Type</th>
                    <th className="px-2 py-2.5 text-right">Available Balance</th>
                    <th className="px-2 py-2.5 text-right">Accrued</th>
                    <th className="px-2 py-2.5 text-right">Taken</th>
                    <th className="px-2 py-2.5 text-right">Adjusted</th>
                    <th className="px-3 py-2.5">As Of Date</th>
                  </>
                )}
                {activeTable === "employees" && (
                  <>
                    <th className="px-2 py-2.5">Full Name</th>
                    <th className="px-2 py-2.5">Email</th>
                    <th className="px-2 py-2.5">Emp #</th>
                    <th className="px-2 py-2.5">Job Title</th>
                    <th className="px-2 py-2.5">Status</th>
                    <th className="px-2 py-2.5">Type</th>
                    <th className="px-2 py-2.5">Rate / Salary</th>
                  </>
                )}
                {activeTable === "company_workstations" && (
                  <>
                    <th className="px-2 py-2.5">Name</th>
                    <th className="px-2 py-2.5">Address</th>
                    <th className="px-2 py-2.5">Radius (m)</th>
                    <th className="px-2 py-2.5">Active</th>
                  </>
                )}
                {activeTable === "leave_types" && (
                  <>
                    <th className="px-2 py-2.5">Name</th>
                    <th className="px-2 py-2.5">Category</th>
                    <th className="px-2 py-2.5">Paid?</th>
                    <th className="px-2 py-2.5">Active</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-muted font-medium">
                    {isLoading ? "Querying database..." : "No records found in this table for the selected company."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={String(row.id)} className="hover:bg-surface-muted/40 transition-colors">
                    {/* Action buttons */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {(activeTable === "leave_balances" || activeTable === "employees") && (
                          <button
                            type="button"
                            onClick={() =>
                              openAccrualModal(
                                activeTable === "employees"
                                  ? String(row.id)
                                  : String(row.employee_id),
                                activeTable === "leave_balances"
                                  ? String(row.leave_type_id)
                                  : undefined,
                              )
                            }
                            className="p-1 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                            title="Top up or overwrite leave accruals for this employee"
                          >
                            <Coins className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingRow({ ...row })}
                          className="p-1 rounded text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                          title="Directly edit this database record"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(String(row.id))}
                          className="p-1 rounded text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Permanently delete this database record"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Columns for time_entries */}
                    {activeTable === "time_entries" && (
                      <>
                        <td className="px-2 py-2 font-mono font-bold whitespace-nowrap">{String(row.work_date || "")}</td>
                        <td className="px-2 py-2 truncate max-w-[150px] font-semibold">{String(row._employee_name || row.employee_id || "")}</td>
                        <td className="px-2 py-2 font-mono">{String(row.clock_in || "--:--")}</td>
                        <td className="px-2 py-2 font-mono text-muted text-[11px]">
                          {row.lunch_start && row.lunch_end ? `${row.lunch_start} - ${row.lunch_end}` : "--:--"}
                        </td>
                        <td className="px-2 py-2 font-mono">{String(row.clock_out || "--:--")}</td>
                        <td className="px-2 py-2 text-right font-mono">{Number(row.normal_hours || 0).toFixed(1)}h</td>
                        <td className="px-2 py-2 text-right font-mono text-amber-700 font-bold">{Number(row.overtime_hours || 0).toFixed(1)}h</td>
                        <td className="px-2 py-2 text-right font-mono text-primary font-black">{Number(row.paid_hours || 0).toFixed(1)}h</td>
                        <td className="px-2 py-2">
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-foreground border border-border">
                            {String(row.status || "")}
                          </span>
                        </td>
                        <td className="px-2 py-2 truncate max-w-[120px] text-muted">{String(row._workstation_name || "")}</td>
                        <td className="px-3 py-2 truncate max-w-[150px] text-muted text-[11px]">{String(row.notes || "")}</td>
                      </>
                    )}

                    {/* Columns for leave_requests */}
                    {activeTable === "leave_requests" && (
                      <>
                        <td className="px-2 py-2 font-semibold truncate max-w-[160px]">{String(row._employee_name || row.employee_id || "")}</td>
                        <td className="px-2 py-2 font-bold text-primary">{String(row._leave_type_name || row.leave_type_id || "")}</td>
                        <td className="px-2 py-2 font-mono">{String(row.start_date || "")}</td>
                        <td className="px-2 py-2 font-mono">{String(row.end_date || "")}</td>
                        <td className="px-2 py-2 text-right font-mono font-bold">{Number(row.total_hours || 0).toFixed(1)}h</td>
                        <td className="px-2 py-2">
                          <span className="rounded-full bg-emerald-500/10 text-primary px-2 py-0.5 text-[9.5px] font-bold uppercase">
                            {String(row.status || "")}
                          </span>
                        </td>
                        <td className="px-3 py-2 truncate max-w-[180px] text-muted">{String(row.reason || "")}</td>
                      </>
                    )}

                    {/* Columns for leave_balances */}
                    {activeTable === "leave_balances" && (
                      <>
                        <td className="px-2 py-2 font-semibold truncate max-w-[180px]">
                          {String(row._employee_name || row.employee_id || "")}
                        </td>
                        <td className="px-2 py-2 font-bold text-primary">
                          {String(row._leave_type_name || row.leave_type_id || "")}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-black text-emerald-700 dark:text-emerald-400">
                          {Number(row.balance_hours || 0).toFixed(2)}h{" "}
                          <span className="text-[10px] font-semibold text-muted">
                            ({(Number(row.balance_hours || 0) / 8).toFixed(1)}d)
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-semibold">
                          {Number(row.accrued_hours || 0).toFixed(2)}h
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-rose-600">
                          {Number(row.taken_hours || 0).toFixed(2)}h
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-muted">
                          {Number(row.adjusted_hours || 0) > 0 ? "+" : ""}
                          {Number(row.adjusted_hours || 0).toFixed(2)}h
                        </td>
                        <td className="px-3 py-2 font-mono text-muted">
                          {String(row.as_of_date || "--")}
                        </td>
                      </>
                    )}

                    {/* Columns for employees */}
                    {activeTable === "employees" && (
                      <>
                        <td className="px-2 py-2 font-bold">{String(row.full_name || "")}</td>
                        <td className="px-2 py-2 font-mono text-muted text-[11px]">{String(row.email || "--")}</td>
                        <td className="px-2 py-2 font-mono font-semibold">{String(row.employee_number || "--")}</td>
                        <td className="px-2 py-2">{String(row.job_title || "--")}</td>
                        <td className="px-2 py-2">
                          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[9.5px] font-bold uppercase">
                            {String(row.status || "active")}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-muted">{String(row.employment_type || "permanent")}</td>
                        <td className="px-2 py-2 font-mono">
                          {row.hourly_rate ? `R${row.hourly_rate}/h` : row.monthly_salary ? `R${row.monthly_salary}/m` : "--"}
                        </td>
                      </>
                    )}

                    {/* Columns for company_workstations */}
                    {activeTable === "company_workstations" && (
                      <>
                        <td className="px-2 py-2 font-bold text-foreground">{String(row.name || "")}</td>
                        <td className="px-2 py-2 text-muted truncate max-w-[240px]">{String(row.address || "")}</td>
                        <td className="px-2 py-2 font-mono">{String(row.radius_meters || 150)}m</td>
                        <td className="px-2 py-2 font-bold text-emerald-600">{row.is_active ? "Yes" : "No"}</td>
                      </>
                    )}

                    {/* Columns for leave_types */}
                    {activeTable === "leave_types" && (
                      <>
                        <td className="px-2 py-2 font-bold text-foreground">{String(row.name || "")}</td>
                        <td className="px-2 py-2 text-muted capitalize">{String(row.category || "")}</td>
                        <td className="px-2 py-2 font-bold text-emerald-600">{row.is_paid ? "Yes" : "No"}</td>
                        <td className="px-2 py-2 font-bold text-primary">{row.is_active ? "Active" : "Inactive"}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row Edit Modal */}
      {editingRow && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Direct Edit Record ({activeTable})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-muted hover:text-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-[11px] text-muted">
                Row ID: <code className="font-mono text-foreground font-bold">{editingRow.id as string}</code>
              </div>

              {Object.entries(editingRow).map(([key, val]) => {
                if (key.startsWith("_") || key === "id" || key === "company_id" || key === "created_at" || key === "updated_at") {
                  return null;
                }

                return (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted block">
                      {key.replace(/_/g, " ")}
                    </label>
                    <input
                      type="text"
                      value={val === null || val === undefined ? "" : String(val)}
                      onChange={(e) =>
                        setEditingRow((prev) => (prev ? { ...prev, [key]: e.target.value } : null))
                      }
                      className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-bold text-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveEdit}
                className="rounded-full bg-primary px-5 py-1.5 text-xs font-extrabold text-white shadow-soft hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
              >
                {isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Record Modal */}
      {isNewRowModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Plus className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Insert Record into {activeTable}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewRowModalOpen(false)}
                className="text-muted hover:text-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {activeTable === "time_entries" && (
                <>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted block">Work Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      value={String(newRowData["work_date"] || "")}
                      onChange={(e) => setNewRowData({ ...newRowData, work_date: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted block">Employee ID</label>
                    <input
                      type="text"
                      value={String(newRowData["employee_id"] || "")}
                      onChange={(e) => setNewRowData({ ...newRowData, employee_id: e.target.value })}
                      placeholder="UUID of employee"
                      className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted block">Clock In (HH:MM)</label>
                      <input
                        type="time"
                        value={String(newRowData["clock_in"] || "")}
                        onChange={(e) => setNewRowData({ ...newRowData, clock_in: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted block">Clock Out (HH:MM)</label>
                      <input
                        type="time"
                        value={String(newRowData["clock_out"] || "")}
                        onChange={(e) => setNewRowData({ ...newRowData, clock_out: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted block">Paid Hours</label>
                      <input
                        type="number"
                        step="0.1"
                        value={Number(newRowData["paid_hours"] || 8)}
                        onChange={(e) => setNewRowData({ ...newRowData, paid_hours: Number(e.target.value) })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted block">Normal</label>
                      <input
                        type="number"
                        step="0.1"
                        value={Number(newRowData["normal_hours"] || 8)}
                        onChange={(e) => setNewRowData({ ...newRowData, normal_hours: Number(e.target.value) })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-muted block">Overtime</label>
                      <input
                        type="number"
                        step="0.1"
                        value={Number(newRowData["overtime_hours"] || 0)}
                        onChange={(e) => setNewRowData({ ...newRowData, overtime_hours: Number(e.target.value) })}
                        className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted block">Status</label>
                    <select
                      value={String(newRowData["status"] || "approved")}
                      onChange={(e) => setNewRowData({ ...newRowData, status: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-3 py-1.5 text-xs"
                    >
                      <option value="approved">Approved</option>
                      <option value="submitted">Submitted</option>
                      <option value="draft">Draft</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </>
              )}

              {activeTable !== "time_entries" && (
                <div className="text-xs text-muted">
                  Fill in column fields directly below:
                  <textarea
                    rows={4}
                    placeholder='{"key": "value"}'
                    onChange={(e) => {
                      try {
                        setNewRowData(JSON.parse(e.target.value));
                      } catch {
                        // ignore until valid
                      }
                    }}
                    className="w-full mt-2 rounded-xl border border-border bg-background p-2.5 font-mono text-xs"
                  />
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setIsNewRowModalOpen(false)}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-bold text-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleCreateRow}
                className="rounded-full bg-primary px-5 py-1.5 text-xs font-extrabold text-white shadow-soft hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
              >
                {isPending ? "Creating..." : "Insert Record"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {isClearModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-rose-500/40 bg-surface p-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-rose-600">
              <ShieldAlert className="size-5" />
              <h3 className="text-base font-bold text-foreground">Danger Zone: Clear Timesheets &amp; Leave</h3>
            </div>
            <p className="mt-2 text-xs text-muted leading-relaxed">
              This will permanently delete all <strong className="text-foreground">time_entries</strong> and{" "}
              <strong className="text-foreground">leave_requests</strong> records for{" "}
              <strong className="text-foreground">{currentCompany?.name}</strong>.
            </p>
            <p className="mt-2 text-xs font-semibold text-rose-600">
              To proceed, please type <code className="bg-rose-500/10 px-1 py-0.5 rounded font-mono font-bold">CLEAR ALL</code> below:
            </p>
            <input
              type="text"
              value={clearConfirmationText}
              onChange={(e) => setClearConfirmationText(e.target.value)}
              placeholder="Type CLEAR ALL"
              className="mt-3 w-full rounded-xl border border-rose-300 dark:border-rose-900 bg-background px-3 py-2 text-xs font-mono font-bold text-foreground focus:border-rose-500 focus:outline-none"
            />

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsClearModalOpen(false);
                  setClearConfirmationText("");
                }}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-bold text-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || clearConfirmationText !== "CLEAR ALL"}
                onClick={handleClearAll}
                className="rounded-full bg-rose-600 px-5 py-1.5 text-xs font-extrabold text-white shadow-soft hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {isPending ? "Clearing Data..." : "Permanently Clear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Up & Overwrite Employee Leave Accruals Modal */}
      <AccrualMaintenanceModal
        isOpen={isAccrualModalOpen}
        companyId={selectedCompanyId}
        companyName={currentCompany?.name || "Selected Company"}
        initialEmployeeId={accrualInitialEmployeeId}
        initialLeaveTypeId={accrualInitialLeaveTypeId}
        onClose={() => setIsAccrualModalOpen(false)}
        onSuccess={(msg) => {
          setStatusMessage({ text: msg });
          if (activeTable === "leave_balances") {
            loadRows(true);
          } else {
            setActiveTable("leave_balances");
            setPage(1);
          }
        }}
      />
    </div>
  );
}

