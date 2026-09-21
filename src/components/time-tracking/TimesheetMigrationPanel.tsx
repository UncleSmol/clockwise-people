"use client";

import { useState, useTransition, type ChangeEvent, type DragEvent } from "react";
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Coffee,
  MapPin,
  RefreshCw,
  Search,
  Check,
} from "lucide-react";
import {
  previewTimesheetMigration,
  executeTimesheetMigration,
  type MigrationPreviewResponse,
} from "@/lib/time-tracking/migration-actions";

import UniversalSpreadsheetImporter from "@/components/import-export/UniversalSpreadsheetImporter";

type FilterTab = "all" | "work" | "leave" | "warnings";
type ImportMode = "universal" | "template";

export default function TimesheetMigrationPanel() {
  const [importMode, setImportMode] = useState<ImportMode>("universal");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<MigrationPreviewResponse | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [updateLeaveBalances, setUpdateLeaveBalances] = useState(true);
  const [autoProvisionLeaveTypes, setAutoProvisionLeaveTypes] = useState(true);

  const [isPendingPreview, startPreviewTransition] = useTransition();
  const [isPendingExecute, startExecuteTransition] = useTransition();
  const [executionResult, setExecutionResult] = useState<{
    ok: boolean;
    message: string;
    totalProcessed?: number;
    importedShifts?: number;
    importedLeaves?: number;
  } | null>(null);

  const handleFileChange = (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setExecutionResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    startPreviewTransition(async () => {
      const res = await previewTimesheetMigration(formData);
      setPreviewData(res);
    });
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileChange(f);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileChange(f);
  };

  const handleExecute = () => {
    if (!previewData?.entries || previewData.entries.length === 0) return;

    startExecuteTransition(async () => {
      const res = await executeTimesheetMigration({
        entries: previewData.entries!,
        skipExisting,
        updateLeaveBalances,
        autoProvisionLeaveTypes,
      });
      setExecutionResult(res);
    });
  };

  const entries = previewData?.entries || [];
  const diagnostics = previewData?.diagnostics;

  // Filter entries
  const filteredEntries = entries.filter((entry) => {
    // Tab filter
    if (activeTab === "work" && entry.entryType !== "work") return false;
    if (activeTab === "leave" && entry.entryType !== "leave") return false;
    if (activeTab === "warnings" && entry.validationStatus === "valid") return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const emp = (entry.matchedEmployeeName || entry.employeeIdentifier || "").toLowerCase();
      const date = entry.workDate.toLowerCase();
      const ws = (entry.workstationName || "").toLowerCase();
      const lt = (entry.leaveTypeName || "").toLowerCase();
      const notes = (entry.notes || "").toLowerCase();
      return (
        emp.includes(q) ||
        date.includes(q) ||
        ws.includes(q) ||
        lt.includes(q) ||
        notes.includes(q)
      );
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Importer Mode Toggle Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-surface border border-border rounded-2xl shadow-xs">
        <button
          onClick={() => setImportMode("universal")}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            importMode === "universal"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          <FileSpreadsheet className="size-4" />
          Versatile Importer (Map Any Spreadsheet)
        </button>
        <button
          onClick={() => setImportMode("template")}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            importMode === "template"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted hover:text-foreground hover:bg-surface-muted"
          }`}
        >
          <Download className="size-4" />
          Standard Template Importer
        </button>
      </div>

      {importMode === "universal" ? (
        <UniversalSpreadsheetImporter />
      ) : (
        <>
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-4 sm:p-6 rounded-2xl border border-border shadow-xs">
            <div>
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="size-5 text-emerald-600" />
                ClockWise Fixed Template Migration
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-muted">
                Import shifts using the pre-formatted ClockWise Excel template or QuickBooks export.
              </p>
            </div>
            <a
              href="/api/timesheet-template/download"
              download="clockwise_timesheets_template.xlsx"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-foreground bg-surface-muted hover:bg-border/40 border border-border rounded-xl shadow-2xs transition-colors shrink-0"
            >
              <Download className="size-4 text-emerald-600" />
              Download Excel Template
            </a>
          </div>

          {/* Upload Zone */}
      {!previewData && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-2xl transition-all ${
            isDragging
              ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
              : "border-border hover:border-slate-600 bg-surface/50"
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isPendingPreview}
          />
          <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 mb-4">
            <Upload className="size-8" />
          </div>
          <p className="text-base font-semibold text-foreground text-center">
            {isPendingPreview ? "Analyzing spreadsheet..." : "Drag & drop your timesheet spreadsheet here"}
          </p>
          <p className="text-xs text-muted mt-1 text-center max-w-md">
            Supports ClockWise standard templates and QuickBooks Time / TSheets exports. Accepts .xlsx, .xls, and .csv.
          </p>
          <button
            type="button"
            className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            disabled={isPendingPreview}
          >
            {isPendingPreview ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin" />
                Parsing Rows...
              </span>
            ) : (
              "Browse File"
            )}
          </button>
        </div>
      )}

      {/* Error Banner if Preview Failed */}
      {previewData && !previewData.ok && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 flex items-start gap-3">
          <XCircle className="size-5 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-danger">Failed to parse spreadsheet</h4>
            <p className="text-xs text-danger/90 mt-1">{previewData.message}</p>
            <button
              onClick={() => {
                setPreviewData(null);
                setFile(null);
              }}
              className="mt-3 px-3 py-1 text-xs font-medium bg-danger/20 text-danger rounded-md hover:bg-danger/30"
            >
              Try another file
            </button>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {previewData && previewData.ok && diagnostics && (
        <div className="space-y-6">
          {/* Format & Top KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-surface p-3.5">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Total Rows</span>
              <p className="text-xl font-bold text-foreground mt-0.5">{diagnostics.distinctDatesCount} days</p>
              <p className="text-[11px] text-muted mt-0.5">{diagnostics.totalRowsRead} entries total</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3.5">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Work Shifts</span>
              <p className="text-xl font-bold text-emerald-500 mt-0.5">{diagnostics.workShiftsCount}</p>
              <p className="text-[11px] text-muted mt-0.5">Clock in/out shifts</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3.5">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Leave Days</span>
              <p className="text-xl font-bold text-sky-500 mt-0.5">{diagnostics.leaveDaysCount}</p>
              <p className="text-[11px] text-muted mt-0.5">Annual, sick &amp; holidays</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3.5">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Matched Staff</span>
              <p className="text-xl font-bold text-foreground mt-0.5">{diagnostics.matchedEmployeesCount}</p>
              <p className="text-[11px] text-muted mt-0.5">Company employees</p>
            </div>
          </div>

          {/* Format Badge Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-2.5">
              <div className="size-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <span className="text-xs font-semibold text-emerald-400">
                  Detected Format: {diagnostics.formatDescription}
                </span>
                <p className="text-[11px] text-muted">
                  File: <span className="font-mono text-foreground">{file?.name}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setPreviewData(null);
                setFile(null);
                setExecutionResult(null);
              }}
              className="text-xs text-muted hover:text-foreground underline"
            >
              Choose different file
            </button>
          </div>

          {/* Diagnostics warnings if any */}
          {(diagnostics.unmatchedEmployees.length > 0 ||
            diagnostics.unmatchedWorkstations.length > 0 ||
            diagnostics.unmatchedLeaveTypes.length > 0) && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <AlertTriangle className="size-4 shrink-0" />
                <span>Diagnostics &amp; Reconciliation Notice</span>
              </div>
              <ul className="text-xs text-muted space-y-1 pl-6 list-disc">
                {diagnostics.unmatchedEmployees.length > 0 && (
                  <li>
                    <span className="font-medium text-amber-300">Unmatched employees:</span>{" "}
                    {diagnostics.unmatchedEmployees.join(", ")} (these rows will be skipped unless created first).
                  </li>
                )}
                {diagnostics.unmatchedWorkstations.length > 0 && (
                  <li>
                    <span className="font-medium text-amber-300">Unmatched workstations:</span>{" "}
                    {diagnostics.unmatchedWorkstations.join(", ")} (will automatically fallback to employee assigned workstation).
                  </li>
                )}
                {diagnostics.unmatchedLeaveTypes.length > 0 && (
                  <li>
                    <span className="font-medium text-amber-300">New leave types:</span>{" "}
                    {diagnostics.unmatchedLeaveTypes.join(", ")} (will be auto-provisioned under company leave policies).
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Table Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1.5 p-1 bg-surface-muted rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === "all"
                    ? "bg-emerald-600 text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                All Records ({entries.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("work")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === "work"
                    ? "bg-emerald-600 text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Shifts ({diagnostics.workShiftsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("leave")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === "leave"
                    ? "bg-emerald-600 text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Leave ({diagnostics.leaveDaysCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("warnings")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === "warnings"
                    ? "bg-amber-600 text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Warnings ({diagnostics.warningEntriesCount + diagnostics.errorEntriesCount})
              </button>
            </div>

            <div className="flex w-full sm:w-64 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs text-foreground focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-colors">
              <Search className="size-3.5 shrink-0 text-muted" />
              <input
                type="text"
                placeholder="Search date, staff, workstation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted outline-none border-0 p-0"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="shrink-0 text-xs font-bold text-muted hover:text-foreground px-0.5"
                  title="Clear search"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          {/* Interactive Preview Table */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xs">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-muted text-muted font-extrabold uppercase text-[10px] sticky top-0 z-10 border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Times / Leave</th>
                    <th className="py-2.5 px-3">Workstation</th>
                    <th className="py-2.5 px-3">Notes / Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted text-xs">
                        No records match the active filter or search query.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry) => (
                      <tr
                        key={entry.rowId}
                        className={`hover:bg-surface-muted/50 transition-colors ${
                          entry.validationStatus === "error"
                            ? "bg-danger/5"
                            : entry.validationStatus === "warning"
                            ? "bg-amber-500/5"
                            : ""
                        }`}
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {entry.validationStatus === "valid" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="size-3.5" />
                              Valid
                            </span>
                          ) : entry.validationStatus === "warning" ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"
                              title={entry.warningFlags?.join("\n")}
                            >
                              <AlertTriangle className="size-3.5" />
                              Notice
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20"
                              title={entry.validationErrors?.join("\n")}
                            >
                              <XCircle className="size-3.5" />
                              Error
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono text-foreground font-medium">
                          {entry.workDate}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="font-semibold text-foreground">
                            {entry.matchedEmployeeName || entry.employeeName || "Unassigned"}
                          </div>
                          <div className="text-[10px] text-muted font-mono">{entry.employeeIdentifier}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {entry.entryType === "work" ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700">
                              Shift
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700">
                              Leave
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {entry.entryType === "work" ? (
                            <div className="space-y-0.5">
                              <div className="font-mono text-foreground">
                                {entry.clockIn} - {entry.clockOut}
                              </div>
                              {entry.lunchStart && entry.lunchEnd && (
                                <div className="text-[10px] text-muted flex items-center gap-1">
                                  <Coffee className="size-3" />
                                  Lunch: {entry.lunchStart} - {entry.lunchEnd}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-sky-700">{entry.leaveTypeName}</div>
                              <div className="text-[10px] text-muted">{entry.leaveHours} hrs (Paid)</div>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="text-muted flex items-center gap-1">
                            <MapPin className="size-3 shrink-0 text-muted" />
                            {entry.workstationName || "Company Assigned"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-muted max-w-xs truncate" title={entry.notes || ""}>
                          {entry.notes || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-border bg-surface-muted/50 flex items-center justify-between text-[11px] text-muted font-semibold">
              <span>Showing {filteredEntries.length} of {entries.length} entries</span>
              <span>Review items before committing to database</span>
            </div>
          </div>

          {/* Migration Execution Controls */}
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6 space-y-4">
            <h4 className="text-sm font-bold text-foreground">Import Preferences &amp; Conflict Resolution</h4>
            
            <div className="grid sm:grid-cols-3 gap-4 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-lg border border-border hover:bg-surface-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={skipExisting}
                  onChange={(e) => setSkipExisting(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-semibold text-foreground">Skip Existing Dates</span>
                  <p className="text-muted mt-0.5">Do not overwrite shifts or leaves that already exist on that date.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-lg border border-border hover:bg-surface-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={updateLeaveBalances}
                  onChange={(e) => setUpdateLeaveBalances(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-semibold text-foreground">Update Leave Balances</span>
                  <p className="text-muted mt-0.5">Automatically deduct taken leave hours from employee leave balances.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-lg border border-border hover:bg-surface-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={autoProvisionLeaveTypes}
                  onChange={(e) => setAutoProvisionLeaveTypes(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-semibold text-foreground">Auto-Provision Leave</span>
                  <p className="text-muted mt-0.5">Create missing standard company leave categories automatically.</p>
                </div>
              </label>
            </div>

            {/* Execution Result Banner */}
            {executionResult && (
              <div
                className={`rounded-xl p-4 border flex items-start gap-3 ${
                  executionResult.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-danger/30 bg-danger/10 text-danger"
                }`}
              >
                {executionResult.ok ? (
                  <CheckCircle2 className="size-5 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <XCircle className="size-5 shrink-0 mt-0.5 text-danger" />
                )}
                <div className="flex-1">
                  <h5 className="font-semibold text-sm">
                    {executionResult.ok ? "Migration Completed Successfully" : "Migration Execution Failed"}
                  </h5>
                  <p className="text-xs mt-1 text-muted-foreground">{executionResult.message}</p>
                </div>
              </div>
            )}

            {/* Execute Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-border">
              <p className="text-xs text-muted">
                Ready to import <span className="font-semibold text-foreground">{diagnostics.validEntriesCount + diagnostics.warningEntriesCount} valid records</span> into Supabase.
              </p>
              <button
                type="button"
                onClick={handleExecute}
                disabled={isPendingExecute || (diagnostics.validEntriesCount + diagnostics.warningEntriesCount === 0)}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-sm transition-colors"
              >
                {isPendingExecute ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Migrating Records...
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    Execute Timesheet Migration
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
