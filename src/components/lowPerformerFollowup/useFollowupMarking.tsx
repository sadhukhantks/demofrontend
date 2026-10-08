"use client";

/**
 * Low Performer Follow-up hook-in for the Low Producer reports (weaving /
 * spinning / winding).
 *
 * Loads the OPEN follow-ups of one branch + department and hands the page a
 * "Follow-up" column for its worker-summary grid: a "Tracked" badge (linking to
 * the person's follow-up) for anyone already being followed up, otherwise a
 * "Mark" button that opens the shared AddFollowupDialog prefilled with that
 * worker's EB No and the report's department.
 *
 * Fail-soft by design: on a tenant without the follow-up table or menu yet the
 * tracked list just stays empty — the report itself must never break over it.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@mui/material";
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { useSidebarContextSafe } from "@/components/dashboard/sidebarContext";
import {
  fetchTrackedFollowups,
  type FollowupDeptCode,
  type FollowupRow,
  type TrackedFollowup,
} from "@/utils/lowPerformerFollowupService";
import AddFollowupDialog from "./AddFollowupDialog";
import TrackedBadge, { LOW_PERFORMER_FOLLOWUP_PATH } from "./TrackedBadge";

/** Field of the synthetic column. No row carries it, so Excel exports (which
 * read `row[field]`) should leave it out — see `withoutFollowupColumn`. */
export const FOLLOWUP_COLUMN_FIELD = "__followup";

/** Drop the Follow-up column, e.g. from the column set handed to an export. */
export function withoutFollowupColumn<R extends GridValidRowModel>(
  columns: GridColDef<R>[],
): GridColDef<R>[] {
  return columns.filter((c) => c.field !== FOLLOWUP_COLUMN_FIELD);
}

const EMPTY_TRACKED: ReadonlyMap<number, TrackedFollowup> = new Map();

export interface UseFollowupMarkingOptions {
  coId: number | null;
  /** Branch of the rows ON SCREEN (the loaded report's), not the filter draft —
   * marking must land in the branch the worker was reported in. */
  branchId: number | null;
  deptCode: FollowupDeptCode;
}

/** How the column reads a worker off the page's own row type. */
export interface FollowupColumnAccessors<R> {
  getEbId: (row: R) => number | null | undefined;
  /** Employee code (EB No) — what the Add dialog looks the person up by. */
  getEbNo: (row: R) => string | null | undefined;
}

export interface FollowupMarking {
  /** eb_id -> open follow-up, for the current branch + department. */
  tracked: ReadonlyMap<number, TrackedFollowup>;
  /** Create permission on the follow-up menu. */
  canMark: boolean;
  refresh: () => void;
  /** Builds the "Follow-up" DataGrid column for the page's row type. */
  followupColumn: <R extends GridValidRowModel>(
    accessors: FollowupColumnAccessors<R>,
  ) => GridColDef<R>;
  /** The Add dialog (or null) — render it once anywhere in the page. */
  dialog: React.ReactNode;
}

export function useFollowupMarking({
  coId,
  branchId,
  deptCode,
}: UseFollowupMarkingOptions): FollowupMarking {
  const sidebar = useSidebarContextSafe();
  const canMark = sidebar?.hasMenuAccess(LOW_PERFORMER_FOLLOWUP_PATH, "create") ?? false;
  const canView = sidebar?.hasMenuAccess(LOW_PERFORMER_FOLLOWUP_PATH, "view") ?? false;

  const scopeKey =
    coId != null && branchId != null ? `${coId}|${branchId}|${deptCode}` : null;
  const [loaded, setLoaded] = useState<{
    key: string;
    map: Map<number, TrackedFollowup>;
  } | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  /** EB No the Add dialog is open for; null = closed. */
  const [markEbNo, setMarkEbNo] = useState<string | null>(null);

  useEffect(() => {
    if (scopeKey == null || coId == null || branchId == null) return;
    let cancelled = false;
    fetchTrackedFollowups({ coId, branchId, deptCode })
      .then((rows) => {
        if (!cancelled) {
          setLoaded({ key: scopeKey, map: new Map(rows.map((r) => [r.eb_id, r])) });
        }
      })
      .catch(() => {
        // Deliberately quiet (see file header). A failed refresh keeps the
        // list already held for this scope; a new scope simply shows none.
      });
    return () => {
      cancelled = true;
    };
  }, [scopeKey, coId, branchId, deptCode, reloadTick]);

  // Never show another branch's badges while the new branch's list is loading.
  const tracked: ReadonlyMap<number, TrackedFollowup> =
    loaded != null && loaded.key === scopeKey ? loaded.map : EMPTY_TRACKED;

  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);

  const handleCreated = useCallback(
    (row: FollowupRow) => {
      setMarkEbNo(null);
      // Badge the person straight away; the refetch below confirms it.
      if (
        scopeKey != null &&
        row.status === 1 &&
        row.branch_id === branchId &&
        row.dept_code === deptCode
      ) {
        setLoaded((prev) => {
          const map = new Map<number, TrackedFollowup>(
            prev?.key === scopeKey ? prev.map : [],
          );
          map.set(row.eb_id, {
            followup_id: row.followup_id,
            eb_id: row.eb_id,
            dept_code: row.dept_code,
            start_date: row.start_date,
            review_date: row.review_date,
          });
          return { key: scopeKey, map };
        });
      }
      setReloadTick((t) => t + 1);
    },
    [scopeKey, branchId, deptCode],
  );

  const followupColumn = useCallback(
    <R extends GridValidRowModel>({
      getEbId,
      getEbNo,
    }: FollowupColumnAccessors<R>): GridColDef<R> => ({
      field: FOLLOWUP_COLUMN_FIELD,
      headerName: "Follow-up",
      width: 110,
      filterable: false,
      // Sorts tracked people together.
      valueGetter: (_value, row) => {
        const ebId = getEbId(row);
        return ebId != null && tracked.has(ebId) ? "Tracked" : "";
      },
      renderCell: ({ row }) => {
        const ebId = getEbId(row);
        if (ebId == null) return null;
        const hit = tracked.get(ebId);
        if (hit) {
          return <TrackedBadge followup={hit} branchId={branchId} linkable={canView} />;
        }
        const ebNo = getEbNo(row)?.trim();
        if (!canMark || !ebNo || coId == null || branchId == null) return null;
        return (
          <Button
            size="small"
            variant="text"
            onClick={() => setMarkEbNo(ebNo)}
            title={`Start a low-performer follow-up for ${ebNo}`}
            sx={{ textTransform: "none", minWidth: 0, px: 1 }}
          >
            Mark
          </Button>
        );
      },
    }),
    [tracked, canMark, canView, coId, branchId],
  );

  // Mounted only while open (keyed per person) so every open starts from a
  // fresh prefill, and the dialog does no work while the report is just read.
  const dialog =
    markEbNo != null && coId != null && branchId != null ? (
      <AddFollowupDialog
        key={`${branchId}|${markEbNo}`}
        open
        onClose={() => setMarkEbNo(null)}
        onCreated={handleCreated}
        coId={coId}
        branchId={branchId}
        initialEbNo={markEbNo}
        initialDeptCode={deptCode}
        lockDept
      />
    ) : null;

  return { tracked, canMark, refresh, followupColumn, dialog };
}

export default useFollowupMarking;
