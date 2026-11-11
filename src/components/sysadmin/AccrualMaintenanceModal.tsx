"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Coins,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Users,
  X,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import {
  getCompanyAccrualContextAction,
  maintainEmployeeAccrualsAction,
  type AccrualMaintenanceMode,
  type CompanyAccrualContext,
} from "@/lib/sysadmin/database-maintenance-actions";

type AccrualMaintenanceModalProps = {
  isOpen: boolean;
  companyId: string;
  companyName: string;
  initialEmployeeId?: string;
  initialLeaveTypeId?: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

export default function AccrualMaintenanceModal({
  isOpen,
  companyId,
  companyName,
  initialEmployeeId,
  initialLeaveTypeId,
  onClose,
  onSuccess,
}: AccrualMaintenanceModalProps) {
  const [context, setContext] = useState<CompanyAccrualContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<AccrualMaintenanceMode>("top_up");
  const [leaveTypeId, setLeaveTypeId] = useState<string>(initialLeaveTypeId || "");
  const [unit, setUnit] = useState<"hours" | "days">("hours");
  const [rawAmount, setRawAmount] = useState<string>("8");
  const [scope, setScope] = useState<"selected" | "all">(
    initialEmployeeId ? "selected" : "selected",
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialEmployeeId ? [initialEmployeeId] : [],
  );
  const [empSearch, setEmpSearch] = useState("");
  const [resetAdjOnOverwrite, setResetAdjOnOverwrite] = useState(true);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!isOpen || !companyId) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingContext(true);
      setErrorText(null);
      const res = await getCompanyAccrualContextAction(companyId);
      if (cancelled) return;
      setIsLoadingContext(false);

      if (res.ok && res.data) {
        setContext(res.data);
        const defaultLt =
          (initialLeaveTypeId &&
            res.data.leaveTypes.find((lt) => lt.id === initialLeaveTypeId)?.id) ||
          res.data.leaveTypes.find((lt) => lt.category === "annual")?.id ||
          res.data.leaveTypes[0]?.id ||
          "";
        setLeaveTypeId(defaultLt);
        if (initialEmployeeId) {
          setScope("selected");
          setSelectedIds([initialEmployeeId]);
        } else {
          setSelectedIds([]);
        }
      } else {
        setErrorText(res.message || "Failed to load employee accrual data.");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, companyId, initialEmployeeId, initialLeaveTypeId]);

  const dailyHours = context?.standardDailyHours || 8;
  const parsedNumber = Number(rawAmount);
  const isValidNumber = rawAmount.trim() !== "" && Number.isFinite(parsedNumber);
  const effectiveHours = useMemo(() => {
    if (!isValidNumber) return 0;
    return Number((unit === "days" ? parsedNumber * dailyHours : parsedNumber).toFixed(2));
  }, [isValidNumber, parsedNumber, unit, dailyHours]);

  const activeEmployees = useMemo(
    () => (context?.employees || []).filter((e) => e.employment_status === "active"),
    [context],
  );

  const filteredEmployees = useMemo(() => {
    const list = context?.employees || [];
    const q = empSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        (e.employee_number && e.employee_number.toLowerCase().includes(q)) ||
        (e.email && e.email.toLowerCase().includes(q)),
    );
  }, [context, empSearch]);

  const balanceByEmployee = useMemo(() => {
    const map = new Map<
      string,
      { balance: number; accrued: number; taken: number; adjusted: number }
    >();
    if (!context || !leaveTypeId) return map;
    for (const b of context.balances) {
      if (b.leave_type_id === leaveTypeId) {
        map.set(b.employee_id, {
          balance: b.balance_hours,
          accrued: b.accrued_hours,
          taken: b.taken_hours,
          adjusted: b.adjusted_hours,
        });
      }
    }
    return map;
  }, [context, leaveTypeId]);

  const targetEmployeesForPreview = useMemo(() => {
    if (!context) return [];
    if (scope === "all") return activeEmployees;
    const set = new Set(selectedIds);
    return context.employees.filter((e) => set.has(e.id));
  }, [context, scope, activeEmployees, selectedIds]);

  const computeProjectedBalance = (empId: string) => {
    const cur = balanceByEmployee.get(empId) || {
      balance: 0,
      accrued: 0,
      taken: 0,
      adjusted: 0,
    };
    if (!isValidNumber) return cur.balance;
    if (mode === "top_up") {
      return Math.max(0, Number((cur.balance + effectiveHours).toFixed(2)));
    }
    if (mode === "overwrite_balance") {
      return Math.max(0, Number(effectiveHours.toFixed(2)));
    }
    // overwrite_accrued
    const adj = resetAdjOnOverwrite ? 0 : cur.adjusted;
    return Math.max(0, Number((Math.max(0, effectiveHours) + adj - cur.taken).toFixed(2)));
  };

  const toggleEmployee = (empId: string) => {
    setSelectedIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId],
    );
  };

  const handleSubmit = () => {
    setErrorText(null);
    if (!leaveTypeId) {
      setErrorText("Please select a leave type.");
      return;
    }
    if (!isValidNumber) {
      setErrorText("Please enter a valid number.");
      return;
    }
    if (mode === "top_up" && effectiveHours === 0) {
      setErrorText("Top-up amount cannot be 0.");
      return;
    }
    if (mode !== "top_up" && effectiveHours < 0) {
      setErrorText("Overwrite amount cannot be negative.");
      return;
    }
    if (scope === "selected" && selectedIds.length === 0) {
      setErrorText("Select at least one employee or switch to All Active Employees.");
      return;
    }
    if (scope === "all" && activeEmployees.length === 0) {
      setErrorText("No active employees found in this company.");
      return;
    }

    startTransition(async () => {
      const res = await maintainEmployeeAccrualsAction({
        companyId,
        mode,
        employeeIds: scope === "all" ? ["ALL"] : selectedIds,
        leaveTypeId,
        amountHours: effectiveHours,
        resetAdjustmentsOnOverwrite: resetAdjOnOverwrite,
        reason: reason.trim() || undefined,
      });

      if (res.ok) {
        onSuccess(res.message);
        onClose();
      } else {
        setErrorText(res.message || "Failed to update employee accruals.");
      }
    });
  };

  if (!isOpen) return null;

  const presets =
    unit === "hours"
      ? mode === "top_up"
        ? ["8", "16", "40", "-8"]
        : ["0", "40", "120", "136", "168"]
      : mode === "top_up"
        ? ["1", "2", "5", "-1"]
        : ["0", "5", "15", "17", "21"];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted/40 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
              <Coins className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-foreground truncate">
                Employee Leave Accruals — Top Up &amp; Overwrite
              </h3>
              <p className="text-[11px] text-muted truncate">
                Tenant: <strong className="text-foreground">{companyName}</strong> · 1 day ={" "}
                <span className="font-mono font-bold text-foreground">{dailyHours}h</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorText ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{errorText}</span>
            </div>
          ) : null}

          {isLoadingContext ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs font-semibold text-muted">
              <RefreshCw className="size-4 animate-spin text-primary" />
              <span>Loading company employees, leave rules, and current balances...</span>
            </div>
          ) : (
            <>
              {/* 1. Operation Mode Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted block">
                  1. Operation Mode
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("top_up");
                      if (Number(rawAmount) < 0) setRawAmount("8");
                    }}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      mode === "top_up"
                        ? "border-emerald-600 bg-emerald-600/10 ring-1 ring-emerald-600/30"
                        : "border-border bg-background hover:bg-surface-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                      <Plus className="size-3.5 text-emerald-600" />
                      <span>Top Up (+ / -)</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      Add or deduct hours on top of existing accrual &amp; balance.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("overwrite_balance");
                      if (Number(rawAmount) < 0) setRawAmount("40");
                    }}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      mode === "overwrite_balance"
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border bg-background hover:bg-surface-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                      <RotateCcw className="size-3.5 text-primary" />
                      <span>Overwrite Balance</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      Replace exact available balance directly (sets accrued = target + taken).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("overwrite_accrued");
                      if (Number(rawAmount) < 0) setRawAmount("120");
                    }}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      mode === "overwrite_accrued"
                        ? "border-amber-600 bg-amber-500/10 ring-1 ring-amber-500/30"
                        : "border-border bg-background hover:bg-surface-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-foreground">
                      <RotateCcw className="size-3.5 text-amber-600" />
                      <span>Overwrite Accrued</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      Replace total accrued hours (net balance = accrued − taken).
                    </p>
                  </button>
                </div>
              </div>

              {/* 2. Leave Type & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted block">
                    2. Leave Type
                  </label>
                  <select
                    value={leaveTypeId}
                    onChange={(e) => setLeaveTypeId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground focus:border-primary focus:outline-none cursor-pointer"
                  >
                    {(context?.leaveTypes || []).length === 0 ? (
                      <option value="">No active leave types</option>
                    ) : (
                      (context?.leaveTypes || []).map((lt) => (
                        <option key={lt.id} value={lt.id}>
                          {lt.name} ({lt.category})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-muted">
                      3. {mode === "top_up" ? "Adjustment Amount" : "Exact New Amount"}
                    </label>
                    <div className="inline-flex rounded-full border border-border bg-background p-0.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setUnit("hours")}
                        className={`rounded-full px-2.5 py-0.5 transition-colors cursor-pointer ${
                          unit === "hours"
                            ? "bg-primary text-white"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnit("days")}
                        className={`rounded-full px-2.5 py-0.5 transition-colors cursor-pointer ${
                          unit === "days"
                            ? "bg-primary text-white"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        Days ({dailyHours}h)
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.25"
                      value={rawAmount}
                      onChange={(e) => setRawAmount(e.target.value)}
                      placeholder={mode === "top_up" ? "e.g. 8 or -8" : "e.g. 120"}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-bold text-foreground focus:border-primary focus:outline-none"
                    />
                    <span className="shrink-0 rounded-xl border border-border bg-surface-muted px-2.5 py-2 text-[11px] font-mono font-bold text-foreground whitespace-nowrap">
                      {effectiveHours >= 0 && mode === "top_up" ? "+" : ""}
                      {effectiveHours.toFixed(2)}h
                    </span>
                  </div>

                  {/* Quick presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {presets.map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRawAmount(val)}
                        className="rounded-full border border-border bg-surface-muted/60 px-2.5 py-0.5 text-[10px] font-mono font-bold text-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                      >
                        {mode === "top_up" && Number(val) > 0 ? `+${val}` : val}
                        {unit === "hours" ? "h" : "d"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {mode !== "top_up" ? (
                <label className="flex items-center gap-2 rounded-xl border border-border/80 bg-surface-muted/40 px-3 py-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetAdjOnOverwrite}
                    onChange={(e) => setResetAdjOnOverwrite(e.target.checked)}
                    className="size-3.5 accent-primary rounded cursor-pointer"
                  />
                  <span>
                    Reset prior manual <code>adjusted_hours</code> baseline to{" "}
                    <strong className="font-mono">0</strong> on overwrite (recommended so future BCEA sync stays clean)
                  </span>
                </label>
              ) : null}

              {/* 4. Target Employees */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted">
                    4. Target Employees ({targetEmployeesForPreview.length} selected)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setScope("selected")}
                      className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                        scope === "selected"
                          ? "bg-primary text-white shadow-2xs"
                          : "border border-border bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      Specific Employees
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("all")}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                        scope === "all"
                          ? "bg-emerald-700 text-white shadow-2xs"
                          : "border border-border bg-background text-muted hover:text-foreground"
                      }`}
                    >
                      <Users className="size-3" />
                      <span>All Active ({activeEmployees.length})</span>
                    </button>
                  </div>
                </div>

                {scope === "selected" ? (
                  <div className="rounded-xl border border-border bg-background overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-muted/40 px-3 py-2">
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
                        <input
                          type="text"
                          value={empSearch}
                          onChange={(e) => setEmpSearch(e.target.value)}
                          placeholder="Filter employees by name, # or email..."
                          className="w-full rounded-lg border border-border bg-surface py-1 pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedIds(filteredEmployees.map((e) => e.id))
                          }
                          className="text-primary hover:underline cursor-pointer"
                        >
                          Select visible ({filteredEmployees.length})
                        </button>
                        <span className="text-muted">·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedIds([])}
                          className="text-muted hover:text-foreground cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto divide-y divide-border/60">
                      {filteredEmployees.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted">
                          No employees match your filter.
                        </div>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const checked = selectedIds.includes(emp.id);
                          const cur = balanceByEmployee.get(emp.id)?.balance ?? 0;
                          const projected = computeProjectedBalance(emp.id);

                          return (
                            <label
                              key={emp.id}
                              className={`flex items-center justify-between gap-3 px-3 py-2 text-xs cursor-pointer transition-colors ${
                                checked ? "bg-primary/5" : "hover:bg-surface-muted/40"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleEmployee(emp.id)}
                                  className="size-3.5 accent-primary rounded shrink-0 cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <div className="font-bold text-foreground truncate">
                                    {emp.full_name}
                                  </div>
                                  <div className="text-[10px] font-mono text-muted truncate">
                                    {emp.employee_number || emp.email || emp.id.slice(0, 8)}
                                    {emp.employment_status !== "active"
                                      ? ` · ${emp.employment_status}`
                                      : ""}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                                <span className="text-muted">{cur.toFixed(2)}h</span>
                                {checked ? (
                                  <>
                                    <ArrowRight className="size-3 text-emerald-600" />
                                    <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                                      {projected.toFixed(2)}h
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                      <span>
                        Applies to all {activeEmployees.length} active employees in {companyName}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] opacity-85">
                      Each employee&apos;s balance row for the selected leave type will be{" "}
                      {mode === "top_up"
                        ? `adjusted by ${effectiveHours >= 0 ? "+" : ""}${effectiveHours.toFixed(2)}h.`
                        : `overwritten to ${effectiveHours.toFixed(2)}h.`}
                    </p>
                  </div>
                )}
              </div>

              {/* 5. Reason */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted block">
                  5. Audit Reason / Note (Optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Opening leave balance top-up / annual rollover adjustment"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/30 px-5 py-3.5">
          <div className="text-[11px] text-muted">
            {targetEmployeesForPreview.length > 0 && isValidNumber ? (
              <span>
                Updating <strong className="text-foreground">{targetEmployeesForPreview.length}</strong>{" "}
                employee{targetEmployeesForPreview.length === 1 ? "" : "s"} by{" "}
                <strong className="font-mono text-foreground">
                  {mode === "top_up" && effectiveHours >= 0 ? "+" : ""}
                  {effectiveHours.toFixed(2)}h
                </strong>
              </span>
            ) : (
              <span>Select leave type, amount, and target employees.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold text-muted hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending || isLoadingContext || !leaveTypeId || !isValidNumber}
              onClick={handleSubmit}
              className="rounded-full bg-primary px-5 py-1.5 text-xs font-extrabold text-white shadow-soft hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
            >
              {isPending
                ? "Applying..."
                : mode === "top_up"
                  ? "Apply Accrual Top-Up"
                  : "Overwrite Accruals"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

