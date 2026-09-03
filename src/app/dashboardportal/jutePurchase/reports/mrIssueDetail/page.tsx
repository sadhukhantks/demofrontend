"use client";
import React, { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef, GridActionsCellItem } from "@mui/x-data-grid";
import { RefreshCw } from "lucide-react";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { fyStart, todayIso } from "@/components/reports/reportDates";
import {
  fetchJuteMrIssueDetail,
  fetchJuteMrOptions,
  syncIssueWeights,
} from "@/utils/juteReportService";
import { toast } from "@/hooks/use-toast";
import type { JuteMrIssueDetailRow } from "../types/reportTypes";

// Row shape as rendered: _showSync is computed once per fetch (see
// withSyncFlags) so the "Sync" action column never has to scan every row on
// every render — one MR at most needs the button, on its first grid row.
type Row = JuteMrIssueDetailRow & { _showSync?: boolean };

const DIFF_TOLERANCE = 0.5; // kg — matches the "Diff" column's red threshold

/**
 * Flags exactly one row per MR (its first occurrence in the fetched order)
 * with _showSync = true, when ANY line of that MR has a non-trivial
 * total_issued_weight vs expected_issued_weight gap (decision "Sync",
 * 2026-09-03). Everything else is left as-is.
 */
function withSyncFlags(rows: JuteMrIssueDetailRow[]): Row[] {
  const mrHasDiff = new Map<number, boolean>();
  for (const r of rows) {
    if (r.jute_mr_id == null) continue;
    const diff = Math.abs(r.weight_diff ?? 0) > DIFF_TOLERANCE;
    mrHasDiff.set(r.jute_mr_id, (mrHasDiff.get(r.jute_mr_id) ?? false) || diff);
  }
  const seenMr = new Set<number>();
  return rows.map((r) => {
    if (r.jute_mr_id == null || seenMr.has(r.jute_mr_id)) {
      return { ...r, _showSync: false };
    }
    seenMr.add(r.jute_mr_id);
    return { ...r, _showSync: Boolean(mrHasDiff.get(r.jute_mr_id)) };
  });
}

// The MR identity columns stay in both modes: with one MR picked they repeat,
// but dropping them would strip the MR identity out of the Excel export too.
// mr_label, never mr_number — mr_number is NULL until the MR is approved
// (510/558 dev3 rows), and mr_label already IS mr_number once it exists.
// ponytail: no separate "Approved MR #" column — it would duplicate this one
// where non-null and be blank everywhere else; add it if approval state ever
// has to be visible in the export.
const baseColumns: GridColDef<Row>[] = [
  // Plain, not numCol — numCol would render an id as "27743.00".
  { field: "jute_mr_id", headerName: "MR ID", width: 90 },
  { field: "mr_label", headerName: "MR #", width: 180 },
  { field: "mr_date", headerName: "MR / Inward Date", width: 120 },
  { field: "jute_gate_entry_no", headerName: "GE #", width: 120 },
  { field: "party_name", headerName: "Party", flex: 1, minWidth: 160 },
  { field: "warehouse_name", headerName: "Godown", width: 120 },
  { field: "quality", headerName: "Quality", flex: 1, minWidth: 150 },
  { field: "marka", headerName: "Marka", width: 110 },
  { field: "crop_year", headerName: "Crop Year", width: 100 },
  numCol("received_qty", "Recv Qty"),
  numCol("received_weight", "Recv Wt"),
  numCol("actual_rate", "Rate"),
  { field: "jute_issue_id", headerName: "Issue #", width: 100 },
  { field: "issue_date", headerName: "Issue Date", width: 110 },
  numCol("issued_qty", "Issued Qty"),
  numCol("issued_weight", "Issued Wt"),
  numCol("issue_value", "Issue Value"),
  { field: "issue_item_name", headerName: "Issue Item", flex: 1, minWidth: 150 },
  { field: "yarn_type_name", headerName: "Yarn Type", width: 130 },
  { field: "issue_status", headerName: "Issue Status", width: 120 },
  numCol("balance_qty", "Bal Qty"),
  numCol("balance_weight", "Bal Wt"),
  // Reconciliation columns (2026-09-03, §E3) — accepted_weight is the line's
  // approved weight; total/expected/diff compare what was actually issued
  // against qty * unit_weight. Diff beyond DIFF_TOLERANCE is what the Sync
  // action (below) fixes.
  numCol("accepted_weight", "Approved Wt", 120),
  numCol("total_issued_weight", "Issued (line)", 130),
  numCol("expected_issued_weight", "Expected", 120),
  {
    ...numCol("weight_diff", "Diff", 100),
    cellClassName: (params) =>
      Math.abs(Number(params.value) || 0) > DIFF_TOLERANCE ? "text-red-600 font-semibold" : "",
  },
  { field: "updated_by", headerName: "Updated By", width: 120 },
  { field: "update_date_time", headerName: "Updated On", width: 150 },
];

