"use client";

/**
 * Isolated Supabase Realtime Hook
 * 
 * Bypasses the batch synchronization schedule exclusively for:
 * 1. "Working Now" Live Presence (WhatsApp-style online/offline tracking via channel.track())
 * 2. Instant Live Notifications (Filtered by user_id=eq.<id>)
 * 
 * Handles automatic reconnection and IndexedDB synchronization for live alerts.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { db } from "@/lib/db";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface LivePresenceUser {
  employeeId: string;
  fullName: string;
  avatarUrl?: string | null;
  status: "working" | "on_lunch" | "offline";
  clockInTime?: string | null;
  workstationId?: string | null;
  workstationName?: string | null;
  lastSeenAt: string;
}

export interface LiveNotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  linkUrl?: string | null;
}

interface UseRealtimeLiveOptions {
  companyId?: string | null;
  currentUserId?: string | null;
  currentEmployee?: {
    id: string;
    fullName: string;
    avatarUrl?: string | null;
    status: "working" | "on_lunch" | "offline";
    clockInTime?: string | null;
    workstationId?: string | null;
    workstationName?: string | null;
  } | null;
  onNewNotification?: (notification: LiveNotificationItem) => void;
}

export function useRealtimeLive({
  companyId,
  currentUserId,
  currentEmployee,
  onNewNotification,
}: UseRealtimeLiveOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [liveWorkers, setLiveWorkers] = useState<LivePresenceUser[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<LiveNotificationItem[]>([]);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const notificationChannelRef = useRef<RealtimeChannel | null>(null);

  // Sync incoming notification to Dexie IndexedDB
  const handleIncomingNotification = useCallback(async (rawPayload: Record<string, unknown>) => {
    const item: LiveNotificationItem = {
      id: String(rawPayload.id || `notif_${Date.now()}`),
      userId: String(rawPayload.user_id),
      title: String(rawPayload.title || "ClockWise Alert"),
      message: String(rawPayload.message || ""),
      type: String(rawPayload.type || "system"),
      isRead: Boolean(rawPayload.is_read),
      createdAt: String(rawPayload.created_at || new Date().toISOString()),
      linkUrl: rawPayload.link_url ? String(rawPayload.link_url) : null,
    };

    // 1. Immediately store into local IndexedDB
    try {
      await db.notifications.put({
        id: item.id,
        user_id: item.userId,
        title: item.title,
        message: item.message,
        type: item.type,
        is_read: item.isRead,
        link_url: item.linkUrl,
        created_at: item.createdAt,
      });
    } catch (err) {
      console.warn("[RealtimeLive] Could not write notification to IndexedDB:", err);
    }

    // 2. Update reactive state
    setUnreadNotifications((prev) => [item, ...prev]);
    onNewNotification?.(item);
  }, [onNewNotification]);

  // Initial load of unread notifications from local Dexie IndexedDB
  useEffect(() => {
    if (!currentUserId) return;
    let isMounted = true;

    db.notifications
      .where("user_id")
      .equals(currentUserId)
      .and((n) => !n.is_read)
      .reverse()
      .sortBy("created_at")
      .then((records) => {
        if (!isMounted) return;
        setUnreadNotifications(
          records.map((r) => ({
            id: r.id,
            userId: r.user_id,
            title: r.title,
            message: r.message,
            type: r.type,
            isRead: r.is_read,
            createdAt: r.created_at,
            linkUrl: r.link_url,
          }))
        );
      })
      .catch((err) => {
        console.warn("[RealtimeLive] Failed to load offline notifications:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  // Supabase Realtime Channels setup
  useEffect(() => {
    if (!companyId) return;

    const supabase = createSupabaseBrowserClient();

    // ---------------------------------------------------------
    // 1. Presence Channel: "Working Now" live indicator
    // ---------------------------------------------------------
    const presenceChannel = supabase.channel(`presence:working-now:${companyId}`, {
      config: {
        presence: {
          key: currentEmployee?.id || "guest",
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState<LivePresenceUser>();
        const activeUsers: LivePresenceUser[] = [];

        Object.values(state).forEach((presences) => {
          presences.forEach((p) => {
            if (p.employeeId) {
              activeUsers.push(p);
            }
          });
        });

        setLiveWorkers(activeUsers);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        console.debug("[RealtimeLive] Colleague joined live presence:", newPresences);
      })
      .on("presence", { event: "leave" }, ({ leftPresences }) => {
        console.debug("[RealtimeLive] Colleague left live presence:", leftPresences);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          if (currentEmployee) {
            await presenceChannel.track({
              employeeId: currentEmployee.id,
              fullName: currentEmployee.fullName,
              avatarUrl: currentEmployee.avatarUrl,
              status: currentEmployee.status,
              clockInTime: currentEmployee.clockInTime,
              workstationId: currentEmployee.workstationId,
              workstationName: currentEmployee.workstationName,
              lastSeenAt: new Date().toISOString(),
            });
          }
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsConnected(false);
        }
      });

    presenceChannelRef.current = presenceChannel;

    // ---------------------------------------------------------
    // 2. Notifications Channel: Filtered directly by user_id
    // ---------------------------------------------------------
    let notificationChannel: RealtimeChannel | null = null;
    if (currentUserId) {
      notificationChannel = supabase
        .channel(`user-notifications:${currentUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${currentUserId}`,
          },
          (payload) => {
            if (payload.new) {
              void handleIncomingNotification(payload.new as Record<string, unknown>);
            }
          }
        )
        .subscribe();

      notificationChannelRef.current = notificationChannel;
    }

    return () => {
      if (presenceChannelRef.current) {
        void supabase.removeChannel(presenceChannelRef.current);
      }
      if (notificationChannelRef.current) {
        void supabase.removeChannel(notificationChannelRef.current);
      }
      setIsConnected(false);
    };
  }, [companyId, currentUserId, currentEmployee, handleIncomingNotification]);

  return {
    isConnected,
    liveWorkers,
    unreadNotifications,
  };
}

