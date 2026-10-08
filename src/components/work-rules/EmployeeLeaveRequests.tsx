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
  Palmtree,
  Send,
  Sparkles,
  Timer,
  Zap,
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

  // Identify TOIL leave type and current employee balance
  const toilLeaveType = state.leaveTypes.find(
    (lt) => lt.category === "toil_taken" || lt.name.toLowerCase().includes("toil"),
  );

  const toilBalanceItem = state.balances.find((b) => {
    const rel = Array.isArray(b.leave_types) ? b.leave_types[0] : b.leave_types;
    return (
      rel?.category === "toil_taken" ||
      rel?.id === toilLeaveType?.id ||
      rel?.name?.toLowerCase().includes("toil")
    );
  });

  const toilAvailableHours = Number(toilBalanceItem?.balance_hours ?? 0);
  const hasToilBalance = toilAvailableHours > 0;
  const isSelectingToil =
    Boolean(leaveTypeId && toilLeaveType?.id && leaveTypeId === toilLeaveType.id);

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
            Request leave, convert overtime into TOIL, and review your leave history.
          </p>
        </div>

        {toilLeaveType ? (
          <button
            type="button"
            onClick={handleTakeTimeOffAsToil}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20 active:scale-95"
          >
            <Palmtree className="size-4 text-amber-400" />
            Take Time Off as TOIL
          </button>
        ) : null}
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

      {/* BALANCES & REQUEST FORM */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.3fr]">
        {/* Available Balances */}
        <div className="min-w-0 rounded-lg border border-border bg-background p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Available balances</p>
            <span className="text-[11px] font-medium text-muted">Paid hours</span>
          </div>

          <div className="mt-3 grid gap-2">
            {state.balances.length === 0 ? (
              <p className="text-sm text-muted">No balances assigned yet.</p>
            ) : (
              state.balances.map((balance) => {
                const relation = Array.isArray(balance.leave_types)
                  ? balance.leave_types[0]
                  : balance.leave_types;
                const isToil =
                  relation?.category === "toil_taken" ||
                  relation?.id === toilLeaveType?.id ||
                  relation?.name?.toLowerCase().includes("toil");
                const balHours = Number(balance.balance_hours ?? 0);

                return (
                  <div
                    key={balance.id}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition ${
                      isToil
                        ? "border border-amber-500/30 bg-amber-500/10"
                        : "bg-surface"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {isToil ? (
                        <Zap className="size-4 shrink-0 text-amber-400" />
                      ) : null}
                      <span className="font-bold text-foreground break-words leading-tight">
                        {leaveTypeName(balance)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                          isToil
                            ? "bg-amber-400/20 text-amber-300"
                            : "bg-surface-muted text-foreground"
                        }`}
                      >
                        {balHours.toFixed(2)}h
                      </span>

                      {isToil && balHours > 0 ? (
                        <button
                          type="button"
                          onClick={handleTakeTimeOffAsToil}
                          className="text-[11px] font-bold text-amber-400 underline underline-offset-2 hover:text-amber-300"
                        >
                          Take leave
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Leave Request Form */}
        <form
          id="new-leave-request-form"
          action={formAction}
          className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-4 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">New request</p>
            {isSelectingToil ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                ⚡ TOIL Leave Selected
              </span>
            ) : null}
          </div>

          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Leave Type
            </span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <List className="size-4 shrink-0 text-muted" />
              <select
                name="leave_type_id"
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              >
                <option value="">Select leave type</option>
                {state.leaveTypes.map((lt) => {
                  const isToil =
                    lt.category === "toil_taken" ||
                    lt.id === toilLeaveType?.id ||
                    lt.name.toLowerCase().includes("toil");
                  return (
                    <option key={lt.id} value={lt.id}>
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
          {isSelectingToil ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <Zap className="size-4 text-amber-400" />
                Taking Time Off as TOIL (Time Off In Lieu)
              </div>
              <p className="mt-1 text-slate-300">
                This request will deduct 100% directly from your TOIL balance (
                <span className="font-bold text-amber-200">
                  {toilAvailableHours.toFixed(2)}h available
                </span>
                ). Your annual leave balance will remain completely untouched.
              </p>
            </div>
          ) : hasToilBalance ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 p-2.5 text-xs font-medium">
              <input
                type="checkbox"
                name="use_toil_first"
                value="true"
                checked={useToilFirst}
                onChange={(event) => setUseToilFirst(event.target.checked)}
                className="mt-0.5 size-4 rounded accent-accent"
              />
              <div className="min-w-0 flex-1">
                <span className="font-bold text-foreground">
                  Load TOIL first ({toilAvailableHours.toFixed(2)}h available)
                </span>
                <p className="mt-0.5 text-muted">
                  Your overtime comp balance will be loaded first before deducting from your annual leave unless unchecked.
                </p>
              </div>
            </label>
          ) : (
            <input type="hidden" name="use_toil_first" value="true" />
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Start Date
              </span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Calendar className="size-4 shrink-0 text-muted" />
                <input
                  name="start_date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                End Date
              </span>
              <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
                <Calendar className="size-4 shrink-0 text-muted" />
                <input
                  name="end_date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
            </label>
          </div>

          {calculation ? (
            <div
              className={`grid gap-2 rounded-md border p-3 text-sm ${
                calculation.exceeds_balance
                  ? "border-danger/30 bg-danger/10"
                  : "border-accent/30 bg-accent/10"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Sparkles className="size-4 text-accent" />
                Leave advisor
              </div>

              {calculation.load_toil_first &&
              Number(calculation.toil_hours_to_use ?? 0) > 0 ? (
                <div className="rounded-md border border-accent/40 bg-surface p-2 text-xs">
                  <p className="font-bold text-foreground">Priority deduction (TOIL loaded first):</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="rounded bg-accent/15 px-2 py-0.5 font-bold text-accent">
                      ⚡ TOIL: {Number(calculation.toil_hours_to_use).toFixed(2)}h
                    </span>
                    <span className="rounded bg-surface-muted px-2 py-0.5 font-bold text-foreground">
                      📅 {calculation.leave_type_name}: {Number(calculation.leave_hours_to_use).toFixed(2)}h
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Hours to take</span>
                  <span className="font-semibold text-foreground">
                    {Number(calculation.total_hours).toFixed(2)}h
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Working days</span>
                  <span className="font-semibold text-foreground">
                    {calculation.working_days} day{calculation.working_days === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">As days (approx)</span>
                  <span className="font-semibold text-foreground">
                    {Number(calculation.days_equivalent).toFixed(2)}d
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Leave begins</span>
                  <span className="font-semibold text-foreground">
                    {formatFullDate(startDate || calculation.days[0]?.date)}
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Return to work</span>
                  <span className="font-semibold text-foreground">
                    {formatFullDate(calculation.expected_return_date)}
                  </span>
                </span>
                <span className="rounded-md bg-surface px-2 py-1.5">
                  <span className="block text-xs text-muted">Supporting docs</span>
                  <span
                    className={`font-semibold ${
                      calculation.requires_attachment ? "text-warning" : "text-success"
                    }`}
                  >
                    {calculation.requires_attachment ? "Required" : "Not required"}
                  </span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="rounded-md bg-surface px-2 py-1 font-semibold text-foreground">
                  Available: {Number(calculation.available_hours).toFixed(2)}h
                </span>
                <span
                  className={`rounded-md bg-surface px-2 py-1 font-semibold ${
                    calculation.exceeds_balance ? "text-danger" : "text-success"
                  }`}
                >
                  Remaining: {Number(calculation.remaining_hours).toFixed(2)}h
                </span>
              </div>

              {calculation.exceeds_balance ? (
                <p className="text-xs font-semibold text-danger">
                  You do not have enough hours for this request.
                </p>
              ) : null}

              {holidayDays.length > 0 ? (
                <div className="rounded-md bg-surface px-2 py-1.5">
                  <p className="text-xs font-semibold text-foreground">
                    Public holidays in this request
                  </p>
                  <ul className="mt-1 grid gap-1 text-xs text-muted">
                    {holidayDays.map((day) => (
                      <li key={day.date}>
                        {formatDate(day.date)} - {day.label ?? "Public holiday"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <span className="font-semibold text-foreground">Hours requested</span>
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                0.00h
              </span>
            </div>
          )}

          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Attachment Link
            </span>
            <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-3">
              <Link className="size-4 shrink-0 text-muted" />
              <input
                name="attachment_url"
                value={attachmentUrl}
                onChange={(event) => setAttachmentUrl(event.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                placeholder="Attachment link, if needed"
              />
            </span>
          </label>
          <StorageUploadButton
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            folder="attachment"
            hint="Or upload a supporting file under 5 MB."
            onUploaded={(publicUrl) => setAttachmentUrl(publicUrl)}
          />

          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Reason
            </span>
            <span className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 pt-2.5">
              <FileText className="size-4 shrink-0 text-muted" />
              <textarea
                name="reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none resize-none"
                placeholder="Reason for absence..."
              />
            </span>
          </label>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <button
              formAction={calculationAction}
              disabled={calculationPending}
              className="min-w-0 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:opacity-60"
            >
              {calculationPending ? "Preparing..." : "Get advice"}
            </button>
            <button
              disabled={pending || Boolean(calculation?.exceeds_balance)}
              className="min-w-0 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
              const isSubmitted = request.status === "submitted";

              return (
                <article
                  key={request.id}
                  className={`flex flex-col justify-between gap-2.5 rounded-lg border-2 p-3.5 text-sm shadow-2xs min-w-0 ${
                    isApproved
                      ? "border-emerald-500 bg-emerald-50/40"
                      : isRejected
                        ? "border-rose-500 bg-rose-50/50"
                        : isSubmitted
                          ? "border-amber-400 bg-amber-50/40"
                          : "border-border bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-2">
                      <p className="text-xs font-extrabold text-foreground break-words leading-tight flex-1 min-w-0">
                        {request.leaveTypeName ?? "Leave"}
                      </p>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider shadow-2xs whitespace-nowrap ${
                          isApproved
                            ? "bg-emerald-600 text-white"
                            : isRejected
                              ? "bg-rose-600 text-white"
                              : isSubmitted
                                ? "bg-amber-500 text-white"
                                : "bg-slate-900 text-white"
                        }`}
                      >
                        {request.status}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-muted">
                        <span className="font-bold text-foreground">
                          {request.start_date} to {request.end_date}
                        </span>{" "}
                        ·{" "}
                        <span className="font-extrabold text-foreground">
                          {Number(request.total_hours).toFixed(2)}h
                        </span>
                      </span>

                      {request.use_toil_first ? (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                          ⚡ TOIL First
                          {request.toil_hours_used && Number(request.toil_hours_used) > 0
                            ? ` (${Number(request.toil_hours_used).toFixed(2)}h)`
                            : ""}
                        </span>
                      ) : null}
                    </div>

                    {request.rejection_reason ? (
                      <p className="mt-1.5 rounded-md border border-rose-300 bg-rose-100/80 p-2 text-xs font-semibold text-rose-950">
                        Rejection note: {request.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ENHANCED TOIL CONVERTER & PREVIEW CARD */}
      <section className="relative overflow-hidden rounded-xl border-2 border-amber-500/40 bg-slate-900 p-5 text-white shadow-lg ring-1 ring-amber-500/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-white">
                <Timer className="size-5 text-amber-400" />
                Convert Overtime to TOIL
              </h3>
              <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/30">
                BCEA Statutory (×{multiplier} Rate)
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Accrue worked overtime as Time Off In Lieu (TOIL), preview your projected balance live, or take TOIL directly as leave.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTakeTimeOffAsToil}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-400/20"
            >
              <Palmtree className="size-4 text-amber-400" />
              Take Time Off as TOIL
            </button>
          </div>
        </div>

        {/* CONTROLS: PERIOD & HOURS SELECTION */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Period Selector */}
          <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Payroll Period / Cycle
              </label>
              <span className="text-[11px] font-semibold text-amber-400">
                {periodOvertime.toFixed(2)}h OT in selected period
              </span>
            </div>

            <select
              value={selectedPeriodKey}
              onChange={(e) => setSelectedPeriodKey(e.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-white outline-none focus:border-amber-400"
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
                  <span className="block text-[10px] font-bold uppercase text-slate-400">From</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-400">To</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            ) : null}

            <p className="mt-2 text-[11px] text-slate-400">
              Active Range: <span className="font-semibold text-slate-200">{activeStart} to {activeEnd}</span>
            </p>
          </div>

          {/* Overtime Hours to Convert */}
          <div className="rounded-lg border border-slate-800 bg-slate-800/60 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Overtime to Convert
              </label>
              <span className="text-[11px] font-semibold text-slate-400">
                Rate: 1h OT = {multiplier}h TOIL
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConversionMode("all")}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  conversionMode === "all"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
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
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  conversionMode === "custom"
                    ? "bg-amber-500 text-slate-950 shadow-xs"
                    : "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
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
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white outline-none focus:border-amber-400"
                />
                <span className="text-xs font-bold text-slate-400">hours</span>
              </div>
            ) : null}

            <p className="mt-2 text-[11px] text-slate-400">
              Selected to convert:{" "}
              <span className="font-extrabold text-amber-300">
                {effectiveOtHours.toFixed(2)} hours
              </span>
            </p>
          </div>
        </div>

        {/* LIVE TOIL PROJECTION DASHBOARD ("WHAT YOUR TOIL WILL LOOK LIKE") */}
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-slate-900 to-emerald-500/10 p-4">
          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-300">
            <Sparkles className="size-4 text-amber-400" />
            Live TOIL Projection (What your balance will look like)
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Metric 1: OT hours */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
              <span className="block text-[10px] font-bold uppercase text-slate-400">
                Overtime To Convert
              </span>
              <span className="mt-0.5 block text-lg font-black text-amber-300">
                {effectiveOtHours.toFixed(2)}h
              </span>
              <span className="text-[10px] text-slate-500">From timesheet</span>
            </div>

            {/* Metric 2: Multiplier */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
              <span className="block text-[10px] font-bold uppercase text-slate-400">
                Multiplier Rate
              </span>
              <span className="mt-0.5 block text-lg font-black text-white">
                ×{multiplier.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-500">BCEA standard</span>
            </div>

            {/* Metric 3: TOIL Earned */}
            <div className="rounded-lg border border-emerald-500/30 bg-slate-950/80 p-2.5">
              <span className="block text-[10px] font-bold uppercase text-emerald-400">
                TOIL Earned
              </span>
              <span className="mt-0.5 block text-lg font-black text-emerald-400">
                +{projectedEarnedToil.toFixed(2)}h
              </span>
              <span className="text-[10px] text-emerald-500/80">Paid comp hours</span>
            </div>

            {/* Metric 4: Projected New Balance */}
            <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-2.5">
              <span className="block text-[10px] font-bold uppercase text-amber-300">
                New TOIL Balance
              </span>
              <span className="mt-0.5 block text-xl font-black text-white">
                {projectedNewBalance.toFixed(2)}h
              </span>
              <span className="text-[10px] font-semibold text-amber-300/80">
                Current: {toilAvailableHours.toFixed(2)}h
              </span>
            </div>
          </div>

          {/* Visual Step Sequence */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold">
            <span className="text-slate-400">
              Current: <strong className="text-white">{toilAvailableHours.toFixed(2)}h</strong>
            </span>
            <ArrowRight className="size-3.5 text-amber-400" />
            <span className="text-emerald-400">
              Accrue: <strong>+{projectedEarnedToil.toFixed(2)}h TOIL</strong>
            </span>
            <ArrowRight className="size-3.5 text-amber-400" />
            <span className="rounded bg-amber-400/20 px-2 py-0.5 text-amber-200 font-extrabold">
              Projected Balance: {projectedNewBalance.toFixed(2)}h
            </span>
          </div>
        </div>

        {/* FEEDBACK MESSAGE */}
        {toilState.message ? (
          <div
            className={`mt-4 rounded-lg border p-3 text-xs font-semibold ${
              toilState.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-300"
            }`}
          >
            {toilState.ok ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
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
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 text-sm font-extrabold text-slate-950 shadow-md transition hover:bg-amber-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {toilPending ? (
              <>
                <Loader2 className="size-4 animate-spin text-slate-950" />
                Converting Overtime...
              </>
            ) : (
              <>
                <Zap className="size-4 fill-slate-950 text-slate-950" />
                Convert {effectiveOtHours.toFixed(2)}h OT to {projectedEarnedToil.toFixed(2)}h TOIL
              </>
            )}
          </button>

          {effectiveOtHours <= 0 ? (
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <Info className="size-3.5 text-slate-500 shrink-0" />
              No overtime found in the selected period. Switch periods or enter custom hours above.
            </p>
          ) : null}
        </form>
      </section>
    </section>
  );
}
