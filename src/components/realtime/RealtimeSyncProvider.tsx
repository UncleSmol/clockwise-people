"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ConnectionStatus = "CONNECTING" | "SUBSCRIBED" | "ERROR" | "CLOSED";

type RealtimeContextValue = {
  isConnected: boolean;
  connectionState: ConnectionStatus;
  lastSyncAt: Date | null;
};

const RealtimeContext = createContext<RealtimeContextValue>({
  isConnected: false,
  connectionState: "CONNECTING",
  lastSyncAt: null,
});

export type RealtimeChangeEvent<T = Record<string, unknown>> = {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE" | "*";
  new: T;
  old: T;
};

const REALTIME_EVENT_NAME = "clockwise:realtime-change";

export function RealtimeSyncProvider({
  companyId,
  children,
}: {
  companyId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [connectionState, setConnectionState] = useState<ConnectionStatus>("CONNECTING");
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const refreshTimeoutRef = useRef<number | null>(null);

  const scheduleRefresh = useCallback(() => {
    setLastSyncAt(new Date());

    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = window.setTimeout(() => {
      router.refresh();
    }, 250);
  }, [router]);

  useEffect(() => {
    if (!companyId) return;

    const supabase = createSupabaseBrowserClient();

    const handlePayload = (
      table: string,
      payload: {
        eventType: "INSERT" | "UPDATE" | "DELETE" | "*";
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      },
    ) => {
      // Dispatch browser custom event for reactive client components
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<RealtimeChangeEvent>(REALTIME_EVENT_NAME, {
            detail: {
              table,
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            },
          }),
        );
      }

      // Schedule server component router refresh
      scheduleRefresh();
    };

    const channel = supabase
      .channel(`company-realtime:${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries", filter: `company_id=eq.${companyId}` },
        (payload) => handlePayload("time_entries", payload),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_clock_events" },
        (payload) => handlePayload("time_clock_events", payload),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "timesheets", filter: `company_id=eq.${companyId}` },
        (payload) => handlePayload("timesheets", payload),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "timesheet_correction_requests",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => handlePayload("timesheet_correction_requests", payload),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "approval_requests",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => handlePayload("approval_requests", payload),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => handlePayload("app_notifications", payload),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_requests",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => handlePayload("leave_requests", payload),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "company_workstations",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => handlePayload("company_workstations", payload),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionState("SUBSCRIBED");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionState("ERROR");
        } else if (status === "CLOSED") {
          setConnectionState("CLOSED");
        }
      });

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [companyId, scheduleRefresh]);

  const value: RealtimeContextValue = {
    isConnected: connectionState === "SUBSCRIBED",
    connectionState,
    lastSyncAt,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

export function useRealtimeEvent<T = Record<string, unknown>>(
  tableName: string,
  callback: (event: RealtimeChangeEvent<T>) => void,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent<RealtimeChangeEvent<T>>;
      if (customEvent.detail && (customEvent.detail.table === tableName || tableName === "*")) {
        callbackRef.current(customEvent.detail);
      }
    };

    window.addEventListener(REALTIME_EVENT_NAME, handleCustomEvent);
    return () => {
      window.removeEventListener(REALTIME_EVENT_NAME, handleCustomEvent);
    };
  }, [tableName]);
}

export function LiveStatusIndicator({ className = "" }: { className?: string }) {
  const { isConnected, connectionState } = useRealtime();

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
        isConnected
          ? "border border-success/30 bg-success/10 text-success"
          : connectionState === "CONNECTING"
            ? "border border-warning/30 bg-warning/10 text-warning"
            : "border border-muted/30 bg-surface text-muted"
      } ${className}`}
      title={
        isConnected
          ? "Live WebSockets active: Realtime updates connected"
          : connectionState === "CONNECTING"
            ? "Connecting to live WebSockets..."
            : "Realtime disconnected"
      }
    >
      <span className="relative flex size-2">
        {isConnected ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
        ) : null}
        <span
          className={`relative inline-flex size-2 rounded-full ${
            isConnected
              ? "bg-success"
              : connectionState === "CONNECTING"
                ? "bg-warning animate-pulse"
                : "bg-muted"
          }`}
        />
      </span>
      <span className="hidden xs:inline font-semibold">
        {isConnected ? "Live" : connectionState === "CONNECTING" ? "Syncing" : "Offline"}
      </span>
    </div>
  );
}
