"use client";

import { useActionState, useState } from "react";
import { Calendar, CheckCircle2, Cog, Save } from "lucide-react";
import { saveCompanyPayrollSettings } from "@/lib/reports/actions";
import {
  type PayrollPeriodConfig,
  type PayrollFrequency,
  calculatePeriodEndDate,
  defaultPayrollConfig,
  generatePayrollPeriods,
  formatPeriodDate,
} from "@/lib/reports/payroll-periods";

type PayrollPeriodSettingsFormProps = {
  initialConfig?: PayrollPeriodConfig;
};

const initialState = {
  ok: true,
  message: "",
};

export default function PayrollPeriodSettingsForm({
  initialConfig = defaultPayrollConfig,
}: PayrollPeriodSettingsFormProps) {
  const [state, formAction, pending] = useActionState(saveCompanyPayrollSettings, initialState);

  const [frequency, setFrequency] = useState<PayrollFrequency>(initialConfig.frequency ?? "monthly");
  const [startDate, setStartDate] = useState<string>(initialConfig.startDate || initialConfig.anchorDate || "2026-01-01");
  const [endDate, setEndDate] = useState<string>(
    initialConfig.endDate ||
      calculatePeriodEndDate(initialConfig.startDate || initialConfig.anchorDate || "2026-01-01", initialConfig.frequency ?? "monthly", {
        startDayOfMonth: initialConfig.startDayOfMonth,
        endDayOfMonth: initialConfig.endDayOfMonth,
        customCycleDays: initialConfig.customCycleDays,
      }),
  );
  const [startDayOfMonth, setStartDayOfMonth] = useState<number>(initialConfig.startDayOfMonth ?? 1);
  const [endDayOfMonth, setEndDayOfMonth] = useState<number>(initialConfig.endDayOfMonth ?? 31);
  const [startDayOfWeek, setStartDayOfWeek] = useState<number>(initialConfig.startDayOfWeek ?? 1);
  const [customCycleDays, setCustomCycleDays] = useState<number>(initialConfig.customCycleDays ?? 14);
  const [payDayOffsetDays, setPayDayOffsetDays] = useState<number>(initialConfig.payDayOffsetDays ?? 3);

  // Live preview of generated periods based on interactive state
  const previewPeriods = generatePayrollPeriods(
    {
      frequency,
      startDate,
      endDate,
      anchorDate: startDate,
      startDayOfMonth,
      endDayOfMonth,
      startDayOfWeek,
      customCycleDays,
      payDayOffsetDays,
    },
    new Date().toISOString().slice(0, 10),
    6,
  );

  return (
    <div className="grid gap-6">
      {state.message ? (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3.5 text-xs font-semibold ${
            state.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
              : "border-rose-300 bg-rose-50 text-rose-950"
          }`}
        >
          {state.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : null}
          <span>{state.message}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings Form */}
        <form action={formAction} className="grid gap-4 rounded-xl border-2 border-border bg-surface p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border/80 pb-3">
            <Cog className="size-4 text-accent" />
            <h3 className="text-sm font-extrabold text-foreground">
              Company Payroll Period Rules
            </h3>
          </div>

          {/* Frequency Selection */}
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Payroll Cycle Frequency
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ["monthly", "Monthly"],
                  ["semi_monthly", "Semi-Monthly"],
                  ["bi_weekly", "Bi-Weekly (14d)"],
                  ["weekly", "Weekly (7d)"],
                  ["custom", "Custom"],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={val}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 p-2 text-center text-xs font-extrabold transition-all ${
                    frequency === val
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-border bg-background hover:bg-surface-muted text-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="frequency"
                    value={val}
                    checked={frequency === val}
                    onChange={() => {
                      setFrequency(val);
                      const newEnd = calculatePeriodEndDate(startDate, val, {
                        startDayOfMonth,
                        endDayOfMonth,
                        customCycleDays,
                      });
                      setEndDate(newEnd);
                    }}
                    className="sr-only"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Two Date Values: Start Date & End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Period Start Date
              </label>
              <input
                type="date"
                name="start_date"
                value={startDate}
                onChange={(e) => {
                  const newStart = e.target.value;
                  setStartDate(newStart);
                  const newEnd = calculatePeriodEndDate(newStart, frequency, {
                    startDayOfMonth,
                    endDayOfMonth,
                    customCycleDays,
                  });
                  setEndDate(newEnd);
                }}
                className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-extrabold text-foreground outline-none"
                required
              />
              <input type="hidden" name="anchor_date" value={startDate} />
            </div>

            <div className="grid gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Period End Date
              </label>
              <input
                type="date"
                name="end_date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-extrabold text-foreground outline-none"
                required
              />
            </div>
          </div>

          {/* Frequency Specific Inputs */}
          {frequency === "monthly" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Start Day of Month
                </label>
                <select
                  name="start_day_of_month"
                  value={startDayOfMonth}
                  onChange={(e) => {
                    const sDay = Number(e.target.value);
                    setStartDayOfMonth(sDay);
                    const eDay = sDay === 1 ? 31 : sDay - 1;
                    setEndDayOfMonth(eDay);
                    const sStr = `2026-01-${String(sDay).padStart(2, "0")}`;
                    setStartDate(sStr);
                    setEndDate(calculatePeriodEndDate(sStr, "monthly", { startDayOfMonth: sDay, endDayOfMonth: eDay }));
                  }}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-extrabold text-foreground outline-none"
                >
                  <option value={1}>1st of Month</option>
                  <option value={16}>16th of Month</option>
                  <option value={20}>20th of Month</option>
                  <option value={25}>25th of Month</option>
                  <option value={26}>26th of Month</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  End Day of Month
                </label>
                <input
                  type="number"
                  name="end_day_of_month"
                  min={1}
                  max={31}
                  value={endDayOfMonth}
                  onChange={(e) => setEndDayOfMonth(Number(e.target.value))}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-extrabold text-foreground outline-none"
                />
              </div>
            </div>
          )}

          {/* Period Restart Informational Card */}
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-3 text-xs text-emerald-950">
            <p className="font-extrabold flex items-center gap-1.5 text-emerald-950">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <span>
                Current Period: {formatPeriodDate(startDate)} &rarr; {formatPeriodDate(endDate)}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-emerald-800">
              When this period concludes on {formatPeriodDate(endDate)}, the payroll rule automatically restarts with the next period starting on the following day.
            </p>
          </div>

          {frequency === "custom" && (
            <div className="grid gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Cycle Length (Days)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                name="custom_cycle_days"
                value={customCycleDays}
                onChange={(e) => setCustomCycleDays(Number(e.target.value))}
                className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-extrabold text-foreground outline-none"
              />
              <p className="text-[11px] text-muted">
                Custom duration per payroll cycle (e.g. 10, 15, 21, 30 days).
              </p>
            </div>
          )}

          {frequency === "weekly" && (
            <div className="grid gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
                First Day of Week
              </label>
              <select
                name="start_day_of_week"
                value={startDayOfWeek}
                onChange={(e) => setStartDayOfWeek(Number(e.target.value))}
                className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-extrabold text-foreground outline-none"
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
                <option value={6}>Saturday</option>
                <option value={5}>Friday</option>
              </select>
            </div>
          )}

          {/* Pay Day Offset */}
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Pay Day Disbursement Offset (Days after period cutoff)
            </label>
            <input
              type="number"
              min={0}
              max={30}
              name="pay_day_offset_days"
              value={payDayOffsetDays}
              onChange={(e) => setPayDayOffsetDays(Number(e.target.value))}
              className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-extrabold text-foreground outline-none"
            />
            <p className="text-[11px] text-muted">
              Number of days after the period closing date when salaries/wages are paid out.
            </p>
          </div>

          <div className="pt-2">
            <button
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="size-4" />
              {pending ? "Saving Payroll Rules..." : "Save Payroll Period Configuration"}
            </button>
          </div>
        </form>

        {/* Live Period Generator Preview */}
        <div className="grid gap-3 rounded-xl border-2 border-dashed border-border bg-surface-muted/40 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-accent" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                Generated Periods Live Preview
              </h4>
            </div>
            <span className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
              {frequency.replace("_", " ")}
            </span>
          </div>

          <p className="text-xs text-muted">
            The reporting engine and timesheets will automatically anchor all analytics to these generated period boundaries:
          </p>

          <div className="grid gap-2">
            {previewPeriods.map((period) => (
              <div
                key={period.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 p-2.5 text-xs transition-all ${
                  period.isCurrent
                    ? "border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500"
                    : "border-border bg-white"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-extrabold text-foreground">
                      {formatPeriodDate(period.startDate)} &rarr; {formatPeriodDate(period.endDate)}
                    </p>
                    {period.isCurrent ? (
                      <span className="rounded bg-emerald-600 px-1.5 py-0.2 text-[9px] font-black uppercase text-white">
                        Current Open Period
                      </span>
                    ) : period.isClosed ? (
                      <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[9px] font-bold text-slate-700">
                        Closed
                      </span>
                    ) : (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[9px] font-bold text-indigo-700">
                        Upcoming
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Pay Date: <span className="font-semibold text-foreground">{formatPeriodDate(period.payDate)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
