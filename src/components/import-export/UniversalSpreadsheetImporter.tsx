"use client";

import { useState, useTransition, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Upload,
  Users,
  Clock,
  Palmtree,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Sparkles,
  Database,
  Sliders,
  Check,
  RotateCcw,
} from "lucide-react";
import {
  ENTITY_FIELD_DEFINITIONS,
  type ImportEntityType,
  type SpreadsheetInspectionResult,
} from "@/lib/import-export/universal-parser";
import {
  inspectSpreadsheetAction,
  previewMappedImportAction,
  executeMappedImportAction,
  type ImportPreviewResult,
  type ExecuteImportResult,
} from "@/lib/import-export/universal-actions";

import { provisionAllStandardLeaveTypesAction } from "@/lib/work-rules/actions";

type Step = "select" | "map" | "preview" | "result";
type TableFilter = "all" | "valid" | "warnings" | "errors";

export default function UniversalSpreadsheetImporter() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [targetEntity, setTargetEntity] = useState<ImportEntityType>("employees");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null);

  // Sheet & Mapping state
  const [inspectionData, setInspectionData] = useState<SpreadsheetInspectionResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});

  // Options
  const [skipExisting, setSkipExisting] = useState(true);
  const [autoCreateMissing, setAutoCreateMissing] = useState(true);

  // Preview data state
  const [previewResult, setPreviewResult] = useState<ImportPreviewResult | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>("all");

  // Final Execution state
  const [executionResult, setExecutionResult] = useState<ExecuteImportResult | null>(null);

  // Transitions
  const [isPendingInspect, startInspectTransition] = useTransition();
  const [isPendingPreview, startPreviewTransition] = useTransition();
  const [isPendingExecute, startExecuteTransition] = useTransition();
  const [isPendingProvision, startProvisionTransition] = useTransition();

  const handleProvisionAllLeaveTypes = () => {
    startProvisionTransition(async () => {
      const res = await provisionAllStandardLeaveTypesAction();
      setProvisionMessage(res.message);
      if (res.ok) {
        router.refresh();
      }
    });
  };

  // Handle file drop or selection
  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setExecutionResult(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    startInspectTransition(async () => {
      const res = await inspectSpreadsheetAction(formData, targetEntity);
      setInspectionData(res);
      if (res.ok) {
        setSelectedSheet(res.selectedSheet);
        setFieldMappings(res.suggestedMappings);
        setStep("map");
      }
    });
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
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
    if (f) handleFileSelect(f);
  };

  // Re-inspect if sheet changes
  const handleSheetChange = (newSheet: string) => {
    if (!file) return;
    setSelectedSheet(newSheet);

    const formData = new FormData();
    formData.append("file", file);

    startInspectTransition(async () => {
      const res = await inspectSpreadsheetAction(formData, targetEntity, newSheet);
      setInspectionData(res);
      if (res.ok) {
        setFieldMappings(res.suggestedMappings);
      }
    });
  };

  // Switch target entity and re-match if file already loaded
  const handleEntityChange = (entity: ImportEntityType) => {
    setTargetEntity(entity);
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      startInspectTransition(async () => {
        const res = await inspectSpreadsheetAction(formData, entity, selectedSheet);
        setInspectionData(res);
        if (res.ok) {
          setFieldMappings(res.suggestedMappings);
        }
      });
    }
  };

  // Execute preview mapping
  const handleProceedToPreview = () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);

    startPreviewTransition(async () => {
      const res = await previewMappedImportAction(
        formData,
        targetEntity,
        fieldMappings,
        selectedSheet
      );
      setPreviewResult(res);
      if (res.ok) {
        setStep("preview");
      }
    });
  };

  // Execute database import
  const handleExecuteImport = () => {
    if (!previewResult || !previewResult.rows || previewResult.rows.length === 0) return;

    startExecuteTransition(async () => {
      const res = await executeMappedImportAction(targetEntity, previewResult.rows, {
        skipExisting,
        autoCreateMissing,
      });
      setExecutionResult(res);
      if (res.ok) {
        setStep("result");
        router.refresh();
      }
    });
  };

  // Reset wizard
  const handleReset = () => {
    setFile(null);
    setInspectionData(null);
    setPreviewResult(null);
    setExecutionResult(null);
    setFieldMappings({});
    setStep("select");
  };

  const fieldDefs = ENTITY_FIELD_DEFINITIONS[targetEntity];
  const headers = inspectionData?.headers || [];
  const sampleRows = inspectionData?.sampleRows || [];

  return (
    <div className="space-y-6">
      {/* Top Stepper Header */}
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-foreground tracking-tight flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 shadow-2xs">
                <FileSpreadsheet className="size-5" />
              </span>
              Universal Spreadsheet Import System
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-1">
              Import any custom Excel (.xlsx, .xls) or CSV file for Employees, Timesheets, or Leave Balances.
            </p>
          </div>

          {step !== "select" && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-foreground bg-surface-muted hover:bg-border/40 border border-border rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="size-3.5" />
              Start New Import
            </button>
          )}
        </div>

        {/* Wizard Steps Bar */}
        <div className="grid grid-cols-4 gap-2 mt-6 pt-6 border-t border-border">
          {[
            { id: "select", label: "1. Upload & Target", icon: Upload },
            { id: "map", label: "2. Map Columns", icon: Sliders },
            { id: "preview", label: "3. Validate Data", icon: Database },
            { id: "result", label: "4. Import Report", icon: CheckCircle2 },
          ].map((s, idx) => {
            const isActive = step === s.id;
            const isCompleted =
              (s.id === "select" && step !== "select") ||
              (s.id === "map" && (step === "preview" || step === "result")) ||
              (s.id === "preview" && step === "result");

            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs sm:text-sm transition-all ${
                  isActive
                    ? "bg-primary/10 border-primary/40 text-primary font-bold shadow-2xs"
                    : isCompleted
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-semibold"
                    : "bg-surface-muted/50 border-border/60 text-muted"
                }`}
              >
                <div
                  className={`size-6 rounded-lg flex items-center justify-center shrink-0 text-xs ${
                    isActive
                      ? "bg-primary text-primary-foreground font-bold"
                      : isCompleted
                      ? "bg-emerald-600 text-white"
                      : "bg-surface-muted text-muted font-bold"
                  }`}
                >
                  {isCompleted ? <Check className="size-3.5 stroke-[3]" /> : idx + 1}
                </div>
                <span className="hidden sm:inline truncate">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: UPLOAD FILE & SELECT TARGET ENTITY */}
      {step === "select" && (
        <div className="space-y-6">
          {/* Target Entity Selector Cards */}
          <div>
            <label className="block text-xs font-extrabold text-muted uppercase tracking-wider mb-3">
              Select What Data You Are Importing:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  id: "employees" as ImportEntityType,
                  title: "Employees Register",
                  desc: "Staff profiles, job titles, start dates, rates, and workstations",
                  icon: Users,
                  color: "border-primary bg-primary/5 text-primary",
                },
                {
                  id: "timesheets" as ImportEntityType,
                  title: "Timesheets & Shifts",
                  desc: "Work dates, clock in/out times, break durations, and notes",
                  icon: Clock,
                  color: "border-emerald-500 bg-emerald-500/5 text-emerald-700",
                },
                {
                  id: "leave_balances" as ImportEntityType,
                  title: "Leave Balances & Accruals",
                  desc: "Leave type entitlements, accrued hours, taken hours, and balances",
                  icon: Palmtree,
                  color: "border-amber-500 bg-amber-500/5 text-amber-700",
                },
              ].map((card) => {
                const Icon = card.icon;
                const isSelected = targetEntity === card.id;

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleEntityChange(card.id)}
                    className={`relative p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-2 border-primary bg-primary/5 shadow-xs scale-[1.01]"
                        : "bg-surface border-border hover:border-primary/40 text-foreground hover:bg-surface-muted/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2.5 rounded-xl bg-surface-muted text-primary border border-border">
                        <Icon className="size-5" />
                      </div>
                      {isSelected && (
                        <span className="flex items-center gap-1 text-[10px] font-extrabold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                          <Check className="size-3 stroke-[3]" /> Selected
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-foreground text-base">{card.title}</h3>
                    <p className="text-xs text-muted mt-1 leading-relaxed">{card.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {targetEntity === "leave_balances" && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
              <div className="flex items-start gap-2.5">
                <Sparkles className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-extrabold block text-sm">Full Leave Type Setup &amp; Matrix Plotting</span>
                  <p className="mt-0.5 text-muted">
                    Supports single-column (<code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">Leave Type</code> + <code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">Balance</code>) OR multi-column formats (<code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">Annual</code>, <code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">Sick</code>, <code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">Family</code>, <code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">Study</code>, <code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">Maternity</code>, <code className="font-mono text-amber-900 font-bold bg-amber-200/60 px-1 py-0.5 rounded">TOIL</code>). Missing leave types auto-provision!
                  </p>
                  {provisionMessage && (
                    <p className="mt-1.5 font-bold text-emerald-700 bg-emerald-500/15 p-1.5 rounded border border-emerald-500/30">
                      ✓ {provisionMessage}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleProvisionAllLeaveTypes}
                disabled={isPendingProvision}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold rounded-xl bg-amber-600 text-white hover:bg-amber-700 shadow-2xs transition-colors shrink-0 cursor-pointer disabled:opacity-60"
              >
                {isPendingProvision ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Provision All Leave Types &amp; Balances
              </button>
            </div>
          )}

          {/* Drag & Drop File Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center p-10 sm:p-14 border-2 border-dashed rounded-2xl transition-all ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border/80 hover:border-primary/50 bg-surface-muted/30"
            }`}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={onFileInputChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isPendingInspect}
            />
            <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-600 mb-4 border border-emerald-500/20">
              <Upload className="size-8" />
            </div>
            <p className="text-base font-bold text-foreground text-center">
              {isPendingInspect ? "Analyzing spreadsheet headers..." : "Drag & drop any spreadsheet here"}
            </p>
            <p className="text-xs text-muted mt-1.5 text-center max-w-md">
              Supports any column order or layout in Excel (.xlsx, .xls) or CSV format.
            </p>
            <button
              type="button"
              className="mt-5 btn btn-primary cursor-pointer shadow-xs"
              disabled={isPendingInspect}
            >
              {isPendingInspect ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="size-4 animate-spin" /> Reading Grid...
                </span>
              ) : (
                "Choose Spreadsheet File"
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: INTERACTIVE COLUMN MAPPING WIZARD */}
      {step === "map" && inspectionData && (
        <div className="space-y-6">
          {/* File & Sheet Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface border border-border shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <FileSpreadsheet className="size-5" />
              </div>
              <div>
                <span className="text-xs font-semibold text-muted">File Loaded:</span>
                <p className="text-sm font-bold text-foreground truncate max-w-xs">{file?.name}</p>
              </div>
            </div>

            {/* Sheet Selector */}
            {inspectionData.sheetNames.length > 1 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted">Select Sheet:</label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface border border-border text-foreground focus:outline-hidden focus:border-ring"
                >
                  {inspectionData.sheetNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Mapping Grid Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-600" />
                Map Spreadsheet Columns to System Fields
              </h3>
              <p className="text-xs text-muted mt-0.5">
                We auto-matched columns based on header names. Verify or change mappings below.
              </p>
            </div>
            <button
              onClick={handleProceedToPreview}
              disabled={isPendingPreview}
              className="inline-flex items-center gap-2 btn btn-primary cursor-pointer shadow-xs shrink-0"
            >
              {isPendingPreview ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Validating Rows...
                </>
              ) : (
                <>
                  Preview &amp; Validate Data
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>

          {/* Column Mapping Table */}
          <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-foreground">
                <thead className="bg-surface-muted text-muted uppercase tracking-wider font-extrabold text-[10px] border-b border-border">
                  <tr>
                    <th className="px-4 py-3.5 w-1/4">System Field</th>
                    <th className="px-4 py-3.5 w-1/3">Spreadsheet Header Column</th>
                    <th className="px-4 py-3.5">Sample Value (Row 1)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {fieldDefs.map((field) => {
                    const mappedVal = fieldMappings[field.key] || "";
                    const sampleVal = sampleRows.length > 0 && mappedVal ? sampleRows[0][mappedVal] : "";

                    return (
                      <tr key={field.key} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{field.label}</span>
                            {field.required ? (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                                Required
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted font-semibold">Optional</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted mt-0.5">{field.description}</p>
                        </td>

                        <td className="px-4 py-3">
                          <select
                            value={mappedVal}
                            onChange={(e) =>
                              setFieldMappings((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className={`w-full px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${
                              mappedVal
                                ? "bg-emerald-500/5 text-emerald-800 border-emerald-500/40"
                                : field.required
                                ? "bg-rose-500/5 text-rose-800 border-rose-500/40"
                                : "bg-surface text-foreground border-border"
                            }`}
                          >
                            <option value="">-- Do Not Import / Skip --</option>
                            {headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-4 py-3">
                          {sampleVal ? (
                            <span className="font-mono text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 truncate block max-w-xs font-bold text-[11px]">
                              {sampleVal}
                            </span>
                          ) : (
                            <span className="text-muted italic">No value</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: PREVIEW & VALIDATION MATRIX */}
      {step === "preview" && previewResult && (
        <div className="space-y-6">
          {/* Summary Diagnostics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs">
              <span className="text-xs font-bold text-muted uppercase">Total Rows Read</span>
              <p className="text-2xl font-black text-foreground mt-1">{previewResult.totalRows}</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
              <span className="text-xs font-bold text-emerald-700 uppercase">Valid Rows</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">{previewResult.validCount}</p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
              <span className="text-xs font-bold text-amber-700 uppercase">Warnings</span>
              <p className="text-2xl font-black text-amber-700 mt-1">{previewResult.warningCount}</p>
            </div>
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30">
              <span className="text-xs font-bold text-rose-700 uppercase">Critical Errors</span>
              <p className="text-2xl font-black text-rose-700 mt-1">{previewResult.errorCount}</p>
            </div>
          </div>

          {/* Missing Lookups & Conflict Options */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-4 shadow-2xs">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sliders className="size-4 text-emerald-600" />
              Import Settings &amp; Conflict Handling
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-muted/50 border border-border cursor-pointer hover:bg-surface-muted transition-colors">
                <input
                  type="checkbox"
                  checked={skipExisting}
                  onChange={(e) => setSkipExisting(e.target.checked)}
                  className="size-4 rounded text-primary focus:ring-ring border-border bg-surface"
                />
                <div>
                  <span className="text-xs font-bold text-foreground block">Skip Existing Records</span>
                  <span className="text-[11px] text-muted block">
                    If an employee, shift, or balance already exists, skip it instead of overwriting.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-muted/50 border border-border cursor-pointer hover:bg-surface-muted transition-colors">
                <input
                  type="checkbox"
                  checked={autoCreateMissing}
                  onChange={(e) => setAutoCreateMissing(e.target.checked)}
                  className="size-4 rounded text-primary focus:ring-ring border-border bg-surface"
                />
                <div>
                  <span className="text-xs font-bold text-foreground block">Auto-Create Missing Reference Data</span>
                  <span className="text-[11px] text-muted block">
                    Automatically create new workstations or leave types if they don&apos;t exist yet.
                  </span>
                </div>
              </label>
            </div>

            {/* Missing Lookup Warnings */}
            {(previewResult.unmatchedWorkstations.length > 0 || previewResult.unmatchedLeaveTypes.length > 0) && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold block">Missing Reference Items Detected:</span>
                  {previewResult.unmatchedWorkstations.length > 0 && (
                    <p className="mt-0.5 font-medium">
                      Workstations: {previewResult.unmatchedWorkstations.join(", ")}
                    </p>
                  )}
                  {previewResult.unmatchedLeaveTypes.length > 0 && (
                    <p className="mt-0.5 font-medium">
                      Leave Types: {previewResult.unmatchedLeaveTypes.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Table Filters & Execution Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-muted border border-border">
              {(["all", "valid", "warnings", "errors"] as TableFilter[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTableFilter(tf)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors cursor-pointer ${
                    tableFilter === tf
                      ? "bg-surface text-foreground shadow-2xs border border-border"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setStep("map")}
                className="btn btn-outline text-xs font-semibold cursor-pointer"
              >
                Back to Mapping
              </button>

              <button
                onClick={handleExecuteImport}
                disabled={isPendingExecute || previewResult.validCount + previewResult.warningCount === 0}
                className="inline-flex items-center gap-2 btn btn-primary cursor-pointer shadow-xs"
              >
                {isPendingExecute ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    Importing Records into Database...
                  </>
                ) : (
                  <>
                    Execute Database Import ({previewResult.validCount + previewResult.warningCount} rows)
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Parsed Rows Preview Table */}
          <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-2xs">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs text-foreground">
                <thead className="bg-surface-muted text-muted uppercase tracking-wider font-extrabold text-[10px] border-b border-border sticky top-0 backdrop-blur-md">
                  <tr>
                    <th className="px-4 py-3 w-16">Row</th>
                    <th className="px-4 py-3 w-28">Status</th>
                    <th className="px-4 py-3">Parsed Details</th>
                    <th className="px-4 py-3">Diagnostics &amp; Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {previewResult.rows
                    .filter((r) => {
                      if (tableFilter === "valid") return r.status === "valid";
                      if (tableFilter === "warnings") return r.status === "warning";
                      if (tableFilter === "errors") return r.status === "error";
                      return true;
                    })
                    .map((row) => (
                      <tr key={row.rowId} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-muted">#{row.sourceRowNumber}</td>
                        <td className="px-4 py-3">
                          {row.status === "valid" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              <CheckCircle2 className="size-3" /> Valid
                            </span>
                          )}
                          {row.status === "warning" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              <AlertTriangle className="size-3" /> Warning
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              <XCircle className="size-3" /> Error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-foreground">
                            {row.matchedEmployeeName || row.mappedData["full_name"] || row.mappedData["employee_identifier"] || "Unknown"}
                          </div>
                          <div className="text-[11px] text-muted mt-0.5 flex flex-wrap gap-2">
                            {Boolean(row.resolvedData["work_date"]) && (
                              <span>Date: {String(row.resolvedData["work_date"])}</span>
                            )}
                            {Boolean(row.resolvedData["clock_in"]) && (
                              <span>In: {String(row.resolvedData["clock_in"])}</span>
                            )}
                            {Boolean(row.resolvedData["clock_out"]) && (
                              <span>Out: {String(row.resolvedData["clock_out"])}</span>
                            )}
                            {row.resolvedData["balance_hours"] !== undefined && (
                              <span>
                                Balance: {String(row.resolvedData["balance_hours"])}h (
                                {(Number(row.resolvedData["balance_hours"]) / 8).toFixed(1)} days)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 space-y-1">
                          {row.errors.map((e, idx) => (
                            <p key={idx} className="text-[11px] font-semibold text-rose-700 flex items-center gap-1">
                              • {e}
                            </p>
                          ))}
                          {row.warnings.map((w, idx) => (
                            <p key={idx} className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                              • {w}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: FINAL IMPORT REPORT */}
      {step === "result" && executionResult && (
        <div className="p-8 rounded-2xl bg-surface border border-border text-center space-y-6 shadow-soft">
          <div className="size-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-500/20">
            <CheckCircle2 className="size-10" />
          </div>

          <div>
            <h3 className="text-xl font-black text-foreground">Import Execution Completed!</h3>
            <p className="text-sm text-muted mt-1 max-w-md mx-auto">{executionResult.message}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-xs font-bold text-muted block">Inserted</span>
              <span className="text-xl font-black text-emerald-700">{executionResult.insertedCount || 0}</span>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-xs font-bold text-muted block">Updated</span>
              <span className="text-xl font-black text-blue-700">{executionResult.updatedCount || 0}</span>
            </div>
            <div className="p-4 rounded-xl bg-surface-muted border border-border">
              <span className="text-xs font-bold text-muted block">Skipped</span>
              <span className="text-xl font-black text-muted">{executionResult.skippedCount || 0}</span>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="btn btn-primary px-6 py-2.5 text-xs font-bold cursor-pointer shadow-xs"
          >
            Done / Perform Another Import
          </button>
        </div>
      )}
    </div>
  );
}
