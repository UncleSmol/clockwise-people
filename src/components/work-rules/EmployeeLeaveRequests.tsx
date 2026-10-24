"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  History,
  Info,
  Link,
  List,
  Loader2,
  Send,
  Sparkles,
  X,
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
import type {
  CompanyPublicHoliday,
  EmployeeScheduleInfo,
  TimeEntryRecord,
} from "@/lib/time-tracking/schema";
import {
  defaultPayrollConfig,
  generatePayrollPeriods,
  type PayrollPeriodConfig,
} from "@/lib/reports/payroll-periods";

type EmployeeLeaveRequestsProps = {
  state: EmployeeLeaveState;
  entries?: TimeEntryRecord[];
  payrollConfig?: PayrollPeriodConfig;
  publicHolidays?: CompanyPublicHoliday[];
  workSchedule?: EmployeeScheduleInfo | null;
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

function checkIsWorkingDay(dateStr: string, workSchedule?: EmployeeScheduleInfo | null): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sun, 1 = Mon ...
  if (workSchedule?.days && workSchedule.days.length > 0) {
    const dayRule = workSchedule.days.find((r) => r.day_of_week === dayOfWeek);
    if (dayRule !== undefined) {
      return Boolean(dayRule.is_working_day);
    }
  }
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

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
  publicHolidays = [],
  workSchedule = null,
}: EmployeeLeaveRequestsProps) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [reason, setReason] = useState("");
  const [useToilFirst, setUseToilFirst] = useState(true);
  const [applicationMode, setApplicationMode] = useState<"leave" | "time_off">("leave");
  const [timeOffHours, setTimeOffHours] = useState<string>("4");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "submitted" | "approved" | "rejected">("all");

  const annualLeaveType = useMemo(
    () =>
      state.leaveTypes.find(
        (lt) => lt.category === "annual" || lt.name.toLowerCase().includes("annual"),
      ),
    [state.leaveTypes],
  );

  const selectedDateEntry = useMemo(() => {
    if (!startDate) return null;
    return entries.find((e) => e.work_date === startDate) ?? null;
  }, [entries, startDate]);

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

      if (result.ok) {
        setLeaveTypeId("");
        setStartDate("");
        setEndDate("");
        setAttachmentUrl("");
        setReason("");
        setTimeOffHours("4");
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
  const timesheetDateSet = useMemo(
    () =>
      new Set(
        entries
          .filter((e) => !e.notes?.startsWith("Public holiday:"))
          .map((e) => e.work_date),
      ),
    [entries],
  );

  const holidayMap = useMemo(
    () => new Map(publicHolidays.map((h) => [h.holiday_date, h.name])),
    [publicHolidays],
  );

  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => new Date());

  const eligiblePastDays = useMemo(() => {
    const list: { dateStr: string; dayName: string; formatted: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${day}`;

      const hasTimesheet = timesheetDateSet.has(dateStr);
      const isHoliday = holidayMap.has(dateStr);
      const working = checkIsWorkingDay(dateStr, workSchedule);

      if (!hasTimesheet && !isHoliday && working) {
        const formatted = new Intl.DateTimeFormat("en-ZA", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(d);
        list.push({
          dateStr,
          dayName: d.toLocaleDateString("en-ZA", { weekday: "short" }),
          formatted,
        });
      }
    }
    return list;
  }, [timesheetDateSet, holidayMap, workSchedule]);

  const rangeConflicts = useMemo(() => {
    if (!startDate) return [];
    const sDate = startDate;
    const eDate = endDate || startDate;
    if (sDate > eDate) return [];

    const conflicts: {
      dateStr: string;
      type: "timesheet" | "holiday" | "non_working";
      label: string;
    }[] = [];
    const [sy, sm, sd] = sDate.split("-").map(Number);
    const [ey, em, ed] = eDate.split("-").map(Number);
    const curr = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, "0");
      const d = String(curr.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;

      if (dateStr < todayIso) {
        if (timesheetDateSet.has(dateStr)) {
          conflicts.push({
            dateStr,
            type: "timesheet",
            label: `Timesheet loaded (${dateStr})`,
          });
        } else if (holidayMap.has(dateStr)) {
          conflicts.push({
            dateStr,
            type: "holiday",
            label: `Public holiday: ${holidayMap.get(dateStr)} (${dateStr})`,
          });
        } else if (!checkIsWorkingDay(dateStr, workSchedule)) {
          conflicts.push({
            dateStr,
            type: "non_working",
            label: `Off-day under work schedule (${dateStr})`,
          });
        }
      }
      curr.setDate(curr.getDate() + 1);
    }
    return conflicts;
  }, [startDate, endDate, todayIso, timesheetDateSet, holidayMap, workSchedule]);

  const hasBlockingConflict =
    applicationMode === "time_off"
      ? false
      : rangeConflicts.some((c) => c.type === "timesheet");

  const appliedLeaveMap = useMemo(() => {
    const map = new Map<
      string,
      { status: string; leaveTypeName: string; isTimeOff: boolean; hours: number }
    >();
    for (const req of state.requests) {
      if (req.status === "cancelled") continue;
      const [sy, sm, sd] = req.start_date.split("-").map(Number);
      const [ey, em, ed] = req.end_date.split("-").map(Number);
      const curr = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, "0");
        const d = String(curr.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${d}`;
        if (!map.has(dateStr) || req.status === "submitted") {
          map.set(dateStr, {
            status: req.status,
            leaveTypeName: req.leaveTypeName ?? "Leave",
            isTimeOff: req.reason?.includes("Time Off") ?? false,
            hours: Number(req.total_hours ?? 0),
          });
        }
        curr.setDate(curr.getDate() + 1);
      }
    }
    return map;
  }, [state.requests]);

  const calendarDays = useMemo(() => {
    const year = calendarViewMonth.getFullYear();
    const month = calendarViewMonth.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDay = (firstDayOfMonth.getDay() + 6) % 7;
    const totalDays = lastDayOfMonth.getDate();

    const days: {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isPast: boolean;
      isToday: boolean;
      hasTimesheet: boolean;
      isHoliday: boolean;
      holidayName: string | null;
      isWorkingDay: boolean;
      isEligiblePast: boolean;
      isSelected: boolean;
      isInRange: boolean;
      appliedLeave: {
        status: string;
        leaveTypeName: string;
        isTimeOff: boolean;
        hours: number;
      } | null;
    }[] = [];

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const isPast = dateStr < todayIso;
      const isToday = dateStr === todayIso;
      const hasTimesheet = timesheetDateSet.has(dateStr);
      const isHoliday = holidayMap.has(dateStr);
      const holidayName = holidayMap.get(dateStr) ?? null;
      const working = checkIsWorkingDay(dateStr, workSchedule);
      const isEligiblePast = isPast && !hasTimesheet && !isHoliday && working;
      const isSelected = dateStr === startDate || dateStr === endDate;
      const isInRange = Boolean(startDate && endDate && dateStr >= startDate && dateStr <= endDate);
      const appliedLeave = appliedLeaveMap.get(dateStr) ?? null;

      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isPast,
        isToday,
        hasTimesheet,
        isHoliday,
        holidayName,
        isWorkingDay: working,
        isEligiblePast,
        isSelected,
        isInRange,
        appliedLeave,
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isPast = dateStr < todayIso;
      const isToday = dateStr === todayIso;
      const hasTimesheet = timesheetDateSet.has(dateStr);
      const isHoliday = holidayMap.has(dateStr);
      const holidayName = holidayMap.get(dateStr) ?? null;
      const working = checkIsWorkingDay(dateStr, workSchedule);
      const isEligiblePast = isPast && !hasTimesheet && !isHoliday && working;
      const isSelected = dateStr === startDate || dateStr === endDate;
      const isInRange = Boolean(startDate && endDate && dateStr >= startDate && dateStr <= endDate);
      const appliedLeave = appliedLeaveMap.get(dateStr) ?? null;

      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isPast,
        isToday,
        hasTimesheet,
        isHoliday,
        holidayName,
        isWorkingDay: working,
        isEligiblePast,
        isSelected,
        isInRange,
        appliedLeave,
      });
    }

    const remainingCells = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remainingCells; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isPast = dateStr < todayIso;
      const isToday = dateStr === todayIso;
      const hasTimesheet = timesheetDateSet.has(dateStr);
      const isHoliday = holidayMap.has(dateStr);
      const holidayName = holidayMap.get(dateStr) ?? null;
      const working = checkIsWorkingDay(dateStr, workSchedule);
      const isEligiblePast = isPast && !hasTimesheet && !isHoliday && working;
      const isSelected = dateStr === startDate || dateStr === endDate;
      const isInRange = Boolean(startDate && endDate && dateStr >= startDate && dateStr <= endDate);
      const appliedLeave = appliedLeaveMap.get(dateStr) ?? null;

      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isPast,
        isToday,
        hasTimesheet,
        isHoliday,
        holidayName,
        isWorkingDay: working,
        isEligiblePast,
        isSelected,
        isInRange,
        appliedLeave,
      });
    }

    return days;
  }, [calendarViewMonth, todayIso, timesheetDateSet, holidayMap, workSchedule, startDate, endDate, appliedLeaveMap]);

  function handleCalendarDateSelect(dateStr: string, isPast: boolean, isEligiblePast: boolean) {
    if (applicationMode === "time_off") {
      setStartDate(dateStr);
      setEndDate(dateStr);
      return;
    }
    if (isPast && !isEligiblePast) return;
    if (!startDate || (startDate && endDate && startDate !== endDate)) {
      setStartDate(dateStr);
      setEndDate(dateStr);
    } else if (startDate && (!endDate || startDate === endDate)) {
      if (dateStr < startDate) {
        setStartDate(dateStr);
        setEndDate(startDate);
      } else {
        setEndDate(dateStr);
      }
    }
  }

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

          {/* Application Mode Switcher: Full Day Leave vs Time Off */}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-muted/50 p-1">
            <button
              type="button"
              onClick={() => {
                setApplicationMode("leave");
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                applicationMode === "leave"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <CalendarPlus className="size-3.5" />
              <span>Full Day Leave</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setApplicationMode("time_off");
                if (annualLeaveType) {
                  setLeaveTypeId(annualLeaveType.id);
                }
                if (startDate) {
                  setEndDate(startDate);
                }
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-bold transition-all cursor-pointer ${
                applicationMode === "time_off"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Clock className="size-3.5" />
              <span>Time Off (Partial Day)</span>
            </button>
          </div>

          {/* Time Off Banner & Guidance */}
          {applicationMode === "time_off" ? (
            <div className="w-full min-w-0 max-w-full rounded-2xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-950 shadow-soft">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <Clock className="size-4 text-amber-600 shrink-0" />
                <span>Time Off — Booked Under Annual Leave</span>
              </div>
              <p className="mt-1 text-[11px] text-amber-900 leading-relaxed">
                Applied for days where you clocked in for work but had to leave early.
                These hours are booked under <strong>Annual Leave</strong> without conflicting with your timesheet.
              </p>
            </div>
          ) : null}

          {/* Shift Details on Selected Date if in Time Off mode */}
          {applicationMode === "time_off" && startDate && selectedDateEntry ? (
            <div className="w-full rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-amber-950">Clocked Shift on {formatDate(startDate)}</span>
                <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">
                  {Number(selectedDateEntry.paid_hours ?? 0).toFixed(2)}h worked
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted text-[11px]">
                <span>In: <strong className="text-foreground">{selectedDateEntry.clock_in ? selectedDateEntry.clock_in.slice(0, 5) : "--:--"}</strong></span>
                <span>Lunch: <strong className="text-foreground">{selectedDateEntry.lunch_start ? selectedDateEntry.lunch_start.slice(0, 5) : "--"} - {selectedDateEntry.lunch_end ? selectedDateEntry.lunch_end.slice(0, 5) : "--"}</strong></span>
                <span>Out: <strong className="text-foreground">{selectedDateEntry.clock_out ? selectedDateEntry.clock_out.slice(0, 5) : "--:--"}</strong></span>
              </div>
              {(() => {
                const std = state.standardDailyHours || 8;
                const worked = Number(selectedDateEntry.paid_hours ?? 0);
                const unworked = Math.max(0, std - worked);
                return unworked > 0 ? (
                  <p className="mt-2 text-[11px] font-semibold text-amber-900">
                    💡 Standard shift is {std}h. Unworked balance: <strong>{unworked.toFixed(1)}h</strong>.
                  </p>
                ) : null;
              })()}
            </div>
          ) : null}

          {/* Time Off Hours input when in Time Off mode */}
          {applicationMode === "time_off" ? (
            <div className="grid w-full min-w-0 max-w-full gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Time Off Hours to Deduct
                </span>
                <span className="text-[11px] font-bold text-amber-800">
                  Deducted from Annual Leave
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-xl border border-border bg-background px-3 py-1">
                  <input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={timeOffHours}
                    onChange={(e) => setTimeOffHours(e.target.value)}
                    className="w-16 bg-transparent text-sm font-bold text-foreground outline-none"
                  />
                  <span className="text-xs font-bold text-muted ml-1">hours</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {["1", "2", "3", "4", "5", "6"].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setTimeOffHours(h)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                        timeOffHours === h
                          ? "bg-amber-600 text-white shadow-xs"
                          : "border border-border bg-surface text-muted hover:text-foreground"
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                  {selectedDateEntry && (() => {
                    const std = state.standardDailyHours || 8;
                    const worked = Number(selectedDateEntry.paid_hours ?? 0);
                    const unworked = Math.max(0, std - worked);
                    if (unworked > 0 && !["1", "2", "3", "4", "5", "6"].includes(String(unworked))) {
                      return (
                        <button
                          key="suggested"
                          type="button"
                          onClick={() => setTimeOffHours(String(unworked))}
                          className="rounded-lg border border-amber-400 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 transition"
                        >
                          Suggest ({unworked.toFixed(1)}h)
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          ) : null}

          {/* Hidden inputs for Time Off and total hours */}
          <input
            type="hidden"
            name="is_time_off"
            value={applicationMode === "time_off" ? "true" : "false"}
          />
          <input
            type="hidden"
            name="time_off_hours"
            value={timeOffHours}
          />
          <input
            type="hidden"
            name="request_total_hours"
            value={applicationMode === "time_off" ? timeOffHours : (calculation ? String(calculation.total_hours) : "")}
          />

          <label className="grid w-full min-w-0 max-w-full gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Leave Type {applicationMode === "time_off" ? "(Allocated under Annual Leave)" : ""}
            </span>
            <span className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3.5 overflow-hidden">
              <List className="size-4 shrink-0 text-muted" />
              <select
                name="leave_type_id"
                value={applicationMode === "time_off" && annualLeaveType ? annualLeaveType.id : leaveTypeId}
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

          {/* Quick Select Tray: Past Unlogged Work Days (No Timesheet Loaded) */}
          {eligiblePastDays.length > 0 && (
            <div className="w-full min-w-0 max-w-full rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                  <Sparkles className="size-4 text-emerald-600 shrink-0" />
                  <span>Past Unlogged Work Days ({eligiblePastDays.length} available for leave)</span>
                </div>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Work Rule &amp; Holiday Verified
                </span>
              </div>
              <p className="mt-1 text-[11px] text-emerald-800 break-words">
                Under company rules, leave for past days can only be requested for days where no timesheets were loaded. Click any day to quick-select:
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {eligiblePastDays.slice(0, 8).map((day) => {
                  const isDaySelected = startDate === day.dateStr && endDate === day.dateStr;
                  return (
                    <button
                      key={day.dateStr}
                      type="button"
                      onClick={() => {
                        setStartDate(day.dateStr);
                        setEndDate(day.dateStr);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                        isDaySelected
                          ? "bg-emerald-700 text-white shadow-soft scale-105"
                          : "border border-emerald-300/80 bg-white text-emerald-950 hover:bg-emerald-100 hover:border-emerald-400"
                      }`}
                    >
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <span>{day.formatted}</span>
                      {isDaySelected && <Check className="size-3 text-white ml-0.5" />}
                    </button>
                  );
                })}
                {eligiblePastDays.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowCalendarPicker(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white/90 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                  >
                    <span>+{eligiblePastDays.length - 8} more in calendar</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Date Picker Header with Toggle Button */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Leave Dates
            </span>
            <button
              type="button"
              onClick={() => setShowCalendarPicker((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-all cursor-pointer shadow-soft"
            >
              <Calendar className="size-3.5" />
              <span>{showCalendarPicker ? "Close Calendar Picker" : "Open Calendar Date Picker"}</span>
            </button>
          </div>

          {/* Interactive Calendar Date Picker Modal/Popover */}
          {showCalendarPicker && (
            <div className="w-full min-w-0 max-w-full rounded-2xl border border-border bg-surface p-3.5 sm:p-4 shadow-soft">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/80">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                    className="grid size-8 place-items-center rounded-full border border-border bg-surface hover:bg-surface-muted transition text-foreground cursor-pointer shadow-xs"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-xs sm:text-sm font-black text-foreground min-w-[110px] text-center">
                    {calendarViewMonth.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalendarViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                    className="grid size-8 place-items-center rounded-full border border-border bg-surface hover:bg-surface-muted transition text-foreground cursor-pointer shadow-xs"
                    aria-label="Next month"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCalendarViewMonth(new Date())}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-surface-muted transition shadow-xs cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCalendarPicker(false)}
                    className="grid size-7 place-items-center rounded-full border border-border/70 hover:bg-surface-muted transition text-muted cursor-pointer"
                    aria-label="Close calendar"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Day column headers */}
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-muted">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>

              {/* Day cells grid */}
              <div className="mt-2 grid grid-cols-7 gap-1 text-center">
                {calendarDays.map((cell) => {
                  const isDisabledPast =
                    applicationMode === "time_off"
                      ? false
                      : cell.isPast && !cell.isEligiblePast;
                  let cellClass = "";
                  let badgeText = "";

                  if (cell.appliedLeave) {
                    if (cell.appliedLeave.status === "submitted" || cell.appliedLeave.status === "draft") {
                      cellClass = "border-2 border-amber-500 bg-amber-100 text-amber-950 font-black shadow-xs ring-1 ring-amber-500/50 hover:bg-amber-200 cursor-pointer";
                      badgeText = cell.appliedLeave.isTimeOff ? "TimeOff (Pending)" : "Pending";
                    } else if (cell.appliedLeave.status === "approved") {
                      cellClass = "border-2 border-emerald-600 bg-emerald-100 text-emerald-950 font-black shadow-xs ring-1 ring-emerald-600/40 hover:bg-emerald-200 cursor-pointer";
                      badgeText = cell.appliedLeave.isTimeOff ? "TimeOff (OK)" : "Approved";
                    } else if (cell.appliedLeave.status === "rejected") {
                      cellClass = "border border-rose-400 bg-rose-100 text-rose-950 font-bold hover:bg-rose-200 cursor-pointer";
                      badgeText = "Declined";
                    }
                  } else if (isDisabledPast) {
                    if (cell.hasTimesheet) {
                      cellClass = "border border-slate-200 bg-slate-100 text-slate-400 opacity-60 cursor-not-allowed line-through";
                      badgeText = "Worked";
                    } else if (cell.isHoliday) {
                      cellClass = "border border-purple-200 bg-purple-50 text-purple-400 opacity-60 cursor-not-allowed";
                      badgeText = "Holiday";
                    } else {
                      cellClass = "border border-dashed border-slate-200 bg-slate-50 text-slate-300 opacity-50 cursor-not-allowed";
                      badgeText = "Off";
                    }
                  } else if (cell.isEligiblePast) {
                    if (cell.isSelected) {
                      cellClass = "border-2 border-emerald-600 bg-emerald-600 text-white font-black shadow-md scale-105";
                    } else if (cell.isInRange) {
                      cellClass = "border border-emerald-400 bg-emerald-100 text-emerald-950 font-bold";
                    } else {
                      cellClass = "border-2 border-emerald-400 bg-emerald-50 text-emerald-900 font-bold hover:bg-emerald-100 hover:scale-105 cursor-pointer shadow-xs";
                    }
                    badgeText = "Eligible";
                  } else {
                    // Today or Future
                    if (cell.isSelected) {
                      cellClass = "bg-primary text-primary-foreground font-black ring-2 ring-primary ring-offset-2 scale-105 shadow-md";
                    } else if (cell.isInRange) {
                      cellClass = "border border-primary/40 bg-primary/15 text-primary font-bold";
                    } else if (cell.isToday) {
                      cellClass = "border-2 border-primary/60 bg-surface text-foreground font-extrabold hover:bg-surface-muted cursor-pointer";
                      badgeText = "Today";
                    } else if (cell.isHoliday) {
                      cellClass = "border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 cursor-pointer";
                      badgeText = "Holiday";
                    } else if (!cell.isWorkingDay) {
                      cellClass = "border border-dashed border-border/80 bg-surface-muted/40 text-muted cursor-pointer hover:bg-surface-muted";
                      badgeText = "Off";
                    } else {
                      cellClass = cell.isCurrentMonth
                        ? "border border-border bg-surface text-foreground hover:bg-surface-muted hover:border-primary/50 cursor-pointer"
                        : "border border-border/50 bg-surface/50 text-muted/60 hover:bg-surface-muted cursor-pointer";
                    }
                  }

                  const title = cell.appliedLeave
                    ? `${cell.dateStr}: ${cell.appliedLeave.isTimeOff ? "Time Off" : "Leave"} applied (${cell.appliedLeave.leaveTypeName}) - Status: ${cell.appliedLeave.status.toUpperCase()}`
                    : cell.isPast
                      ? cell.hasTimesheet
                        ? `${cell.dateStr}: Timesheet loaded. ${applicationMode === "time_off" ? "Click to request Time Off for this shift." : "Cannot request full-day leave."}`
                        : cell.isHoliday
                          ? `${cell.dateStr}: Public holiday (${cell.holidayName}).`
                          : !cell.isWorkingDay
                            ? `${cell.dateStr}: Scheduled off-day under work rule.`
                            : `${cell.dateStr}: Unlogged work day. Eligible for leave.`
                      : cell.dateStr;

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      disabled={isDisabledPast}
                      onClick={() => handleCalendarDateSelect(cell.dateStr, cell.isPast, cell.isEligiblePast)}
                      title={title}
                      className={`flex min-h-[46px] sm:min-h-[52px] flex-col items-center justify-between rounded-xl p-1 text-xs transition-all ${cellClass}`}
                    >
                      <span className="font-extrabold leading-none mt-0.5">{cell.dayNum}</span>
                      {badgeText ? (
                        <span className="truncate max-w-full text-[8px] sm:text-[9px] font-bold px-1 rounded leading-tight">
                          {badgeText}
                        </span>
                      ) : (
                        <span className="h-3" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legend & Controls */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-3 text-[11px]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                    <span className="size-2 rounded-full bg-amber-500" />
                    Applied (Pending)
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                    <span className="size-2 rounded-full bg-emerald-600" />
                    Approved
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-800">
                    <span className="size-2 rounded-full bg-rose-500" />
                    Declined
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    Past Unlogged
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                    <span className="size-2 rounded-full bg-slate-300" />
                    Timesheet Loaded
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-purple-700">
                    <span className="size-2 rounded-full bg-purple-400" />
                    Holiday
                  </span>
                </div>

                {startDate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="text-xs font-bold text-muted hover:text-foreground cursor-pointer underline"
                  >
                    Clear Selection
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Date Input Boxes */}
          {applicationMode === "time_off" ? (
            <label className="grid w-full min-w-0 max-w-full gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Time Off Date
              </span>
              <span className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3.5 overflow-hidden">
                <Calendar className="size-4 shrink-0 text-muted" />
                <input
                  name="start_date"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setEndDate(event.target.value);
                  }}
                  className="h-10 w-full min-w-0 max-w-full flex-1 bg-transparent text-sm text-foreground outline-none"
                />
              </span>
              <input type="hidden" name="end_date" value={startDate} />
            </label>
          ) : (
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
          )}

          {/* Range Conflict Error and Informational Banners */}
          {hasBlockingConflict && applicationMode !== "time_off" && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-900 shadow-soft">
              <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Past Timesheet Conflict</p>
                <p className="mt-0.5 text-rose-800 break-words">
                  Timesheets are already recorded on:{" "}
                  <span className="font-mono font-bold">
                    {rangeConflicts
                      .filter((c) => c.type === "timesheet")
                      .map((c) => c.dateStr)
                      .join(", ")}
                  </span>
                  . Under work rules, past full-day leave can only be requested for days where no timesheet was loaded. Switch to <strong>Time Off (Partial Day)</strong> if you worked part of this day and had to leave early.
                </p>
              </div>
            </div>
          )}

          {rangeConflicts.some((c) => c.type === "holiday") && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 shadow-soft">
              <Info className="size-4 shrink-0 text-purple-600 mt-0.5" />
              <p className="min-w-0 flex-1 break-words">
                {rangeConflicts
                  .filter((c) => c.type === "holiday")
                  .map((c) => c.label)
                  .join("; ")}
                . Public holidays are already company-paid days off.
              </p>
            </div>
          )}

          {rangeConflicts.some((c) => c.type === "non_working") && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-surface-muted/50 p-3 text-xs text-muted shadow-soft">
              <Info className="size-4 shrink-0 text-muted mt-0.5" />
              <p className="min-w-0 flex-1 break-words">
                {rangeConflicts
                  .filter((c) => c.type === "non_working")
                  .map((c) => c.label)
                  .join("; ")}
              </p>
            </div>
          )}

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
            {applicationMode !== "time_off" ? (
              <button
                formAction={calculationAction}
                disabled={calculationPending}
                className="w-full min-w-0 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-soft hover:bg-surface-muted disabled:opacity-60 transition-colors"
              >
                {calculationPending ? "Preparing..." : "Get advice"}
              </button>
            ) : null}
            <button
              disabled={
                pending ||
                (applicationMode === "time_off"
                  ? !startDate || Number(timeOffHours) <= 0
                  : hasBlockingConflict || Boolean(calculation?.exceeds_balance))
              }
              className={`w-full min-w-0 inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-soft disabled:opacity-60 transition-colors ${
                applicationMode === "time_off"
                  ? "bg-amber-600 hover:bg-amber-700 sm:col-span-2"
                  : "bg-primary hover:bg-primary-hover"
              }`}
            >
              <Send className="size-4" />
              {pending
                ? "Sending..."
                : applicationMode === "time_off"
                  ? "Submit Time Off Request"
                  : "Send request"}
            </button>
          </div>
        </form>
      </div>

      {/* MY LEAVE APPLICATIONS & LIFECYCLE TRACKER */}
      <section className="rounded-2xl border border-border/80 bg-surface p-4 sm:p-5 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3.5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
              <History className="size-4.5 text-primary" />
              <span>My Leave Applications</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Track your leave applications in real time from draft to submission, approval, or rejection — same as your timesheets.
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-surface-muted/60 border border-border">
            <button
              type="button"
              onClick={() => setHistoryStatusFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                historyStatusFilter === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              All ({state.requests.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryStatusFilter("submitted")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                historyStatusFilter === "submitted"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-amber-700 hover:text-amber-800"
              }`}
            >
              Pending ({state.requests.filter((r) => r.status === "submitted" || r.status === "draft").length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryStatusFilter("approved")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                historyStatusFilter === "approved"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-emerald-700 hover:text-emerald-800"
              }`}
            >
              Approved ({state.requests.filter((r) => r.status === "approved").length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryStatusFilter("rejected")}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                historyStatusFilter === "rejected"
                  ? "bg-rose-700 text-white shadow-xs"
                  : "text-rose-700 hover:text-rose-800"
              }`}
            >
              Declined ({state.requests.filter((r) => r.status === "rejected").length})
            </button>
          </div>
        </div>

        {/* Requests Cards Grid */}
        {(() => {
          const filtered =
            historyStatusFilter === "all"
              ? state.requests
              : historyStatusFilter === "submitted"
                ? state.requests.filter((r) => r.status === "submitted" || r.status === "draft")
                : state.requests.filter((r) => r.status === historyStatusFilter);

          if (filtered.length === 0) {
            return (
              <div className="py-8 text-center text-xs text-muted">
                {historyStatusFilter === "all"
                  ? "You haven't submitted any leave or time off requests yet."
                  : `No requests in the "${historyStatusFilter}" category.`}
              </div>
            );
          }

          return (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3.5 items-start">
              {filtered.map((request) => {
                const isApproved = request.status === "approved";
                const isRejected = request.status === "rejected";
                const isPending = request.status === "submitted" || request.status === "draft";
                const isTimeOff =
                  request.reason?.includes("Time Off") ||
                  (request.start_date === request.end_date &&
                    Number(request.total_hours) < (state.standardDailyHours || 8));

                return (
                  <article
                    key={request.id}
                    className={`flex flex-col justify-between gap-3 rounded-2xl p-4 text-white shadow-soft min-w-0 transition-all ${
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-extrabold text-white truncate">
                              {request.leaveTypeName ?? "Leave"}
                            </p>
                            {isTimeOff && (
                              <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider text-white border border-white/30">
                                Time Off
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-[11px] font-medium truncate mt-0.5 ${
                              isApproved
                                ? "text-emerald-100"
                                : isRejected
                                  ? "text-rose-100"
                                  : "text-white/85"
                            }`}
                          >
                            {request.start_date === request.end_date
                              ? formatDate(request.start_date)
                              : `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`}
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
                        {isPending ? "Pending Review" : isApproved ? "Approved" : "Declined"}
                      </span>
                    </div>

                    {/* Lifecycle Stepper (Draft -> Submitted -> Approved/Rejected) */}
                    <div className="rounded-xl bg-black/15 p-2 text-[10px]">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1 text-white">
                          <CheckCircle2 className="size-3 text-white" /> Draft
                        </span>
                        <span className="h-0.5 flex-1 mx-2 bg-white/30" />
                        <span className="flex items-center gap-1 text-white">
                          <CheckCircle2 className="size-3 text-white" /> Submitted
                        </span>
                        <span className="h-0.5 flex-1 mx-2 bg-white/30" />
                        <span
                          className={`flex items-center gap-1 ${
                            isApproved
                              ? "text-emerald-200"
                              : isRejected
                                ? "text-rose-200"
                                : "text-amber-200 animate-pulse"
                          }`}
                        >
                          {isApproved ? (
                            <>
                              <CheckCircle2 className="size-3 text-emerald-300" /> Approved
                            </>
                          ) : isRejected ? (
                            <>
                              <X className="size-3 text-rose-300" /> Rejected
                            </>
                          ) : (
                            <>
                              <Clock className="size-3 text-amber-300" /> In Review
                            </>
                          )}
                        </span>
                      </div>
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
                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 break-words leading-tight">
                          {isTimeOff ? "Hours" : "Total"}
                        </p>
                        <p className="font-black text-emerald-700 text-xs break-words font-mono leading-tight">
                          {Number(request.total_hours).toFixed(2)}h
                        </p>
                      </div>
                    </div>

                    {/* Reason provided */}
                    {request.reason ? (
                      <div className="rounded-xl bg-white/10 p-2 text-[11px] text-white/90 break-words">
                        <span className="font-bold text-white/70">Reason: </span>
                        <span>{request.reason}</span>
                      </div>
                    ) : null}

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
                        {isTimeOff ? "⏱️ Time Off" : request.use_toil_first ? "⚡ TOIL Applied" : "Standard Leave"}
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
                        {isApproved ? "Approved by Manager" : isRejected ? "Declined by Manager" : "Awaiting Manager Decision"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })()}
      </section>

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
