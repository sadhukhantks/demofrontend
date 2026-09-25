/**
 * Pure helpers for the Jute PO settlement (closing) UI.
 * No React, no I/O — everything here is unit-tested in jutePOSettlement.test.ts.
 *
 * Spec: docs/claude/modules/jute-purchase/po-settlement-spec.md §7.
 */

import type {
  ApprovalStatusId,
  JutePOCloseType,
  JutePOClosedInfo,
  JutePODetails,
  JutePOStatusHistoryRow,
  JutePOStatusLogEntry,
  MuiFormMode,
} from "../types/jutePOTypes";
import { JUTE_PO_STATUS_IDS, JUTE_PO_STATUS_LABELS } from "./jutePOConstants";

// -----------------------------------------------------------------------------
// Close type
// -----------------------------------------------------------------------------

export const JUTE_PO_CLOSE_TYPE_LABELS: Record<JutePOCloseType, string> = {
  AUTO: "Auto-settled",
  SHORT: "Short-closed",
  BULK: "Bulk-closed",
  MIGRATED: "Migrated",
};

const CLOSE_TYPES: ReadonlyArray<JutePOCloseType> = Object.freeze(["AUTO", "SHORT", "BULK", "MIGRATED"]);

/** Normalises an API value to a close type; anything unknown becomes null. */
export function parseCloseType(value: unknown): JutePOCloseType | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return (CLOSE_TYPES as ReadonlyArray<string>).includes(upper) ? (upper as JutePOCloseType) : null;
}

/** Human label for a close type; "Closed" when unknown (legacy rows without close_type). */
export function closeTypeLabel(type: JutePOCloseType | null | undefined): string {
  return type ? JUTE_PO_CLOSE_TYPE_LABELS[type] : "Closed";
}

/** Optional non-negative count from an API value (number or numeric string); null otherwise. */
export function parseOptionalCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

// -----------------------------------------------------------------------------
// Status helpers
// -----------------------------------------------------------------------------

/** Live = can still receive jute; the only statuses the engine or a user may close. */
export function isLiveJutePOStatus(statusId: number | null | undefined): boolean {
  return statusId === JUTE_PO_STATUS_IDS.OPEN || statusId === JUTE_PO_STATUS_IDS.APPROVED;
}

export function isClosedJutePOStatus(statusId: number | null | undefined): boolean {
  return statusId === JUTE_PO_STATUS_IDS.CLOSED;
}

/**
 * "Close PO" is offered for live POs to users with edit access on the PO menu.
 * Shown in view mode, and in edit mode only when the status already makes the
 * page read-only (APPROVED) — an OPEN PO being edited keeps its Approve/Reject bar.
 */
export function canShowClosePO(params: {
  mode: MuiFormMode;
  statusId: number | null | undefined;
  canEdit: boolean;
}): boolean {
  const { mode, statusId, canEdit } = params;
  if (!canEdit || mode === "create") return false;
  if (!isLiveJutePOStatus(statusId)) return false;
  return mode === "view" || statusId === JUTE_PO_STATUS_IDS.APPROVED;
}

/** "Reopen" for a CLOSED PO — any non-create mode, edit access required. */
export function canShowReopenClosed(params: {
  mode: MuiFormMode;
  statusId: number | null | undefined;
  canEdit: boolean;
}): boolean {
  const { mode, statusId, canEdit } = params;
  return canEdit && mode !== "create" && isClosedJutePOStatus(statusId);
}

/**
 * Status a CLOSED PO returns to on reopen: the `old_status_id` of the newest log
 * row that moved it into CLOSED (5). Falls back to APPROVED, as the backend does.
 */
export function priorStatusBeforeClose(log: ReadonlyArray<JutePOStatusLogEntry>): ApprovalStatusId {
  for (const row of log) {
    if (row.new_status_id === JUTE_PO_STATUS_IDS.CLOSED && row.old_status_id != null) {
      const candidate = row.old_status_id as ApprovalStatusId;
      if (candidate in JUTE_PO_STATUS_LABELS) return candidate;
    }
  }
  return JUTE_PO_STATUS_IDS.APPROVED;
}

