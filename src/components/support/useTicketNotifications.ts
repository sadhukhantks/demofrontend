"use client";

/**
 * useTicketNotifications — polls a support-ticket notification feed and exposes
 * the items, the unread count and mark-read helpers.
 *
 * The feed is fetched immediately, then every `intervalMs` while the tab is
 * visible, and again whenever the window regains focus. When a poll brings
 * back notifications newer than the ones already seen, they are surfaced once
 * through `onNew` so the host can toast them.
 *
 * Both the reporter widget (Portal / Tenant Admin) and the Control Desk bell
 * use this hook; only the fetch / mark-read functions differ.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  MarkNotificationsReadPayload,
  TicketNotification,
  TicketNotificationsResponse,
} from "@/utils/supportTicketTypes";

type Result<T> = { data: T | null; error: string | null; status: number };

export interface UseTicketNotificationsOptions {
  /** Fetches the latest notifications + unread count. */
  fetch: () => Promise<Result<TicketNotificationsResponse>>;
  /** Marks notifications read on the server; resolves the new unread count. */
  markRead: (payload: MarkNotificationsReadPayload) => Promise<Result<{ updated: number; unread: number }>>;
  /** Poll interval in ms. Defaults to 30s. Set 0 to disable polling. */
  intervalMs?: number;
  /** Called once with any notifications newer than the ones previously seen. */
  onNew?: (fresh: TicketNotification[]) => void;
  /** Called when a fetch returns 401/403 so the host can log out. */
  onAuthError?: (status: number) => void;
}

export interface UseTicketNotificationsResult {
  items: TicketNotification[];
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Mark everything for one ticket read (used when a ticket is opened). */
  markTicketRead: (ticketId: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Ticket ids that currently have at least one unread notification. */
  unreadTicketIds: Set<number>;
}

const DEFAULT_INTERVAL_MS = 30_000;

/** Window event any component can dispatch to force an immediate re-poll. */
export const TICKET_NOTIFICATIONS_REFRESH_EVENT = "vow:ticket-notifications-refresh";

export function requestTicketNotificationsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TICKET_NOTIFICATIONS_REFRESH_EVENT));
}

export function useTicketNotifications({
  fetch,
  markRead,
  intervalMs = DEFAULT_INTERVAL_MS,
  onNew,
  onAuthError,
}: UseTicketNotificationsOptions): UseTicketNotificationsResult {
  const [items, setItems] = useState<TicketNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  // Highest notification id seen so far; null until the first successful load
  // so the initial backlog is never toasted.
  const lastSeenIdRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const onNewRef = useRef(onNew);
  const onAuthErrorRef = useRef(onAuthError);
  onNewRef.current = onNew;
  onAuthErrorRef.current = onAuthError;

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const { data, status } = await fetch();
      if ((status === 401 || status === 403) && onAuthErrorRef.current) {
        onAuthErrorRef.current(status);
        return;
      }
      if (!data) return;
      const list = data.data ?? [];
      setItems(list);
      setUnread(data.unread ?? 0);

      const maxId = list.reduce((m, n) => Math.max(m, n.notification_id), 0);
      if (lastSeenIdRef.current !== null) {
        const fresh = list.filter(
          (n) => n.notification_id > (lastSeenIdRef.current as number) && n.is_read === 0,
        );
        if (fresh.length > 0 && onNewRef.current) onNewRef.current(fresh);
      }
      lastSeenIdRef.current = Math.max(lastSeenIdRef.current ?? 0, maxId);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [fetch]);

  useEffect(() => {
    void refresh();
    if (!intervalMs) return;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(TICKET_NOTIFICATIONS_REFRESH_EVENT, onFocus);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(TICKET_NOTIFICATIONS_REFRESH_EVENT, onFocus);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, intervalMs]);

  const applyRead = useCallback(
    async (payload: MarkNotificationsReadPayload, predicate: (n: TicketNotification) => boolean) => {
      // Optimistic local update, then reconcile with the server's unread count.
      setItems((prev) => prev.map((n) => (predicate(n) ? { ...n, is_read: 1 } : n)));
      const { data } = await markRead(payload);
      if (data) setUnread(data.unread);
      else await refresh();
    },
    [markRead, refresh],
  );

  const markTicketRead = useCallback(
    async (ticketId: number) => {
      const hasUnread = items.some((n) => n.ticket_id === ticketId && n.is_read === 0);
      if (!hasUnread && unread === 0) return;
      await applyRead({ ticket_id: ticketId }, (n) => n.ticket_id === ticketId);
    },
    [applyRead, items, unread],
  );

  const markAllRead = useCallback(async () => {
    if (unread === 0) return;
    await applyRead({ all: true }, () => true);
  }, [applyRead, unread]);

  const unreadTicketIds = new Set(items.filter((n) => n.is_read === 0).map((n) => n.ticket_id));

  return { items, unread, loading, refresh, markTicketRead, markAllRead, unreadTicketIds };
}
