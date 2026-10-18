"use client";

import {
  ArrowRight,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  FileText,
  Info,
  Link,
  List,
  Loader2,
  Send,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import StorageUploadButton from "@/components/StorageUploadButton";
import {
  autoSyncOwnLeaveAccruals,
  calculateLeaveAdvisor,
  convertOvertimeToToil,
  submitLeaveRequest,
} from "@/lib/work-rules/actions";
import type {
  EmployeeLeaveState,
  LeaveAdvisor,
  LeaveBalance,
} from "@/lib/work-rules/schema";
import type { TimeEntryRecord } from "@/lib/time-tracking/schema";
import {
  defaultPayrollConfig,
  generatePayrollPeriods,
  type PayrollPeriodConfig,
} from "@/lib/reports/payroll-periods";

type EmployeeLeaveRequestsProps = {
  state: EmployeeLeaveState;
  entries?: TimeEntryRecord[];
  payrollConfig?: PayrollPeriodConfig;
};

type LeaveRequestActionState = {
  advisor?: LeaveAdvisor;
  ok: boolean;
  message: string;
};

const initialState: LeaveRequestActionState = {
  ok: true,
  message: "",
};

function leaveTypeName(balance: LeaveBalance) {
  const relation = Array.isArray(balance.leave_types)
    ? balance.leave_types[0]
    : balance.leave_types;
  return relation?.name ?? "Leave";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
  }).format(new Date(year, month - 1, day));
}