export function statusLabelFor(statusId: number | null | undefined, fallbackName?: string | null): string {
  if (statusId != null && statusId in JUTE_PO_STATUS_LABELS) {
    return JUTE_PO_STATUS_LABELS[statusId as ApprovalStatusId];
  }
  if (fallbackName) return fallbackName;
  return statusId == null ? "—" : `Status ${statusId}`;
}

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------

/** "25 Sep 2026, 14:05" for ISO / MySQL datetime strings; input echoed when unparseable. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  // MySQL "YYYY-MM-DD HH:MM:SS" is not ISO for every engine — make it so.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed) ? trimmed.replace(" ", "T") : trimmed;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return trimmed;
  const hasTime = /\d{2}:\d{2}/.test(trimmed);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

const SOURCE_LABELS: Record<string, string> = {
  AUTO: "Auto",
  MANUAL: "Manual",
  BULK: "Bulk",
  BACKEND: "Backend",
  MIGRATION: "Migration",
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return SOURCE_LABELS[source.toUpperCase()] ?? source;
}

// -----------------------------------------------------------------------------
// View models
// -----------------------------------------------------------------------------

/** Newest log row that moved the PO into CLOSED (5), if any. */
export function latestCloseLogRow(log: ReadonlyArray<JutePOStatusLogEntry>): JutePOStatusLogEntry | null {
  const closes = log.filter((row) => row.new_status_id === JUTE_PO_STATUS_IDS.CLOSED);
  if (closes.length === 0) return null;
  return closes.reduce((best, row) => (row.log_id > best.log_id ? row : best));
}

/**
 * Closed-panel view model; null when the PO is not CLOSED.
 * Header columns (`closed_date`, `closed_by`, `close_type`, `close_remark`) win; any
 * that are missing are filled from the latest close row of the status log, so the panel
 * is complete even on a backend that does not return the columns yet.
 */
export function buildClosedInfo(
  details: JutePODetails | null,
  log: ReadonlyArray<JutePOStatusLogEntry> = [],
): JutePOClosedInfo | null {
  if (!details || !isClosedJutePOStatus(details.status_id)) return null;
  const fromLog = latestCloseLogRow(log);

  const closeType = details.close_type ?? fromLog?.close_type ?? null;
  const closedDate = details.closed_date ?? fromLog?.created_at ?? null;
  const closedBy =
    details.closed_by_name ??
    (details.closed_by != null ? `User #${details.closed_by}` : null) ??
    fromLog?.user_name ??
    (fromLog?.user_id != null ? `User #${fromLog.user_id}` : null);
  const remarkRaw = details.close_remark?.trim() || fromLog?.remark?.trim() || "";

  return {
    closedOn: closedDate ? formatDateTime(closedDate) : null,
    closedBy,
    closeType,
    closeTypeLabel: closeTypeLabel(closeType),
    remark: remarkRaw ? remarkRaw : null,
  };
}

/** Status-history rows, newest first (stable sort by created_at desc, then log_id desc). */
export function buildStatusHistoryRows(log: ReadonlyArray<JutePOStatusLogEntry>): JutePOStatusHistoryRow[] {
  const sorted = [...log].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at.replace(" ", "T")) : 0;
    const tb = b.created_at ? Date.parse(b.created_at.replace(" ", "T")) : 0;
    if (tb !== ta && !Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
    return b.log_id - a.log_id;
  });
  return sorted.map((row) => {
    const toLabel = statusLabelFor(row.new_status_id, row.new_status_name);
    const to =
      row.new_status_id === JUTE_PO_STATUS_IDS.CLOSED && row.close_type
        ? `${toLabel} (${closeTypeLabel(row.close_type)})`
        : toLabel;
    return {
      id: row.log_id,
      when: formatDateTime(row.created_at),
      from: statusLabelFor(row.old_status_id, row.old_status_name),
      to,
      source: sourceLabel(row.source),
      trigger: row.trigger_ref?.trim() || "—",
      remark: row.remark?.trim() || "—",
      user: row.user_name?.trim() || (row.user_id != null ? `User #${row.user_id}` : "—"),
    };
  });
}

/** "closed 3, reopened 1" — what the Settlement rules dialog shows after saving. */
export function formatRecomputeCounts(counts: { closed: number; reopened: number } | null | undefined): string {
  if (!counts) return "";
  return `closed ${counts.closed}, reopened ${counts.reopened}`;
}
