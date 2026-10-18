"use client";

import { Loader2 } from "lucide-react";
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
        className="grid gap-2.5 rounded-2xl border border-border/80 bg-surface p-5 shadow-soft"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Automate All Accruals (BCEA SA Labour Law)
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {data.toilEnabled
                  ? "Calculates 1h annual leave per 17h worked + 1.5\u00d7 overtime TOIL for all active employees"
                  : "Calculates statutory annual leave (1h per 17h worked) for all active employees"}
              </p>
            </div>
            <p className="mt-2 text-xs font-normal text-muted leading-relaxed">
              Scans all accumulated timesheets and approved leave requests across the company, calculates statutory BCEA accruals, and updates balances automatically in real time.
            </p>
          </div>

          <button
            type="submit"
            disabled={autoSyncPending}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-xs font-bold uppercase tracking-wider text-white shadow-soft hover:bg-primary-hover disabled:opacity-60 transition-all cursor-pointer"
          >
            {autoSyncPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            <span>{autoSyncPending ? "Automating..." : "Auto-Accrue All"}</span>
          </button>
        </div>
      </form>

      <div className="grid gap-3 rounded-2xl border border-border/80 bg-surface p-5 shadow-soft">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            Load leave accruals
          </h3>
          <p className="mt-1 text-xs text-muted">
            Accrue leave pro-rated by hours worked against the rule&apos;s yearly hours. The formula
            is <span className="font-semibold text-foreground">yearly_hours &times; (hours worked &divide;{" "}
            {data.standardAnnualHours.toFixed(0)}h)</span>.
          </p>
        </div>

        {visibleMessage ? (
          <p
            className={`rounded-2xl border px-3.5 py-2.5 text-sm font-medium shadow-soft ${
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
              <select
                name="leave_type_id"
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
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
            </label>
            <div className="flex items-end">
              <p className="flex h-11 w-full items-center rounded-full border border-border bg-background px-4 text-sm text-muted">
                Yearly entitlement: <span className="ml-1 font-semibold text-foreground">{yearlyHours}h</span>
              </p>
            </div>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Period start</span>
              <input
                name="period_start"
                type="date"
                value={period.start}
                onChange={(event) => setPeriod({ ...period, start: event.target.value })}
                className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Period end</span>
              <input
                name="period_end"
                type="date"
                value={period.end}
                onChange={(event) => setPeriod({ ...period, end: event.target.value })}
                className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </label>
          </div>
          <button
            disabled={previewPending}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-white shadow-soft hover:bg-primary-hover disabled:opacity-60 transition-all cursor-pointer"
          >
            {previewPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {previewPending ? "Calculating..." : "Preview accruals"}
          </button>
        </form>

        {previewRows.length > 0 ? (
          <form action={loadAction} className="grid gap-3 rounded-2xl border border-border/80 bg-background p-4 shadow-soft">
            <input type="hidden" name="leave_type_id" value={leaveTypeId} />
            <input type="hidden" name="period_start" value={period.start} />
            <input type="hidden" name="period_end" value={period.end} />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-foreground">Preview ({previewRows.length} employees)</p>
              <div className="flex rounded-full border border-border bg-surface-muted p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAddToBalance(true)}
                  className={`rounded-full px-4 py-1.5 transition-all ${
                    addToBalance ? "bg-primary text-white shadow-soft" : "text-foreground hover:bg-surface"
                  }`}
                >
                  Add to balance
                </button>
                <button
                  type="button"
                  onClick={() => setAddToBalance(false)}
                  className={`rounded-full px-4 py-1.5 transition-all ${
                    !addToBalance ? "bg-primary text-white shadow-soft" : "text-foreground hover:bg-surface"
                  }`}
                >
                  Overwrite
                </button>
              </div>
            </div>
            <input type="hidden" name="add_to_balance" value={addToBalance ? "on" : "off"} />

            {data.carryOverHours !== null ? (
              <p className="rounded-2xl border border-accent/30 bg-accent/10 px-3.5 py-2 text-xs font-medium text-foreground">
                Balances are capped at {data.carryOverHours}h carry-over from company rules.
              </p>
            ) : null}

            <div className="max-h-80 overflow-y-auto rounded-2xl border border-border shadow-soft">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-3.5 py-2.5 font-semibold">Employee</th>
                    <th className="px-3.5 py-2.5 font-semibold">Hours worked</th>
                    <th className="px-3.5 py-2.5 font-semibold">Accrue (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.employee_id} className="border-t border-border">
                      <td className="px-3.5 py-2.5">
                        <span className="block break-words font-semibold leading-tight text-foreground">{row.full_name}</span>
                      </td>

                      <td className="px-3.5 py-2.5 text-muted">{Number(row.hours_worked).toFixed(2)}h</td>
                      <td className="px-3.5 py-2.5">
                        <input
                          name={`accrued_${row.employee_id}`}
                          type="number"
                          min="0"
                          step="0.25"
                          defaultValue={Number(row.accrued_hours).toFixed(2)}
                          className="h-9 w-24 rounded-full border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              disabled={loadPending}
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-white shadow-soft hover:bg-primary-hover disabled:opacity-60 transition-all cursor-pointer"
            >
              {loadPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {loadPending ? "Loading..." : addToBalance ? "Add accruals" : "Overwrite balances"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
