"use client";

/**
 * TicketNotificationList — presentational list of support-ticket notifications.
 * Shared by the reporter widget ("Updates" tab) and the Control Desk bell.
 */

import React from "react";
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";

import type { TicketNotification } from "@/utils/supportTicketTypes";
import { TICKET_STATUS_COLOR, TICKET_STATUS_LABELS } from "@/utils/supportTicketTypes";

export interface TicketNotificationListProps {
  items: TicketNotification[];
  onSelect: (notification: TicketNotification) => void;
  emptyText?: string;
}

export function formatNotificationTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TicketNotificationList({
  items,
  onSelect,
  emptyText = "No updates yet.",
}: TicketNotificationListProps) {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
        {emptyText}
      </Typography>
    );
  }
  return (
    <Stack divider={<Divider />} spacing={0}>
      {items.map((n) => {
        const unread = n.is_read === 0;
        return (
          <Box
            key={n.notification_id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(n)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(n);
            }}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
              py: 1.25,
              px: 0.5,
              cursor: "pointer",
              backgroundColor: unread ? "action.selected" : "transparent",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <Box
              aria-hidden
              sx={{
                mt: 0.9,
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: "50%",
                backgroundColor: unread ? "primary.main" : "transparent",
              }}
            />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: unread ? 700 : 500 }} noWrap>
                {n.title}
              </Typography>
              {n.message && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {n.message}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {formatNotificationTime(n.created_date_time)}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={TICKET_STATUS_LABELS[n.status_id] ?? `#${n.status_id}`}
              color={TICKET_STATUS_COLOR[n.status_id] ?? "default"}
              sx={{ flexShrink: 0 }}
            />
          </Box>
        );
      })}
    </Stack>
  );
}