// MR lines with no issues come back with a NULL jute_issue_id, so the issue id
// alone is not unique across the flat grid.
const getRowId = (r: Row) => `${r.jute_mr_li_id}-${r.jute_issue_id ?? 0}`;

function MrIssueDetailPageContent() {
  const { coId, branches, initialBranchId, dateParam } = useReportBranches();
  const range = useMemo(
    () => ({ from: fyStart(new Date()), to: todayIso() }),
    [],
  );

  // Label of the MR actually fetched (not whatever the picker now shows) —
  // drives the title so the header never claims a date range that the backend
  // ignored. Resolved at fetch time: mrLabels is replaced on every branch or
  // company change, so a later lookup would miss and print a raw id.
  const [appliedMrLabel, setAppliedMrLabel] = useState("");
  const mrLabels = useRef<Record<string, string>>({});

  // Last submitted filters, so a post-sync remount reloads the same view
  // instead of resetting to the defaults (ReportPanel has no external
  // refresh hook — remounting via `key` is the lazy way back in).
  const lastFilters = useRef({
    branchId: initialBranchId,
    dateFrom: range.from,
    dateTo: dateParam || range.to,
    extra: "",
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMrOptions = useCallback(
    async (branchId: number) => {
      if (coId == null) return [];
      const rows = await fetchJuteMrOptions(coId, branchId);
      const opts = rows.map((r) => ({
        value: String(r.jute_mr_id),
        // mr_label, never mr_number — mr_number is NULL until approval.
        label: [r.mr_label, r.mr_date, r.party_name]
          .filter(Boolean)
          .join("  |  "),
      }));
      mrLabels.current = Object.fromEntries(
        opts.map((o) => [o.value, o.label]),
      );
      return opts;
    },
    [coId],
  );

  const handleSync = useCallback(
    async (mrId: number) => {
      if (coId == null) return;
      const branchId = lastFilters.current.branchId ?? initialBranchId;
      if (branchId == null) return;
      if (
        !window.confirm(
          "Recompute issued weights for this MR from the current line weights?",
        )
      ) {
        return;
      }
      try {
        const result = await syncIssueWeights(coId, mrId, branchId);
        toast({
          title: "Issued weights synced",
          description: `${result.totals.issues_changed} issue(s) updated.`,
        });
        setRefreshKey((k) => k + 1);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Sync failed",
          description: err instanceof Error ? err.message : "Please try again.",
        });
      }
    },
    [coId, initialBranchId],
  );

  const columns: GridColDef<Row>[] = useMemo(
    () => [
      ...baseColumns,
      {
        field: "sync",
        headerName: "",
        type: "actions",
        width: 60,
        getActions: (params) =>
          params.row._showSync && params.row.jute_mr_id != null
            ? [
                <GridActionsCellItem
                  key="sync"
                  icon={<RefreshCw size={16} />}
                  label="Sync issued weights"
                  title="Sync issued weights for this MR"
                  onClick={() => handleSync(params.row.jute_mr_id as number)}
                />,
              ]
            : [],
      },
    ],
    [handleSync],
  );

  return (
    <ReportPanel
      key={refreshKey}
      title={
        appliedMrLabel
          ? `Jute MR Issue Detail - ${appliedMrLabel} (all issues, dates ignored)`
          : "Jute MR Issue Detail (all MRs in period)"
      }
      branches={branches}
      initialBranchId={lastFilters.current.branchId ?? initialBranchId}
      dates="range"
      initialDateFrom={lastFilters.current.dateFrom}
      initialDateTo={lastFilters.current.dateTo}
      initialExtra={lastFilters.current.extra}
      extraAsync={{ label: "MR (blank = all)", load: loadMrOptions }}
      fetcher={(f) => {
        setAppliedMrLabel(f.extra ? (mrLabels.current[f.extra] ?? f.extra) : "");
        lastFilters.current = {
          branchId: f.branchId,
          dateFrom: f.dateFrom,
          dateTo: f.dateTo,
          extra: f.extra,
        };
        return coId == null
          ? Promise.resolve([])
          : fetchJuteMrIssueDetail({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              mrId: f.extra || undefined,
            }).then(withSyncFlags);
      }}
      columns={columns}
      getRowId={getRowId}
      sortField="mr_date"
      sortDir="desc"
      exportName="jute-mr-issue-detail"
    />
  );
}

export default function MrIssueDetailPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <MrIssueDetailPageContent />
    </Suspense>
  );
}
