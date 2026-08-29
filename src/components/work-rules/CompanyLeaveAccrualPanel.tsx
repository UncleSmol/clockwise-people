"use client";

import { Calculator, CalendarRange, Clock, Loader2, RefreshCw, Save, Sparkles, User } from "lucide-react";
import { useActionState, useState } from "react";
import { autoSyncCompanyLeaveAccruals, loadLeaveAccruals, previewLeaveAccruals } from "@/lib/work-rules/actions";
import type { CompanyWorkRulesData } from "@/lib/work-rules/schema";

type CompanyLeaveAccrualPanelProps = {
  data: CompanyWorkRulesData;
};

type AccrualActionState = {
  ok: boolean;
  message: string;
  preview?: Array<{
    accrued_hours: number;
    employee_id: string;
    employee_number: string;
    full_name: string;
    hours_worked: number;
  }>;
};

const initialState: AccrualActionState = {
  ok: true,
  message: "",
};

function defaultPeriod() {
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);
  return {
    end: today.toISOString().slice(0, 10),
    start: yearStart.toISOString().slice(0, 10),
  };
}

function leaveYearlyHours(data: CompanyWorkRulesData, leaveTypeId: string) {
  const leaveType = data.leaveTypes.find((item) => item.id === leaveTypeId);
  const yearly = leaveType?.accrual_rules?.yearly_hours;
  return typeof yearly === "number" ? yearly : Number(yearly ?? 0) || 0;
}

export default function CompanyLeaveAccrualPanel({ data }: CompanyLeaveAccrualPanelProps) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [period, setPeriod] = useState(() => defaultPeriod());
  const [addToBalance, setAddToBalance] = useState(true);
  const [autoSyncState, autoSyncAction, autoSyncPending] = useActionState(
    autoSyncCompanyLeaveAccruals,
    initialState,
  );
  const [previewState, previewAction, previewPending] = useActionState(
    previewLeaveAccruals,
    initialState,
  );
  const [loadState, loadAction, loadPending] = useActionState(loadLeaveAccruals, initialState);

  const previewRows = previewState.preview ?? [];
  const yearlyHours = leaveYearlyHours(data, leaveTypeId);
  const visibleMessage = autoSyncState.message || loadState.message || previewState.message;
  const visibleOk = autoSyncState.message
    ? autoSyncState.ok
    : loadState.message
      ? loadState.ok
      : previewState.ok;

  return (
    <section className="grid gap-4">
      {/* 1-Click Automated BCEA South African Labour Law Accruals Card */}
      <form
        action={autoSyncAction}
        className="grid gap-2.5 rounded-xl border border-emerald-500/40 bg-emerald-50/70 p-4 shadow-2xs"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
                <Sparkles className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-950">
                  Automate All Accruals (BCEA SA Labour Law)
                </h3>
                <span className="text-[10px] font-bold text-emerald-800">
                  Calculates 1h annual leave per 17h worked + 1.5&times; overtime TOIL for all active employees
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-emerald-900 leading-relaxed">
              Scans all accumulated timesheets and approved leave requests across the company, calculates statutory BCEA accruals, and updates balances automatically in real time.
            </p>
          </div>

          <button
            type="submit"
            disabled={autoSyncPending}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 transition-all"
          >
            {autoSyncPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span>{autoSyncPending ? "Automating..." : "Auto-Accrue All"}</span>
          </button>
        </div>
      </form>

      <div className="grid gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Calculator className="size-4 text-accent" />
          Load leave accruals
        </h3>
        <p className="mt-1 text-xs text-muted">
          Accrue leave pro-rated by hours worked against the rule&apos;s yearly hours. The formula
          is <span className="font-semibold">yearly_hours &times; (hours worked &divide;{" "}
          {data.standardAnnualHours.toFixed(0)}h)</span>.
        </p>
      </div>

      {visibleMessage ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-medium ${
            visibleOk
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {visibleMessage}
        </p>
      ) : null}

      <form action={previewAction} className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Leave rule</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Clock className="size-4 shrink-0 text-muted" />
              <select
                name="leave_type_id"
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">Select leave rule</option>
                {data.leaveTypes.map((leaveType) => {
                  const yearly = leaveType.accrual_rules?.yearly_hours;
                  return (
                    <option key={leaveType.id} value={leaveType.id}>
                      {leaveType.name}
                      {typeof yearly === "number" && yearly > 0 ? ` (${yearly}h/yr)` : ""}
                    </option>
                  );
                })}
              </select>
            </span>
          </label>
          <div className="flex items-end">
            <p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
              Yearly entitlement: <span className="font-semibold text-foreground">{yearlyHours}h</span>
            </p>
          </div>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Period start</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <CalendarRange className="size-4 shrink-0 text-muted" />
              <input
                name="period_start"
                type="date"
                value={period.start}
                onChange={(event) => setPeriod({ ...period, start: event.target.value })}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Period end</span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <CalendarRange className="size-4 shrink-0 text-muted" />
              <input
                name="period_end"
                type="date"
                value={period.end}
                onChange={(event) => setPeriod({ ...period, end: event.target.value })}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
            </span>
          </label>
        </div>
        <button
          disabled={previewPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {previewPending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
          {previewPending ? "Calculating..." : "Preview accruals"}
        </button>
      </form>

      {previewRows.length > 0 ? (
        <form action={loadAction} className="grid gap-3 rounded-lg border border-border bg-background p-3">
          <input type="hidden" name="leave_type_id" value={leaveTypeId} />
          <input type="hidden" name="period_start" value={period.start} />
          <input type="hidden" name="period_end" value={period.end} />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-foreground">Preview ({previewRows.length} employees)</p>
            <div className="flex rounded-full border border-border bg-background p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAddToBalance(true)}
                className={`rounded-full px-3 py-1.5 ${
                  addToBalance ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-surface-muted"
                }`}
              >
                Add to balance
              </button>
              <button
                type="button"
                onClick={() => setAddToBalance(false)}
                className={`rounded-full px-3 py-1.5 ${
                  !addToBalance ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-surface-muted"
                }`}
              >
                Overwrite
              </button>
            </div>
          </div>
          <input type="hidden" name="add_to_balance" value={addToBalance ? "on" : "off"} />

          {data.carryOverHours !== null ? (
            <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-foreground">
              Balances are capped at {data.carryOverHours}h carry-over from company rules.
            </p>
          ) : null}

          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-xs uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Employee</th>
                  <th className="px-3 py-2 font-semibold">Hours worked</th>
                  <th className="px-3 py-2 font-semibold">Accrue (h)</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={row.employee_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <User className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0">
                          <span className="block truncate">{row.full_name}</span>
                          <span className="block text-xs text-muted">{row.employee_number}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{Number(row.hours_worked).toFixed(2)}h</td>
                    <td className="px-3 py-2">
                      <input
                        name={`accrued_${row.employee_id}`}
                        type="number"
                        min="0"
                        step="0.25"
                        defaultValue={Number(row.accrued_hours).toFixed(2)}
                        className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            disabled={loadPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loadPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {loadPending ? "Loading..." : addToBalance ? "Add accruals" : "Overwrite balances"}
          </button>
        </form>
      ) : null}
      </div>
    </section>
  );
}