function formatFullDate(value: string | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export default function EmployeeLeaveRequests({
  state,
  entries = [],
  payrollConfig,
}: EmployeeLeaveRequestsProps) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [reason, setReason] = useState("");
  const [useToilFirst, setUseToilFirst] = useState(true);

  // Check if TOIL Engine is enabled for company
  const isToilEngineActive = Boolean(state.toilEnabled);

  // Identify TOIL leave type and current employee balance (strictly when active)
  const toilLeaveType = isToilEngineActive
    ? state.leaveTypes.find(
        (lt) => lt.category === "toil_taken" || lt.name.toLowerCase().includes("toil"),
      )
    : undefined;

  const toilBalanceItem = isToilEngineActive
    ? state.balances.find((b) => {
        const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
        return (
          rel?.category === "toil_taken" ||
          rel?.id === toilLeaveType?.id ||
          rel?.name?.toLowerCase().includes("toil")
        );
      })
    : undefined;

  const toilAvailableHours = Number(toilBalanceItem?.balance_hours ?? 0);
  const hasToilBalance = isToilEngineActive && toilAvailableHours > 0;
  const isSelectingToil =
    Boolean(isToilEngineActive && leaveTypeId && toilLeaveType?.id && leaveTypeId === toilLeaveType.id);

  // Statutory accrual multiplier (default 1.5× under BCEA Section 10(3)(b))
  const multiplier = Number(state.toilMultiplier ?? 1.5);

  // Period management for overtime conversion
  const todayIso = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const currentMonthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
  const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0).toISOString().slice(0, 10);

  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const prevMonthEnd = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const generatedPeriods = useMemo(() => {
    try {
      return generatePayrollPeriods(payrollConfig ?? defaultPayrollConfig, todayIso, 6);
    } catch {
      return [];
    }
  }, [payrollConfig, todayIso]);

  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>("current");
  const [customStart, setCustomStart] = useState<string>(currentMonthStart);
  const [customEnd, setCustomEnd] = useState<string>(currentMonthEnd);

  let activeStart = currentMonthStart;
  let activeEnd = currentMonthEnd;
  let activePeriodLabel = `Current Month (${formatDate(currentMonthStart)} - ${formatDate(currentMonthEnd)})`;

  if (selectedPeriodKey === "previous") {
    activeStart = prevMonthStart;
    activeEnd = prevMonthEnd;
    activePeriodLabel = `Previous Month (${formatDate(prevMonthStart)} - ${formatDate(prevMonthEnd)})`;
  } else if (selectedPeriodKey === "custom") {
    activeStart = customStart || currentMonthStart;
    activeEnd = customEnd || currentMonthEnd;
    activePeriodLabel = `Custom Range (${activeStart} to ${activeEnd})`;
  } else if (selectedPeriodKey.startsWith("payroll-")) {
    const match = generatedPeriods.find((p) => p.id === selectedPeriodKey);
    if (match) {
      activeStart = match.startDate;
      activeEnd = match.endDate;
      activePeriodLabel = match.label;
    }
  }

  // Calculate accumulated overtime for active period
  const periodEntries = useMemo(() => {
    return (entries ?? []).filter(
      (e) => e.work_date >= activeStart && e.work_date <= activeEnd,
    );
  }, [entries, activeStart, activeEnd]);

  const periodOvertime = useMemo(() => {
    return periodEntries.reduce(
      (sum, e) => sum + Number(e.overtime_hours ?? 0),
      0,
    );
  }, [periodEntries]);

  // Conversion custom hours toggle
  const [conversionMode, setConversionMode] = useState<"all" | "custom">("all");
  const [customHoursInput, setCustomHoursInput] = useState<string>("");

  const effectiveOtHours =
    conversionMode === "all"
      ? periodOvertime
      : !isNaN(Number(customHoursInput)) && Number(customHoursInput) > 0
        ? Number(customHoursInput)
        : 0;

  const projectedEarnedToil = Number((effectiveOtHours * multiplier).toFixed(2));
  const projectedNewBalance = Number((toilAvailableHours + projectedEarnedToil).toFixed(2));

  // Quick Action: Take Time Off as TOIL
  function handleTakeTimeOffAsToil() {
    if (toilLeaveType) {
      setLeaveTypeId(toilLeaveType.id);
    }
    setUseToilFirst(true);
    const formElement = document.getElementById("new-leave-request-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
      const dateInput = formElement.querySelector<HTMLInputElement>("input[name='start_date']");
      if (dateInput) {
        dateInput.focus();
      }
    }
  }

  const [formState, formAction, pending] = useActionState(
    async (previousState: LeaveRequestActionState, formData: FormData) => {
      const result = await submitLeaveRequest(previousState, formData);

      if (result.ok && result.message === "Leave request sent.") {
        setLeaveTypeId("");
        setStartDate("");
        setEndDate("");
        setAttachmentUrl("");
        setReason("");
      }

      return result;
    },
    initialState,
  );

  const [calculationState, calculationAction, calculationPending] = useActionState(
    calculateLeaveAdvisor,
    initialState,
  );
  const [toilState, toilAction, toilPending] = useActionState(convertOvertimeToToil, initialState);
  const [syncState] = useActionState(autoSyncOwnLeaveAccruals, initialState);

  const calculation = calculationState.advisor;
  const holidayDays =
    calculation?.days.filter((day) => day.reason === "public_holiday") ?? [];
  const visibleMessage = formState.message || calculationState.message || syncState.message;
  const visibleOk = formState.message
    ? formState.ok
    : calculationState.message
      ? calculationState.ok
      : syncState.ok;

  return (
    <section className="grid min-w-0 grid-cols-1 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <CalendarPlus className="size-5 text-accent" />
            Leave &amp; Time Off
          </h2>
          <p className="mt-1 text-xs text-muted">
            {isToilEngineActive
              ? "Request leave, convert overtime into TOIL, and review your leave history."
              : "Request leave, review entitlements, and review your leave history."}
          </p>
        </div>

        {isToilEngineActive && toilLeaveType ? (
          <button
            type="button"
            onClick={handleTakeTimeOffAsToil}
            className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-muted transition shadow-soft"
          >
            Take Time Off as TOIL
          </button>
        ) : null}
      </div>

      {visibleMessage ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-soft ${
            visibleOk
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {visibleMessage}
        </p>
      ) : null}

      {/* BALANCES & REQUEST FORM */}
      <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Available Balances */}
        <div className="w-full min-w-0 max-w-full rounded-2xl border border-border/80 bg-surface p-3.5 sm:p-5 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Available balances</p>
            <span className="text-[11px] font-medium text-muted">Paid hours</span>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {(() => {
              const displayBalances = isToilEngineActive
                ? state.balances
                : state.balances.filter((b) => {
                    const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
                    return rel?.category !== "toil_taken" && !rel?.name?.toLowerCase().includes("toil");
                  });

              if (displayBalances.length === 0) {
                return <p className="text-sm text-muted col-span-full">No balances assigned yet.</p>;
              }

              return displayBalances.map((balance) => {
                const relation = Array.isArray(balance.leave_types)
                  ? balance.leave_types[0]
                  : balance.leave_types;
                const isToil =
                  relation?.category === "toil_taken" ||
                  relation?.id === toilLeaveType?.id ||
                  relation?.name?.toLowerCase().includes("toil");
                const balHours = Number(balance.balance_hours ?? 0);

                return (
                  <article
                    key={balance.id}
                    className={`flex flex-col justify-between gap-2.5 rounded-2xl p-3.5 text-white shadow-soft min-w-0 ${
                      isToil
                        ? "card-gold"
                        : "card-hero-green"
                    }`}
                  >
                    {/* Header: Monogram, Name & Badge */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/20 text-[10px] font-black uppercase text-white">
                          {leaveTypeName(balance).slice(0, 2)}
                          <span
                            className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-2 ring-white/50 bg-white"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-white truncate">
                            {leaveTypeName(balance)}
                          </p>
                          <p className="text-[10px] font-medium truncate text-white/80">
                            {isToil ? "Accrued Overtime" : "Standard Benefit"}
                          </p>
                        </div>
                      </div>

                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-black/20 text-white border border-white/20"
                      >
                        {isToil ? "TOIL" : "Accrued"}
                      </span>
                    </div>

                    {/* High-Contrast White Metrics Box */}
                    <div className="rounded-xl bg-white/95 p-2 text-center text-slate-900 shadow-soft">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 leading-tight">Available Balance</p>
                      <p className={`text-base font-black font-mono leading-tight mt-0.5 ${isToil ? "text-amber-800" : "text-emerald-800"}`}>
                        {balHours.toFixed(2)}h
                      </p>
                    </div>

                    {/* Footer Pills */}
                    <div className="flex items-center justify-between text-[10px] pt-0.5">
                      <span className="rounded-full px-2 py-0.5 font-semibold bg-black/20 text-white">
                        {isToil ? "Time-Off Bank" : "BCEA Accrual"}
                      </span>

                      {isToil && balHours > 0 ? (
                        <button
                          type="button"
                          onClick={handleTakeTimeOffAsToil}
                          className="rounded-full bg-white px-2.5 py-0.5 font-black text-amber-900 shadow-soft hover:bg-amber-50 cursor-pointer transition-colors"
                        >
                          Take leave &rarr;
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              });
            })()}
          </div>
        </div>

        {/* Leave Request Form */}
        <form
          id="new-leave-request-form"
          action={formAction}
          className="grid w-full min-w-0 max-w-full gap-3.5 rounded-2xl border border-border/80 bg-surface p-3.5 sm:p-5 shadow-soft"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">New request</p>
            {isSelectingToil ? (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-500">
                ⚡ TOIL Leave Selected
              </span>
            ) : null}
          </div>

          <label className="grid w-full min-w-0 max-w-full gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Leave Type
            </span>
            <span className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3.5 overflow-hidden">
              <List className="size-4 shrink-0 text-muted" />
              <select
                name="leave_type_id"
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                className="h-10 w-full min-w-0 max-w-full flex-1 truncate bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">Select leave type</option>
                {(isToilEngineActive
                  ? state.leaveTypes
                  : state.leaveTypes.filter(
                      (lt) => lt.category !== "toil_taken" && !lt.name.toLowerCase().includes("toil"),
                    )
                ).map((lt) => {
                  const isToil =
                    isToilEngineActive &&
                    (lt.category === "toil_taken" ||
                      lt.id === toilLeaveType?.id ||
                      lt.name.toLowerCase().includes("toil"));
                  return (
                    <option key={lt.id} value={lt.id} className="truncate">
                      {isToil
                        ? `⚡ ${lt.name} (${toilAvailableHours.toFixed(2)}h balance available)`
                        : lt.name}
                    </option>
                  );
                })}
              </select>
            </span>
          </label>

          {/* DEDICATED TOIL ABSENCE BANNER */}
          {isToilEngineActive && isSelectingToil ? (
            <div className="w-full min-w-0 max-w-full rounded-2xl border border-border/80 bg-surface-muted/30 p-3.5 text-xs shadow-soft">
              <div className="font-semibold text-foreground">
                Taking Time Off as TOIL (Time Off In Lieu)
              </div>
              <p className="mt-1 text-muted break-words">
                This request will deduct 100% directly from your TOIL balance (
                <span className="font-bold text-foreground">
                  {toilAvailableHours.toFixed(2)}h available
                </span>
                ). Your annual leave balance will remain completely untouched.
              </p>
            </div>
          ) : isToilEngineActive && hasToilBalance ? (
            <label className="flex w-full min-w-0 max-w-full cursor-pointer items-start gap-2.5 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-xs font-medium">
              <input
                type="checkbox"
                name="use_toil_first"
                value="true"
                checked={useToilFirst}
                onChange={(event) => setUseToilFirst(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded accent-primary"
              />
              <div className="min-w-0 flex-1">
                <span className="font-bold text-foreground block break-words">
                  Load TOIL first ({toilAvailableHours.toFixed(2)}h available)
                </span>
                <p className="mt-0.5 text-muted break-words">
                  Your overtime comp balance will be loaded first before deducting from your annual leave unless unchecked.
                </p>
              </div>
            </label>
          ) : (
            <input type="hidden" name="use_toil_first" value="true" />
          )}

          <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="grid w-full min-w-0 max-w-full gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Start Date
              </span>
              <span className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3.5 overflow-hidden">
                <Calendar className="size-4 shrink-0 text-muted" />
                <input
                  name="start_date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-10 w-full min-w-0 max-w-full flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
            </label>
            <label className="grid w-full min-w-0 max-w-full gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                End Date
              </span>
              <span className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3.5 overflow-hidden">
                <Calendar className="size-4 shrink-0 text-muted" />
                <input
                  name="end_date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-10 w-full min-w-0 max-w-full flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
            </label>
          </div>

          {calculation ? (
            <div
              className={`grid w-full min-w-0 max-w-full gap-2.5 rounded-2xl border p-4 text-sm shadow-soft ${
                calculation.exceeds_balance
                  ? "border-danger/30 bg-danger/10"
                  : "border-primary/30 bg-primary/5"
              }`}
            >
              <div className="font-semibold text-foreground">
                Leave advisor
              </div>

              {calculation.load_toil_first &&
              Number(calculation.toil_hours_to_use ?? 0) > 0 ? (
                <div className="rounded-xl border border-primary/40 bg-surface p-2.5 text-xs min-w-0">
                  <p className="font-bold text-foreground">Priority deduction (TOIL loaded first):</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-bold text-primary">
                      TOIL: {Number(calculation.toil_hours_to_use).toFixed(2)}h
                    </span>
                    <span className="rounded-full bg-surface-muted px-2.5 py-0.5 font-bold text-foreground">
                      {calculation.leave_type_name}: {Number(calculation.leave_hours_to_use).toFixed(2)}h
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 min-w-0">
                <span className="rounded-xl bg-surface p-2 shadow-soft min-w-0">
                  <span className="block text-xs text-muted truncate">Hours to take</span>
                  <span className="font-semibold text-foreground truncate block">
                    {Number(calculation.total_hours).toFixed(2)}h
                  </span>
                </span>
                <span className="rounded-xl bg-surface p-2 shadow-soft min-w-0">
                  <span className="block text-xs text-muted truncate">Working days</span>
                  <span className="font-semibold text-foreground truncate block">
                    {calculation.working_days} day{calculation.working_days === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="rounded-xl bg-surface p-2 shadow-soft min-w-0">
                  <span className="block text-xs text-muted truncate">As days (approx)</span>
                  <span className="font-semibold text-foreground truncate block">
                    {Number(calculation.days_equivalent).toFixed(2)}d
                  </span>
                </span>
                <span className="rounded-xl bg-surface p-2 shadow-soft min-w-0">
                  <span className="block text-xs text-muted truncate">Leave begins</span>
                  <span className="font-semibold text-foreground truncate block">
                    {formatFullDate(startDate || calculation.days[0]?.date)}
                  </span>
                </span>
                <span className="rounded-xl bg-surface p-2 shadow-soft min-w-0">
                  <span className="block text-xs text-muted truncate">Return to work</span>
                  <span className="font-semibold text-foreground truncate block">
                    {formatFullDate(calculation.expected_return_date)}
                  </span>
                </span>
                <span className="rounded-xl bg-surface p-2 shadow-soft min-w-0">
                  <span className="block text-xs text-muted truncate">Supporting docs</span>
                  <span
                    className={`font-semibold truncate block ${
                      calculation.requires_attachment ? "text-warning" : "text-success"
                    }`}
                  >
                    {calculation.requires_attachment ? "Required" : "Not required"}
                  </span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs min-w-0">
                <span className="rounded-xl bg-surface px-2.5 py-1.5 font-semibold text-foreground shadow-soft min-w-0 truncate">
                  Available: {Number(calculation.available_hours).toFixed(2)}h
                </span>
                <span
                  className={`rounded-xl bg-surface px-2.5 py-1.5 font-semibold shadow-soft min-w-0 truncate ${
                    calculation.exceeds_balance ? "text-danger" : "text-success"
                  }`}
                >
                  Remaining: {Number(calculation.remaining_hours).toFixed(2)}h
                </span>
              </div>

              {calculation.exceeds_balance ? (
                <p className="text-xs font-semibold text-danger break-words">
                  You do not have enough hours for this request.
                </p>
              ) : null}

              {holidayDays.length > 0 ? (
                <div className="rounded-xl bg-surface p-2.5 shadow-soft min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    Public holidays in this request
                  </p>
                  <ul className="mt-1 grid gap-1 text-xs text-muted">
                    {holidayDays.map((day) => (
                      <li key={day.date} className="break-words">
                        {formatDate(day.date)} - {day.label ?? "Public holiday"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex w-full min-w-0 max-w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-soft">
              <span className="font-semibold text-foreground">Hours requested</span>
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                0.00h
              </span>
            </div>
          )}

          <label className="grid w-full min-w-0 max-w-full gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Attachment Link
            </span>
            <span className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3.5 overflow-hidden">
              <Link className="size-4 shrink-0 text-muted" />
              <input
                name="attachment_url"
                value={attachmentUrl}
                onChange={(event) => setAttachmentUrl(event.target.value)}
                className="h-10 w-full min-w-0 max-w-full flex-1 truncate bg-transparent text-sm text-foreground outline-none"
                placeholder="Attachment link, if needed"
              />
            </span>
          </label>
          <StorageUploadButton
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            folder="attachment"
            hint="Allowed: PDF, JPG, PNG, WebP (Max 10 MB). Executable scripts and macro-enabled files are blocked."
            onUploaded={(publicUrl) => setAttachmentUrl(publicUrl)}
          />


          <label className="grid w-full min-w-0 max-w-full gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Reason
            </span>
            <span className="flex w-full min-w-0 max-w-full items-start gap-2 rounded-2xl border border-border bg-background px-3.5 pt-2.5 overflow-hidden">
              <FileText className="size-4 shrink-0 text-muted mt-0.5" />
              <textarea
                name="reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full min-w-0 max-w-full flex-1 bg-transparent text-sm text-foreground outline-none resize-none"
                placeholder="Reason for absence..."
              />
            </span>
          </label>

          <div className="grid w-full min-w-0 max-w-full gap-2 sm:grid-cols-2">
            <button
              formAction={calculationAction}
              disabled={calculationPending}
              className="w-full min-w-0 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-soft hover:bg-surface-muted disabled:opacity-60 transition-colors"
            >
              {calculationPending ? "Preparing..." : "Get advice"}
            </button>
            <button
              disabled={pending || Boolean(calculation?.exceeds_balance)}
              className="w-full min-w-0 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary-hover disabled:opacity-60 transition-colors"
            >
              <Send className="size-4" />
              {pending ? "Sending..." : "Send request"}
            </button>
          </div>
        </form>
      </div>

      {/* RECENT LEAVE REQUESTS */}
      {state.requests.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
            Recent leave requests
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
            {state.requests.map((request) => {
              const isApproved = request.status === "approved";
              const isRejected = request.status === "rejected";

              return (
                <article
                  key={request.id}
                  className={`flex flex-col justify-between gap-2.5 rounded-2xl p-4 text-white shadow-soft min-w-0 ${
                    isApproved
                      ? "bg-emerald-700 ring-1 ring-emerald-800/60"
                      : isRejected
                        ? "bg-rose-700 ring-1 ring-rose-800/60"
                        : "bg-amber-700 ring-1 ring-amber-800/80"
                  }`}
                >
                  {/* Top Bar: Monogram, Title, Dates & Status Badge */}
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className={`relative flex size-8.5 shrink-0 items-center justify-center rounded-full border shadow-soft text-xs font-black uppercase leading-none ${
                          isApproved
                            ? "border-emerald-500/50 bg-emerald-850 text-white"
                            : isRejected
                              ? "border-rose-500/50 bg-rose-850 text-white"
                              : "border-amber-300/50 bg-amber-800/90 text-white"
                        }`}
                      >
                        {request.leaveTypeName?.slice(0, 2) ?? "LV"}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 block size-2 rounded-full ring-2 ${
                            isApproved
                              ? "bg-emerald-300 ring-emerald-700"
                              : isRejected
                                ? "bg-rose-300 ring-rose-700"
                                : "bg-amber-300 ring-amber-700"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-white truncate">
                          {request.leaveTypeName ?? "Leave"}
                        </p>
                        <p
                          className={`text-[11px] font-medium truncate mt-0.5 ${
                            isApproved
                              ? "text-emerald-100"
                              : isRejected
                                ? "text-rose-100"
                                : "text-white/85"
                          }`}
                        >
                          {request.start_date} to {request.end_date}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                        isApproved
                          ? "bg-emerald-950/40 text-emerald-200 border border-emerald-400/30"
                          : isRejected
                            ? "bg-rose-950/50 text-rose-200 border border-rose-400/30"
                            : "bg-black/25 text-white border border-white/20"
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>

                  {/* High-Contrast White Metric Boxes */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/95 p-2 text-center text-slate-900 shadow-soft min-w-0">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">Start</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight truncate">{request.start_date}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight">End</p>
                      <p className="font-extrabold text-slate-900 text-xs break-words font-mono leading-tight truncate">{request.end_date}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">Total</p>
                      <p className="font-black text-emerald-700 text-xs break-words font-mono leading-tight">{Number(request.total_hours).toFixed(2)}h</p>
                    </div>
                  </div>

                  {request.rejection_reason ? (
                    <div className="rounded-xl bg-white p-2.5 text-xs text-slate-900 shadow-soft break-words">
                      <span className="font-extrabold uppercase tracking-wider text-rose-600">Rejection note: </span>
                      <span className="font-semibold text-slate-900">{request.rejection_reason}</span>
                    </div>
                  ) : null}

                  {/* Complementary Footer Pills */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] min-w-0 pt-0.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-semibold ${
                        isApproved
                          ? "bg-emerald-800/80 text-emerald-100"
                          : isRejected
                            ? "bg-rose-800/80 text-rose-100"
                            : "bg-black/20 text-white"
                      }`}
                    >
                      {request.use_toil_first ? "⚡ TOIL Applied" : "Standard Leave"}
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-0.5 font-bold whitespace-nowrap border ${
                        isApproved
                          ? "bg-emerald-950/40 text-emerald-200 border border-emerald-400/20"
                          : isRejected
                            ? "bg-rose-950/50 text-rose-200 border border-rose-400/20"
                            : "bg-amber-950/40 text-amber-100 border border-amber-300/20"
                      }`}
                    >
                      {isApproved ? "Approved by Manager" : isRejected ? "Action Needed" : "Pending Review"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ENHANCED TOIL CONVERTER & PREVIEW CARD (Strictly rendered only when TOIL engine is enabled) */}
      {isToilEngineActive ? (
        <section className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 text-foreground shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  Convert Overtime to TOIL
                </h3>
              <span className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted">
                BCEA Statutory (×{multiplier} Rate)
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Accrue worked overtime as Time Off In Lieu (TOIL), preview your projected balance live, or take TOIL directly as leave.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTakeTimeOffAsToil}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:bg-surface-muted transition shadow-soft cursor-pointer"
            >
              Take Time Off as TOIL
            </button>
          </div>
        </div>

        {/* CONTROLS: PERIOD & HOURS SELECTION */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Period Selector */}
          <div className="rounded-2xl border border-border/80 bg-surface-muted/30 p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Payroll Period / Cycle
              </label>
              <span className="text-xs font-bold text-foreground">
                {periodOvertime.toFixed(2)}h OT in selected period
              </span>
            </div>

            <select
              value={selectedPeriodKey}
              onChange={(e) => setSelectedPeriodKey(e.target.value)}
              className="mt-2.5 h-11 w-full rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="current">
                Current Month ({formatDate(currentMonthStart)} - {formatDate(currentMonthEnd)})
              </option>
              <option value="previous">
                Previous Month ({formatDate(prevMonthStart)} - {formatDate(prevMonthEnd)})
              </option>
              {generatedPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({formatDate(p.startDate)} - {formatDate(p.endDate)})
                </option>
              ))}
              <option value="custom">Custom Date Range...</option>
            </select>

            {selectedPeriodKey === "custom" ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-muted">From</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-muted">To</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1 h-10 w-full rounded-full border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
            ) : null}

            <p className="mt-2 text-xs text-muted">
              Active Range: <span className="font-semibold text-foreground">{activeStart} to {activeEnd}</span>
            </p>
          </div>

          {/* Overtime Hours to Convert */}
          <div className="rounded-2xl border border-border/80 bg-surface-muted/30 p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Overtime to Convert
              </label>
              <span className="text-xs font-medium text-muted">
                Rate: 1h OT = {multiplier}h TOIL
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConversionMode("all")}
                className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold transition shadow-soft ${
                  conversionMode === "all"
                    ? "bg-primary text-white"
                    : "border border-border bg-surface text-foreground hover:bg-surface-muted"
                }`}
              >
                All Overtime ({periodOvertime.toFixed(2)}h)
              </button>

              <button
                type="button"
                onClick={() => {
                  setConversionMode("custom");
                  if (!customHoursInput) {
                    setCustomHoursInput(periodOvertime > 0 ? periodOvertime.toString() : "1.00");
                  }
                }}
                className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold transition shadow-soft ${
                  conversionMode === "custom"
                    ? "bg-primary text-white"
                    : "border border-border bg-surface text-foreground hover:bg-surface-muted"
                }`}
              >
                Custom Hours
              </button>
            </div>

            {conversionMode === "custom" ? (
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={customHoursInput}
                  onChange={(e) => setCustomHoursInput(e.target.value)}
                  placeholder="e.g. 4.00"
                  className="h-10 w-full rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground outline-none focus:border-primary"
                />
                <span className="text-xs font-semibold text-muted">hours</span>
              </div>
            ) : null}

            <p className="mt-2 text-xs text-muted">
              Selected to convert:{" "}
              <span className="font-bold text-foreground">
                {effectiveOtHours.toFixed(2)} hours
              </span>
            </p>
          </div>
        </div>

        {/* LIVE TOIL PROJECTION DASHBOARD ("WHAT YOUR TOIL WILL LOOK LIKE") */}
        <div className="mt-4 rounded-2xl border border-border/80 bg-surface-muted/40 p-4 shadow-soft">
          <div className="font-bold text-xs uppercase tracking-wider text-muted">
            Live TOIL Projection (What your balance will look like)
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Metric 1: OT hours */}
            <div className="rounded-2xl border border-border/80 bg-surface p-3 shadow-soft">
              <span className="block text-[10px] font-bold uppercase text-muted">
                Overtime To Convert
              </span>
              <span className="mt-0.5 block text-lg font-black text-foreground">
                {effectiveOtHours.toFixed(2)}h
              </span>
              <span className="text-[10px] text-muted">From timesheet</span>
            </div>

            {/* Metric 2: Multiplier */}
            <div className="rounded-2xl border border-border/80 bg-surface p-3 shadow-soft">
              <span className="block text-[10px] font-bold uppercase text-muted">
                Multiplier Rate
              </span>
              <span className="mt-0.5 block text-lg font-black text-foreground">
                ×{multiplier.toFixed(1)}
              </span>
              <span className="text-[10px] text-muted">BCEA standard</span>
            </div>

            {/* Metric 3: TOIL Earned */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-3 shadow-soft">
              <span className="block text-[10px] font-bold uppercase text-emerald-800">
                TOIL Earned
              </span>
              <span className="mt-0.5 block text-lg font-black text-emerald-900">
                +{projectedEarnedToil.toFixed(2)}h
              </span>
              <span className="text-[10px] text-emerald-800/80">Paid comp hours</span>
            </div>

            {/* Metric 4: Projected New Balance */}
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3 shadow-soft">
              <span className="block text-[10px] font-bold uppercase text-primary">
                New TOIL Balance
              </span>
              <span className="mt-0.5 block text-xl font-black text-foreground">
                {projectedNewBalance.toFixed(2)}h
              </span>
              <span className="text-[10px] font-semibold text-muted">
                Current: {toilAvailableHours.toFixed(2)}h
              </span>
            </div>
          </div>

          {/* Visual Step Sequence */}
          <div className="mt-3 rounded-2xl border border-border/80 bg-gradient-to-r from-surface via-surface-muted/30 to-surface p-3 sm:p-3.5 shadow-soft">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 text-xs">
              <div className="flex items-center justify-between sm:justify-start gap-2 rounded-xl bg-surface p-2 sm:p-0 sm:bg-transparent border sm:border-0 border-border/60">
                <span className="text-[11px] font-semibold text-muted">Current Balance</span>
                <span className="font-mono font-black text-foreground">
                  {toilAvailableHours.toFixed(2)}h
                </span>
              </div>

              <div className="hidden sm:flex items-center text-muted">
                <ArrowRight className="size-3.5 shrink-0 text-muted" />
              </div>

              <div className="flex items-center justify-between sm:justify-start gap-2 rounded-xl bg-emerald-500/10 px-2.5 py-1.5 border border-emerald-500/20 sm:border-0">
                <span className="text-[11px] font-semibold text-emerald-800">Accrue TOIL</span>
                <span className="font-mono font-black text-emerald-700">
                  +{projectedEarnedToil.toFixed(2)}h
                </span>
              </div>

              <div className="hidden sm:flex items-center text-muted">
                <ArrowRight className="size-3.5 shrink-0 text-muted" />
              </div>

              <div className="flex items-center justify-between sm:justify-start gap-2 rounded-xl bg-primary/15 px-3 py-1.5 border border-primary/30">
                <span className="text-[11px] font-bold text-foreground">Projected Balance</span>
                <span className="font-mono font-black text-primary text-sm">
                  {projectedNewBalance.toFixed(2)}h
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* FEEDBACK MESSAGE */}
        {toilState.message ? (
          <div
            className={`mt-4 rounded-2xl border p-4 text-xs font-semibold shadow-soft ${
              toilState.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                : "border-rose-500/40 bg-rose-500/10 text-rose-700"
            }`}
          >
            {toilState.ok ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                {toilState.message}
              </span>
            ) : (
              <span>{toilState.message}</span>
            )}
          </div>
        ) : null}

        {/* ACTION BUTTON FORM */}
        <form action={toilAction} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="period_start" value={activeStart} />
          <input type="hidden" name="period_end" value={activeEnd} />
          <input
            type="hidden"
            name="hours_to_convert"
            value={effectiveOtHours > 0 ? effectiveOtHours.toString() : ""}
          />

          <button
            type="submit"
            disabled={toilPending || effectiveOtHours <= 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-soft transition hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {toilPending ? (
              <>
                <Loader2 className="size-4 animate-spin text-primary-foreground" />
                Converting Overtime...
              </>
            ) : (
              <>Convert {effectiveOtHours.toFixed(2)}h OT to {projectedEarnedToil.toFixed(2)}h TOIL</>
            )}
          </button>

          {effectiveOtHours <= 0 ? (
            <p className="flex items-center gap-1 text-xs text-muted">
              <Info className="size-3.5 text-muted shrink-0" />
              No overtime found in the selected period. Switch periods or enter custom hours above.
            </p>
          ) : null}
        </form>
      </section>
      ) : null}
    </section>
  );
}
