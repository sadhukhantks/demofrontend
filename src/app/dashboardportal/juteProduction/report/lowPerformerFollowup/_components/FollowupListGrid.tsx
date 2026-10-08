"use client";

import * as React from "react";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ChevronRight } from "lucide-react";
import type { CodeLabel, FollowupRow } from "@/utils/lowPerformerFollowupService";
import { labelOf } from "@/components/lowPerformerFollowup/constants";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import { hourCutsLabel, noticesLabel } from "../_utils";
import FollowupStatusChip from "./FollowupStatusChip";

export interface FollowupListGridProps {
  rows: FollowupRow[];
  loading: boolean;
  error: string | null;
  depts: ReadonlyArray<CodeLabel>;
  noticeTypes: ReadonlyArray<CodeLabel>;
  onOpen: (row: FollowupRow) => void;
  emptyText: string;
}

/** The follow-up list. A click anywhere on a row (or Open) opens the person. */
export default function FollowupListGrid({
  rows,
  loading,
  error,
  depts,
  noticeTypes,
  onOpen,
  emptyText,
}: FollowupListGridProps) {
  const columns = React.useMemo<GridColDef<FollowupRow>[]>(
    () => [
      {
        field: "open",
        headerName: "",
        width: 90,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: (p) => (
          <Button
            size="small"
            endIcon={<ChevronRight size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(p.row);
            }}
          >
            Open
          </Button>
        ),
      },
      { field: "eb_no", headerName: "EB No", width: 95 },
      { field: "worker_name", headerName: "Name", flex: 1, minWidth: 170 },
      {
        field: "dept_code",
        headerName: "Dept",
        width: 100,
        valueGetter: (_v, row) => labelOf(depts, row.dept_code),
      },
      {
        field: "start_date",
        headerName: "Since",
        width: 105,
        valueFormatter: (value: string | null) => fmtDate(value),
      },
      { field: "days_tracked", headerName: "Days tracked", type: "number", width: 105 },
      {
        field: "review_date",
        headerName: "Review date",
        width: 190,
        renderCell: (p) => (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ height: "100%" }}>
            <span>{fmtDate(p.row.review_date)}</span>
            {p.row.review_due ? <Chip size="small" color="warning" label="Review due" /> : null}
          </Stack>
        ),
      },
      {
        field: "status",
        headerName: "Status",
        width: 95,
        renderCell: (p) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <FollowupStatusChip status={p.row.status} />
          </Box>
        ),
      },
      {
        field: "notice_count",
        headerName: "Notices",
        width: 190,
        valueGetter: (_v, row) => noticesLabel(row, noticeTypes),
      },
      {
        field: "hours_cut_count",
        headerName: "Hour cuts",
        width: 110,
        valueGetter: (_v, row) => hourCutsLabel(row),
      },
      {
        field: "remark_count",
        headerName: "Remarks",
        type: "number",
        width: 90,
        valueFormatter: (value: number | null) => (value ? String(value) : ""),
      },
      {
        field: "last_event_date",
        headerName: "Last entry",
        width: 105,
        valueFormatter: (value: string | null) => fmtDate(value),
      },
      { field: "reason", headerName: "Reason", width: 220 },
    ],
    [depts, noticeTypes, onOpen],
  );

  return (
    <Box>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <DataGrid
          autoHeight
          rows={rows}
          columns={columns}
          getRowId={(r) => r.followup_id}
          loading={loading}
          density="compact"
          disableRowSelectionOnClick
          onRowClick={(p) => onOpen(p.row)}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
          localeText={{ noRowsLabel: emptyText }}
          sx={{
            minWidth: 640,
            "& .MuiDataGrid-row": { cursor: "pointer" },
          }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        Tap a row to open the person&apos;s record.
      </Typography>
    </Box>
  );
}
