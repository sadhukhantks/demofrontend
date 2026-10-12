"use client";

import * as React from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import {
  DataGrid,
  type GridColDef,
  type GridRowId,
  type GridRowSelectionModel,
} from "@mui/x-data-grid";
import { ChevronRight } from "lucide-react";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import type { LaExtraKey, LaListRow } from "@/utils/longAbsenteeismService";
import { cellTextIssue, textOrNull } from "../_schemas";
import { dueText, isDue, leaveChipColor, leaveChipText, letterCell, type ExtraColumn } from "../_utils";
import { StageChip } from "./Chips";

export type EditableCellField = "remarks" | LaExtraKey;

export interface WatchlistGridProps {
  rows: LaListRow[];
  loading: boolean;
  /** Extra Excel columns named in Settings. */
  extraCols: ReadonlyArray<ExtraColumn>;
  /** Remarks / extra cells are editable (create access). */
  canEditCells: boolean;
  today: string;
  onOpen: (row: LaListRow) => void;
  /** Saves one inline-edited cell; resolves with the updated row. */
  onCellSave: (row: LaListRow, field: EditableCellField, value: string | null) => Promise<LaListRow>;
  onCellError: (message: string) => void;
  /** Checkbox column for "Issue letters for selected". */
  selectable: boolean;
  /** Selected case ids across every grid of the page. */
  selected: ReadonlySet<number>;
  /** This grid's rows and which of them are now selected. */
  onSelectionChange: (gridIds: number[], selectedInGrid: number[]) => void;
  emptyText: string;
  /** Bands are short lists: no pagination footer. */
  hideFooter?: boolean;
}

/** One sheet letter column: date + sent date; amber while issued but not sent. */
function LetterCell({ date, sent }: { date: string | null; sent: string | null }) {
  if (!date) return null;
  return (
    <Typography
      variant="body2"
      component="span"
      sx={{ color: sent ? "text.primary" : "warning.main", whiteSpace: "nowrap" }}
      title={sent ? undefined : "Issued, sent date not recorded"}
    >
      {letterCell(date, sent)}
    </Typography>
  );
}

function letterColumn(
  field: string,
  headerName: string,
  dateKey: keyof LaListRow,
  sentKey: keyof LaListRow,
): GridColDef<LaListRow> {
  return {
    field,
    headerName,
    width: 200,
    sortable: false,
    valueGetter: (_v, row) => letterCell(row[dateKey] as string | null, row[sentKey] as string | null),
    renderCell: (p) => (
      <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
        <LetterCell date={p.row[dateKey] as string | null} sent={p.row[sentKey] as string | null} />
      </Box>
    ),
  };
}

function idsOf(model: GridRowSelectionModel, rows: ReadonlyArray<LaListRow>): number[] {
  const all = rows.map((r) => r.case_id);
  if (model.type === "exclude") return all.filter((id) => !model.ids.has(id));
  return all.filter((id) => model.ids.has(id));
}

/** Which editable field differs between the edited row and the stored one. */
function changedField(next: LaListRow, prev: LaListRow, fields: ReadonlyArray<EditableCellField>): EditableCellField | null {
  for (const f of fields) {
    const a = textOrNull(String(next[f] ?? ""));
    const b = prev[f] ?? null;
    if (a !== b) return f;
  }
  return null;
}

