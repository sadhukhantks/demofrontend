"use client";

/**
 * SupportNotificationBell — Control Desk bell showing ticket notifications for
 * the logged-in VOW member (they only receive updates on tickets assigned to
 * them). Polls every 30s, toasts new arrivals, and opens the ticket in the
 * Support Tickets screen when an item is clicked.
 *
 * @example
 *   <SupportNotificationBell />   // mounted once in the ctrldesk layout
 */

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Box, Button, IconButton, Popover, Snackbar, Stack, Tooltip, Typography } from "@mui/material";
import { Bell } from "lucide-react";

import { TicketNotificationList } from "@/components/support/TicketNotificationList";
import { useTicketNotifications } from "@/components/support/useTicketNotifications";
import { handleAuthError } from "@/utils/auth";
import { getManageNotifications, markManageNotificationsRead } from "@/utils/supportTicketService";
import type { TicketNotification } from "@/utils/supportTicketTypes";

export const SUPPORT_TICKETS_PATH = "/dashboardctrldesk/supportTickets";

interface SupportNotificationBellProps {
  /** Override the polling interval (ms); mainly for tests/stories. */
  intervalMs?: number;
}

export default function SupportNotificationBell({ intervalMs }: SupportNotificationBellProps) {
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const onNew = useCallback((fresh: TicketNotification[]) => {
    setToast(
      fresh.length === 1 ? fresh[0].title : `${fresh.length} new ticket updates`,
    );
  }, []);

  const { items, unread, markTicketRead, markAllRead } = useTicketNotifications({
    fetch: getManageNotifications,
    markRead: markManageNotificationsRead,
    intervalMs,
    onNew,
    onAuthError: (status) => {
      handleAuthError(status);
    },
  });

  const openTicket = useCallback(
    (n: TicketNotification) => {
      setAnchor(null);
      void markTicketRead(n.ticket_id);
      router.push(`${SUPPORT_TICKETS_PATH}?ticket=${n.ticket_id}`);
    },
    [markTicketRead, router],
  );

  return (
    <>
      <Tooltip title="Ticket notifications">
        <IconButton
          aria-label={unread > 0 ? `${unread} unread ticket notifications` : "Ticket notifications"}
          onClick={(e) => setAnchor(e.currentTarget)}
          size="small"
          sx={{ color: "inherit" }}
        >
          <Badge badgeContent={unread} color="error" max={99}>
            <Bell size={20} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: "calc(100vw - 32px)" } } }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Ticket updates
          </Typography>
          <Button size="small" onClick={() => void markAllRead()} disabled={unread === 0}>
            Mark all read
          </Button>
        </Stack>
        <Box sx={{ px: 1.5, pb: 1, maxHeight: 420, overflowY: "auto" }}>
          <TicketNotificationList
            items={items}
            onSelect={openTicket}
            emptyText="No updates on tickets assigned to you."
          />
        </Box>
      </Popover>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {toast ? (
          <Alert
            severity="info"
            variant="filled"
            onClose={() => setToast(null)}
            action={
              <Button color="inherit" size="small" onClick={() => { setToast(null); router.push(SUPPORT_TICKETS_PATH); }}>
                View
              </Button>
            }
          >
            {toast}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
