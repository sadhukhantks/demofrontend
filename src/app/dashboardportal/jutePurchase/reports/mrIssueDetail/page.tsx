"use client";
import React, { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportPanel from "@/components/reports/ReportPanel";
import { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { fyStart, todayIso } from "@/components/reports/reportDates";
import {
  fetchJuteMrIssueDetail,
  fetchJuteMrOptions,
} from "@/utils/juteReportService";
import type { JuteMrIssueDetailRow } from "../types/reportTypes";

// The MR identity columns stay in both modes: with one MR picked they repeat,
// but dropping them would strip the MR identity out of the Excel export too.
// mr_label, never mr_number — mr_number is NULL until the MR is approved
// (510/558 dev3 rows), and mr_label already IS mr_number once it exists.
// ponytail: no separate "Approved MR #" column — it would duplicate this one
// where non-null and be blank everywhere else; add it if approval state ever
// has to be visible in the export.
const columns: GridColDef<JuteMrIssueDetailRow>[] = [
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
  { field: "updated_by", headerName: "Updated By", width: 120 },
  { field: "update_date_time", headerName: "Updated On", width: 150 },
];

// MR lines with no issues come back with a NULL jute_issue_id, so the issue id
// alone is not unique across the flat grid.
const getRowId = (r: JuteMrIssueDetailRow) =>
  `${r.jute_mr_li_id}-${r.jute_issue_id ?? 0}`;

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

  return (
    <ReportPanel
      title={
        appliedMrLabel
          ? `Jute MR Issue Detail - ${appliedMrLabel} (all issues, dates ignored)`
          : "Jute MR Issue Detail (all MRs in period)"
      }
      branches={branches}
      initialBranchId={initialBranchId}
      dates="range"
      initialDateFrom={range.from}
      initialDateTo={dateParam || range.to}
      extraAsync={{ label: "MR (blank = all)", load: loadMrOptions }}
      fetcher={(f) => {
        setAppliedMrLabel(f.extra ? (mrLabels.current[f.extra] ?? f.extra) : "");
        return coId == null
          ? Promise.resolve([])
          : fetchJuteMrIssueDetail({
              coId,
              branchId: f.branchId,
              dateFrom: f.dateFrom,
              dateTo: f.dateTo,
              mrId: f.extra || undefined,
            });
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