/** The watchlist as the Excel sheet: one row per case, letters as columns, editable remarks. */
export default function WatchlistGrid({
  rows,
  loading,
  extraCols,
  canEditCells,
  today,
  onOpen,
  onCellSave,
  onCellError,
  selectable,
  selected,
  onSelectionChange,
  emptyText,
  hideFooter = false,
}: WatchlistGridProps) {
  const editableFields = React.useMemo<EditableCellField[]>(
    () => ["remarks", ...extraCols.map((c) => c.key)],
    [extraCols],
  );

  const columns = React.useMemo<GridColDef<LaListRow>[]>(
    () => [
      {
        field: "open",
        headerName: "",
        width: 86,
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
      { field: "emp_code", headerName: "EB No", width: 90 },
      { field: "emp_name", headerName: "Name", flex: 1, minWidth: 170 },
      { field: "dept_desc", headerName: "Dept", width: 120 },
      { field: "designation", headerName: "Designation", width: 130 },
      {
        field: "stage_code",
        headerName: "Stage",
        width: 150,
        valueGetter: (_v, row) => row.stage_label,
        renderCell: (p) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <StageChip code={p.row.stage_code} label={p.row.stage_label} />
          </Box>
        ),
      },
      {
        field: "last_working_date",
        headerName: "Last working date",
        width: 130,
        valueFormatter: (value: string | null) => fmtDate(value),
      },
      { field: "absent_days", headerName: "Absent days", type: "number", width: 100 },
      {
        field: "leave",
        headerName: "Leave",
        width: 170,
        sortable: false,
        valueGetter: (_v, row) => leaveChipText(row, today) ?? "",
        renderCell: (p) => {
          const text = leaveChipText(p.row, today);
          return text ? (
            <Box sx={{ display: "flex", alignItems: "center", height: "100%", minWidth: 0 }}>
              <Chip size="small" color={leaveChipColor(p.row, today)} label={text} title={text} sx={{ maxWidth: "100%" }} />
            </Box>
          ) : null;
        },
      },
      {
        field: "next_due_date",
        headerName: "Next due",
        width: 170,
        valueGetter: (_v, row) => (row.status === 0 ? "" : dueText(row.next_due_date, today)),
        renderCell: (p) =>
          p.row.status === 0 || !p.row.next_due_date ? null : (
            <Typography
              variant="body2"
              component="span"
              sx={{ color: isDue(p.row.next_due_date, today) ? "warning.main" : "text.primary" }}
            >
              {dueText(p.row.next_due_date, today)}
            </Typography>
          ),
      },
      letterColumn("w1", "1st letter", "w1_date", "w1_sent"),
      letterColumn("w2", "2nd letter", "w2_date", "w2_sent"),
      letterColumn("w3", "3rd letter", "w3_date", "w3_sent"),
      letterColumn("sc", "Show cause", "sc_date", "sc_sent"),
      letterColumn("gn", "Notice", "gn_date", "gn_sent"),
      {
        field: "struck_off_date",
        headerName: "Struck off",
        width: 110,
        valueFormatter: (value: string | null) => fmtDate(value),
      },
      {
        field: "exit_reason_label",
        headerName: "Report",
        width: 150,
        valueGetter: (_v, row) => (row.status === 0 ? (row.exit_reason_label ?? "") : row.status_label),
      },
      {
        field: "remarks",
        headerName: "Remarks",
        width: 240,
        editable: true,
        description: canEditCells ? "Double-click (or Enter) to edit" : undefined,
      },
      ...extraCols.map<GridColDef<LaListRow>>((c) => ({
        field: c.key,
        headerName: c.label,
        width: 160,
        editable: true,
      })),
    ],
    [extraCols, onOpen, today, canEditCells],
  );

  const selection = React.useMemo<GridRowSelectionModel>(
    () => ({
      type: "include",
      ids: new Set<GridRowId>(rows.filter((r) => selected.has(r.case_id)).map((r) => r.case_id)),
    }),
    [rows, selected],
  );

  const processRowUpdate = React.useCallback(
    async (next: LaListRow, prev: LaListRow): Promise<LaListRow> => {
      const field = changedField(next, prev, editableFields);
      if (!field) return prev;
      const raw = String(next[field] ?? "");
      const issue = cellTextIssue(field, raw);
      if (issue) throw new Error(issue);
      return onCellSave(prev, field, textOrNull(raw));
    },
    [editableFields, onCellSave],
  );

  return (
    <Box sx={{ width: "100%", overflowX: "auto" }}>
      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        getRowId={(r) => r.case_id}
        loading={loading}
        density="compact"
        editMode="cell"
        isCellEditable={() => canEditCells}
        processRowUpdate={processRowUpdate}
        onProcessRowUpdateError={(err: unknown) =>
          onCellError(err instanceof Error ? err.message : "Could not save the cell")
        }
        checkboxSelection={selectable}
        disableRowSelectionOnClick
        rowSelectionModel={selection}
        onRowSelectionModelChange={(model) =>
          onSelectionChange(
            rows.map((r) => r.case_id),
            idsOf(model, rows),
          )
        }
        onRowDoubleClick={(p, e) => {
          // Double-click on a non-editable cell opens the case; editable cells edit.
          const target = e.target as HTMLElement | null;
          if (target?.closest?.(".MuiDataGrid-cell--editable")) return;
          onOpen(p.row);
        }}
        hideFooter={hideFooter}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
        localeText={{ noRowsLabel: emptyText }}
        sx={{ minWidth: 720 }}
      />
    </Box>
  );
}
