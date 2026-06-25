"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  LogOut,
  Radio,
  Send,
  TimerReset,
} from "lucide-react";
import { markDashboardNotificationRead } from "@/lib/dashboard/actions";
import type { DashboardExperienceData, DashboardReminderSchedule } from "@/lib/dashboard/schema";

type DashboardExperienceProps = {
  data: DashboardExperienceData;
};

const initialState = {
  ok: true,
  message: "",
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function formatTime(value: string | null) {
  if (!value) return "Not set";

  const [hours = "0", minutes = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-ZA", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function movementLabel(value: string) {
  return value.replaceAll("_", " ");
}

function notificationTone(category: string) {
  if (category.includes("approved")) return "border-success/30 bg-success/10 text-success";
  if (category.includes("rejected")) return "border-danger/30 bg-danger/10 text-danger";
  return "border-accent/30 bg-accent/10 text-accent";
}

function scheduleDateTime(schedule: DashboardReminderSchedule, time: string | null) {
  if (!time) return null;

  const [hours = "0", minutes = "0"] = time.split(":");
  const [year, month, day] = schedule.currentWorkDate.split("-").map(Number);
  return new Date(year, month - 1, day, Number(hours), Number(minutes), 0, 0);
}

async function showDeviceNotification(title: string, body: string, tag: string) {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker?.ready.catch(() => null);

  if (registration?.active) {
    registration.active.postMessage({
      payload: { body, tag, title, url: "/dashboard/time" },
      type: "SHOW_NOTIFICATION",
    });
    return;
  }

  new Notification(title, {
    body,
    icon: "/assets/android-chrome-192x192.png",
    tag,
  });
}

function useSmartReminders(schedule: DashboardReminderSchedule | null) {
  const [popup, setPopup] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (!schedule?.isWorkingDay) return;

    const reminders = [
      {
        body: "You are scheduled to clock in in 30 minutes.",
        dueAt: scheduleDateTime(schedule, schedule.startTime),
        offsetMinutes: -30,
        skip: Boolean(schedule.todayEntry?.clock_in),
        tag: "clock-in-30",
        title: "Clock in reminder",
      },
      {
        body: "You are scheduled to clock in in 10 minutes.",
        dueAt: scheduleDateTime(schedule, schedule.startTime),
        offsetMinutes: -10,
        skip: Boolean(schedule.todayEntry?.clock_in),
        tag: "clock-in-10",
        title: "Clock in reminder",
      },
      {
        body: "You were due to clock in 5 minutes ago.",
        dueAt: scheduleDateTime(schedule, schedule.startTime),
        offsetMinutes: 5,
        skip: Boolean(schedule.todayEntry?.clock_in),
        tag: "clock-in-late-5",
        title: "Clock in still needed",
      },
      {
        body: "Your lunch break is due soon.",
        dueAt: scheduleDateTime(schedule, schedule.lunchStartTime),
        offsetMinutes: -10,
        skip: Boolean(schedule.todayEntry?.lunch_start),
        tag: "lunch-start-10",
        title: "Lunch reminder",
      },
      {
        body: "Remember to clock back in from lunch.",
        dueAt: scheduleDateTime(schedule, schedule.lunchEndTime),
        offsetMinutes: -5,
        skip: Boolean(schedule.todayEntry?.lunch_end),
        tag: "lunch-end-5",
        title: "Lunch ending",
      },
      {
        body: "You are scheduled to clock out in 10 minutes.",
        dueAt: scheduleDateTime(schedule, schedule.endTime),
        offsetMinutes: -10,
        skip: Boolean(schedule.todayEntry?.clock_out),
        tag: "clock-out-10",
        title: "Clock out reminder",
      },
    ];

    const timers = reminders.flatMap((reminder) => {
      if (!reminder.dueAt || reminder.skip) return [];

      const triggerAt = reminder.dueAt.getTime() + reminder.offsetMinutes * 60 * 1000;
      const delay = triggerAt - Date.now();

      if (delay < 0 || delay > 24 * 60 * 60 * 1000) return [];

      return [
        window.setTimeout(() => {
          setPopup({ body: reminder.body, title: reminder.title });
          showDeviceNotification(reminder.title, reminder.body, reminder.tag);
        }, delay),
      ];
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [schedule]);

  return { popup, setPopup };
}

export default function DashboardExperience({ data }: DashboardExperienceProps) {
  const [state, action, pending] = useActionState(markDashboardNotificationRead, initialState);
  const { popup, setPopup } = useSmartReminders(data.reminderSchedule);
  const nextReminder = useMemo(() => {
    const schedule = data.reminderSchedule;
    if (!schedule?.isWorkingDay) return null;
    if (!schedule.todayEntry?.clock_in) return `Clock in at ${formatTime(schedule.startTime)}`;
    if (!schedule.todayEntry?.lunch_start) return `Lunch from ${formatTime(schedule.lunchStartTime)}`;
    if (!schedule.todayEntry?.lunch_end) return `Return from lunch by ${formatTime(schedule.lunchEndTime)}`;
    if (!schedule.todayEntry?.clock_out) return `Clock out at ${formatTime(schedule.endTime)}`;
    return "All clocking reminders are complete for today.";
  }, [data.reminderSchedule]);

  return (
    <section className="grid gap-4">
      {popup ? (
        <div className="fixed right-3 top-[88px] z-[60] w-[min(360px,calc(100vw-24px))] rounded-md border border-accent/30 bg-surface p-3 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
              <Bell className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{popup.title}</p>
              <p className="mt-1 text-sm text-muted">{popup.body}</p>
              <button
                className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                onClick={() => setPopup(null)}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="premium-card rounded-md">
          <div className="border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <CalendarDays className="size-4" />
              Holidays
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Upcoming public holidays</h2>
          </div>
          <div className="divide-y divide-border">
            {data.holidays.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">No upcoming public holidays loaded.</p>
            ) : (
              data.holidays.map((holiday) => (
                <div key={holiday.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold text-foreground">{holiday.name}</p>
                    <p className="mt-1 text-xs text-muted">{formatDate(holiday.holiday_date)}</p>
                  </div>
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                    {holiday.is_paid ? "Paid" : "Unpaid"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="premium-card rounded-md">
          <div className="border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <TimerReset className="size-4" />
              Daily reminders
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Today&apos;s schedule</h2>
          </div>
          <div className="grid gap-3 p-4">
            {data.reminderSchedule?.isWorkingDay ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <Clock3 className="size-3.5" />
                      Start
                    </p>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatTime(data.reminderSchedule.startTime)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <LogOut className="size-3.5" />
                      End
                    </p>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatTime(data.reminderSchedule.endTime)}
                    </p>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <Coffee className="size-3.5" />
                    Next reminder
                  </p>
                  <p className="mt-1 font-semibold text-foreground">{nextReminder}</p>
                </div>
                <button
                  type="button"
                  onClick={() => showDeviceNotification("Notifications enabled", "ClockWise reminders can appear on this device.", "notification-test")}
                  className="justify-self-start rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground"
                >
                  Enable device notifications
                </button>
              </>
            ) : (
              <p className="rounded-md border border-border bg-background px-3 py-3 text-sm text-muted">
                No working-day reminder is due for your assigned rule today.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="premium-card rounded-md">
          <div className="border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <Radio className="size-4" />
              Team movement
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Today&apos;s activity broadcast</h2>
          </div>
          <div className="divide-y divide-border">
            {data.teamMovements.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">No team movement has been recorded today.</p>
            ) : (
              data.teamMovements.map((movement) => (
                <div key={movement.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
                    <Send className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {movement.employeeName}{" "}
                      <span className="font-normal text-muted">
                        {movementLabel(movement.eventType)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatTime(movement.localEventTime)} - {movement.branchName ?? "No branch"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="premium-card rounded-md">
          <div className="border-b border-border px-4 py-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <Bell className="size-4" />
              Notifications
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Action center</h2>
          </div>
          <div className="divide-y divide-border">
            {data.notifications.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">You have no unread notifications.</p>
            ) : (
              data.notifications.map((notification) => (
                <form key={notification.id} action={action} className="grid gap-2 px-4 py-3">
                  <input type="hidden" name="notification_id" value={notification.id} />
                  <input type="hidden" name="target_href" value={notification.targetHref ?? ""} />
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border ${notificationTone(notification.category)}`}>
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{notification.title}</p>
                      <p className="mt-1 text-sm text-muted">{notification.body}</p>
                    </div>
                  </div>
                  <button
                    disabled={pending}
                    className="justify-self-start rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {notification.targetHref ? "Open and clear" : "Clear"}
                  </button>
                </form>
              ))
            )}
          </div>
          {state.message ? (
            <p className={`border-t border-border px-4 py-2 text-sm ${state.ok ? "text-success" : "text-danger"}`}>
              {state.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
