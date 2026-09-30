import "@testing-library/jest-dom";
import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import {
  requestTicketNotificationsRefresh,
  useTicketNotifications,
} from "./useTicketNotifications";
import type { TicketNotification } from "@/utils/supportTicketTypes";

function note(id: number, ticketId: number, isRead = 0): TicketNotification {
  return {
    notification_id: id,
    ticket_id: ticketId,
    ticket_no: `TKT-${String(ticketId).padStart(6, "0")}`,
    subject: "Grid broken",
    status_id: 2,
    event_type: "comment",
    title: `TKT-${ticketId}: new reply from support`,
    message: "Please retry",
    actor_name: "Dev",
    is_read: isRead,
    read_date_time: null,
    created_date_time: "2026-09-07 10:00:00",
  };
}

const ok = <T,>(data: T) => Promise.resolve({ data, error: null, status: 200 });

describe("useTicketNotifications", () => {
  it("loads items and unread count on mount without toasting the backlog", async () => {
    const fetch = vi.fn(() => ok({ data: [note(2, 42), note(1, 41, 1)], unread: 1 }));
    const markRead = vi.fn(() => ok({ updated: 0, unread: 0 }));
    const onNew = vi.fn();

    const { result } = renderHook(() =>
      useTicketNotifications({ fetch, markRead, intervalMs: 0, onNew }),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.unread).toBe(1);
    expect(result.current.unreadTicketIds.has(42)).toBe(true);
    expect(result.current.unreadTicketIds.has(41)).toBe(false);
    expect(onNew).not.toHaveBeenCalled();
  });

  it("surfaces only newer unread notifications through onNew on refresh", async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => ok({ data: [note(5, 42)], unread: 1 }))
      .mockImplementationOnce(() => ok({ data: [note(7, 43), note(6, 42, 1), note(5, 42)], unread: 2 }));
    const markRead = vi.fn(() => ok({ updated: 0, unread: 0 }));
    const onNew = vi.fn();

    const { result } = renderHook(() =>
      useTicketNotifications({ fetch, markRead, intervalMs: 0, onNew }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(onNew).toHaveBeenCalledTimes(1);
    const fresh = onNew.mock.calls[0][0] as TicketNotification[];
    expect(fresh.map((n) => n.notification_id)).toEqual([7]);
    expect(result.current.unread).toBe(2);
  });

  it("marks a ticket read optimistically and adopts the server unread count", async () => {
    const fetch = vi.fn(() => ok({ data: [note(2, 42), note(1, 43)], unread: 2 }));
    const markRead = vi.fn(() => ok({ updated: 1, unread: 1 }));

    const { result } = renderHook(() =>
      useTicketNotifications({ fetch, markRead, intervalMs: 0 }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    await act(async () => {
      await result.current.markTicketRead(42);
    });

    expect(markRead).toHaveBeenCalledWith({ ticket_id: 42 });
    expect(result.current.items.find((n) => n.ticket_id === 42)?.is_read).toBe(1);
    expect(result.current.items.find((n) => n.ticket_id === 43)?.is_read).toBe(0);
    expect(result.current.unread).toBe(1);
  });

  it("skips the server call when nothing is unread", async () => {
    const fetch = vi.fn(() => ok({ data: [note(1, 42, 1)], unread: 0 }));
    const markRead = vi.fn(() => ok({ updated: 0, unread: 0 }));

    const { result } = renderHook(() =>
      useTicketNotifications({ fetch, markRead, intervalMs: 0 }),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await result.current.markTicketRead(42);
      await result.current.markAllRead();
    });
    expect(markRead).not.toHaveBeenCalled();
  });

  it("re-polls when the refresh event is dispatched", async () => {
    const fetch = vi.fn(() => ok({ data: [], unread: 0 }));
    const markRead = vi.fn(() => ok({ updated: 0, unread: 0 }));

    renderHook(() => useTicketNotifications({ fetch, markRead, intervalMs: 60_000 }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      requestTicketNotificationsRefresh();
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("reports auth failures instead of swallowing them", async () => {
    const fetch = vi.fn(() => Promise.resolve({ data: null, error: "Unauthorized", status: 401 }));
    const markRead = vi.fn(() => ok({ updated: 0, unread: 0 }));
    const onAuthError = vi.fn();

    renderHook(() => useTicketNotifications({ fetch, markRead, intervalMs: 0, onAuthError }));
    await waitFor(() => expect(onAuthError).toHaveBeenCalledWith(401));
  });
});
