"use client";

import * as React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { FolderPlus, XCircle } from "lucide-react";
import { CardStat, MobileCard, TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaCandidate } from "@/utils/longAbsenteeismService";
import { candidateLeaveNotes } from "../_utils";
import { RepeatChip } from "./Chips";

export interface CandidatesListProps {
  rows: LaCandidate[];
  loading: boolean;
  /** Card list (phone) instead of the grid. */
  asCards: boolean;
  /** Open case / Dismiss (create access). */
  canAct: boolean;
  onOpenCase: (c: LaCandidate) => void;
  onDismiss: (c: LaCandidate) => void;
  emptyText: string;
  hideFooter?: boolean;
}

/** Workers absent past the limit with no case yet: open a case or dismiss. */
export default function CandidatesList({
  rows,
  loading,
  asCards,
  canAct,
  onOpenCase,
  onDismiss,
  emptyText,
  hideFooter = false,
}: CandidatesListProps) {
  const columns = React.useMemo<GridColDef<LaCandidate>[]>(
    () => [
      ...(canAct
        ? [
            {
              field: "actions",
              headerName: "",
              width: 200,
              sortable: false,
              filterable: false,
              disableColumnMenu: true,
              renderCell: (p) => (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ height: "100%" }}>
                  <Button size="small" startIcon={<FolderPlus size={14} />} onClick={() => onOpenCase(p.row)}>
                    Open case
                  </Button>
                  <Button size="small" color="inherit" startIcon={<XCircle size={14} />} onClick={() => onDismiss(p.row)}>
                    Dismiss
                  </Button>
                </Stack>
              ),
            } satisfies GridColDef<LaCandidate>,
          ]
        : []),
      { field: "emp_code", headerName: "EB No", width: 90 },
      { field: "emp_name", headerName: "Name", flex: 1, minWidth: 170 },
      { field: "dept_desc", headerName: "Dept", width: 120 },
      { field: "sub_dept_desc", headerName: "Sub-dept", width: 130 },
      { field: "designation", headerName: "Designation", width: 130 },
      { field: "category", headerName: "Category", width: 110 },
      {
        field: "last_seen",
        headerName: "Last seen",
        width: 110,
        valueFormatter: (value: string | null) => fmtDate(value),
      },
      { field: "absent_days", headerName: "Absent days", type: "number", width: 100 },
      {
        field: "leave",
        headerName: "Leave",
        width: 230,
        sortable: false,
        valueGetter: (_v, row) => candidateLeaveNotes(row).join(" · "),
        renderCell: (p) => {
          const notes = candidateLeaveNotes(p.row);
          return notes.length ? (
            <Box sx={{ display: "flex", alignItems: "center", height: "100%", minWidth: 0 }}>
              <Typography variant="body2" component="span" noWrap title={notes.join(" · ")}>
                {notes.join(" · ")}
              </Typography>
            </Box>
          ) : null;
        },
      },
      {
        field: "closed_cases",
        headerName: "Earlier cases",
        width: 140,
        renderCell: (p) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <RepeatChip count={p.row.closed_cases} />
          </Box>
        ),
      },
    ],
    [canAct, onOpenCase, onDismiss],
  );

  if (asCards) {
    if (rows.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          {loading ? "Loading…" : emptyText}
        </Typography>
      );
    }
    return (
      <Stack spacing={1.25}>
        {rows.map((c) => (
          <MobileCard
            key={c.eb_id}
            header={
              <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
                  {c.emp_name || "(no name)"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  EB {c.emp_code ?? c.eb_id}
                  {c.dept_desc ? ` · ${c.dept_desc}` : ""}
                </Typography>
              </Box>
            }
          >
            <CardStat label="Absent days" value={String(c.absent_days)} />
            <CardStat label="Last seen" value={fmtDate(c.last_seen)} align="right" />
            <CardStat label="Designation" value={c.designation || "—"} />
            <CardStat label="Earlier cases" value={c.closed_cases ? <RepeatChip count={c.closed_cases} /> : "—"} align="right" />
            {candidateLeaveNotes(c).map((note) => (
              <Typography
                key={note}
                variant="body2"
                color="text.secondary"
                sx={{ gridColumn: "1 / -1", wordBreak: "break-word" }}
              >
                {note}
              </Typography>
            ))}
            {canAct ? (
              <Stack direction="row" spacing={1} sx={{ gridColumn: "1 / -1" }}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<FolderPlus size={16} />}
                  onClick={() => onOpenCase(c)}
                  sx={{ flex: 1, minHeight: TOUCH_TARGET }}
                >
                  Open case
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="small"
                  startIcon={<XCircle size={16} />}
                  onClick={() => onDismiss(c)}
                  sx={{ flex: 1, minHeight: TOUCH_TARGET }}
                >
                  Dismiss
                </Button>
              </Stack>
            ) : null}
          </MobileCard>
        ))}
      </Stack>
    );
  }

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        getRowId={(r) => r.eb_id}
        loading={loading}
        density="compact"
        disableRowSelectionOnClick
        hideFooter={hideFooter}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
        localeText={{ noRowsLabel: emptyText }}
        sx={{ minWidth: 720 }}
      />
    </Box>
  );
}
