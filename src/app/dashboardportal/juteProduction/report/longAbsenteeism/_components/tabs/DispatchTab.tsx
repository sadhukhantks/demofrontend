"use client";

/**
 * Dispatch tab (edit access): the letters issued in a date range — per batch
 * or one by one — with their sent date, dispatch mode, A.D. no and delivery.
 * "Record dispatch" opens the same dialog as the case page (sent date drives
 * the wait for the next letter). "Print register" prints the postal register
 * grouped by batch; Export writes the rows to Excel.
 *
 * Backend: GET /dispatch, POST /letter_update (long_absenteeism_letters.py).
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { FileSpreadsheet, Printer, RefreshCw, Send } from "lucide-react";
import { fmtDate, localTodayISO } from "@/components/lowPerformerFollowup/schemas";
import { printReportSections } from "@/components/reports/printReport";
import { CardStat, MobileCard, TOUCH_TARGET } from "@/components/ui/responsiveEntry";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
  fetchLaDispatch,
  updateLaLetter,
  type LaDispatchRow,
  type LaLetter,
} from "@/utils/longAbsenteeismService";
import type { LetterUpdateFields } from "../../_schemas";
import { DISPATCH_REPORT_NAME, exportDispatchToExcel } from "../../_export";
import { useExportHeader } from "../../_hooks/useExportHeader";
import { useIsMobile } from "../../_hooks/useIsMobile";
import {
  BATCH_REF_MAX,
  fieldErrors,
  makeDispatchFilterSchema,
  type DispatchFilterValues,
} from "../../_tabsSchemas";
import { batchTitle, dispatchPrintSections, groupByBatch, sentText } from "../../_tabsUtils";
import { addDays, letterTitle, stageLabel } from "../../_utils";
import { StageChip } from "../Chips";
import LetterUpdateDialog from "../LetterUpdateDialog";
import type { LaTabProps } from "./types";

/** Default range: the last 30 days (the backend's DISPATCH_DEFAULT_DAYS). */
const DEFAULT_DAYS = 30;

const FILTER_SCHEMA = makeDispatchFilterSchema();

type FilterErrors = Partial<Record<keyof DispatchFilterValues, string>>;

function SentCell({ sent }: { sent: string | null }) {
  return (
    <Typography
      variant="body2"
      component="span"
      sx={{ color: sent ? "text.primary" : "warning.main", whiteSpace: "nowrap" }}
      title={sent ? undefined : "Sent date not recorded"}
    >
      {sentText(sent)}
    </Typography>
  );
}

/** Phone layout: one card per letter. */
function DispatchCards({
  rows,
  canEdit,
  onRecord,
  onOpenCase,
}: {
  rows: LaDispatchRow[];
  canEdit: boolean;
  onRecord: (row: LaDispatchRow) => void;
  onOpenCase?: (row: LaDispatchRow) => void;
}) {
  return (
    <Stack spacing={2}>
      {groupByBatch(rows).map((g) => (
        <Box key={g.batchRef ?? "-"}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, wordBreak: "break-all" }}>
            {batchTitle(g.batchRef)} · {g.rows.length}
          </Typography>
          <Stack spacing={1.25}>
            {g.rows.map((r) => (
              <MobileCard
                key={r.letter_id}
                header={
                  <>
                    <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
                        {r.emp_name || "(no name)"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        EB {r.emp_code ?? "—"}
                        {r.dept_desc ? ` · ${r.dept_desc}` : ""}
                      </Typography>
                    </Box>
                    <StageChip code={r.stage_code} label={r.stage_label} />
                  </>
                }
              >
                <CardStat label="Case" value={r.case_no ?? "—"} />
                <CardStat label="Issue date" value={fmtDate(r.issue_date)} align="right" />
                <CardStat label="Sent" value={<SentCell sent={r.sent_date} />} />
                <CardStat label="Dispatch" value={r.dispatch_mode_label ?? "—"} align="right" />
                <CardStat label="A.D. no" value={r.ad_no ?? "—"} />
                <CardStat
                  label="Delivery"
                  value={
                    r.delivery_status_label
                      ? `${r.delivery_status_label}${r.delivery_date ? ` ${fmtDate(r.delivery_date)}` : ""}`
                      : "—"
                  }
                  align="right"
                />
                <Stack direction="row" spacing={1} sx={{ gridColumn: "1 / -1", mt: 0.5 }}>
                  {canEdit ? (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Send size={14} />}
                      onClick={() => onRecord(r)}
                      sx={{ minHeight: TOUCH_TARGET, flex: 1 }}
                    >
                      Record dispatch
                    </Button>
                  ) : null}
                  {onOpenCase ? (
                    <Button size="small" onClick={() => onOpenCase(r)} sx={{ minHeight: TOUCH_TARGET, flex: 1 }}>
                      Open case
                    </Button>
                  ) : null}
                </Stack>
              </MobileCard>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export default function DispatchTab({ coId, branchId, branches, setup, canEdit, onNotify, onOpenCase }: LaTabProps) {
  const isMobile = useIsMobile();
  const [localToday] = React.useState(() => localTodayISO());
  const today = setup?.today ?? localToday;
  const exportHeader = useExportHeader(branchId, branches);

  const [filters, setFilters] = React.useState<DispatchFilterValues>(() => ({
    date_from: addDays(today, -DEFAULT_DAYS),
    date_to: today,
    stage_code: "",
    batch_ref: "",
  }));
  const [applied, setApplied] = React.useState<DispatchFilterValues>(filters);
  const [errors, setErrors] = React.useState<FilterErrors>({});
  const [rows, setRows] = React.useState<LaDispatchRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<LaDispatchRow | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const seq = React.useRef(0);

  const load = React.useCallback(
    async (f: DispatchFilterValues) => {
      if (branchId == null) return;
      const mine = ++seq.current;
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchLaDispatch({
          coId,
          branchId,
          dateFrom: f.date_from,
          dateTo: f.date_to,
          batchRef: f.batch_ref.trim() || null,
          stageCode: f.stage_code || null,
        });
        if (mine === seq.current) setRows(data);
      } catch (err: unknown) {
        if (mine === seq.current) {
          setRows([]);
          setLoadError(err instanceof Error ? err.message : "Could not load the dispatch register");
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [coId, branchId],
  );

  React.useEffect(() => {
    void load(applied);
  }, [load, applied]);

  /** Validates the filter bar and loads it (a new object, so Refresh always reloads). */
  const apply = (f: DispatchFilterValues) => {
    const result = FILTER_SCHEMA.safeParse(f);
    const errs = fieldErrors<keyof DispatchFilterValues>(result);
    setErrors(errs);
    if (result.success) setApplied({ ...f });
  };

  const setField = (key: keyof DispatchFilterValues, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const stageOptions = React.useMemo(
    () => (setup?.letter_stages ?? []).map((code) => ({ value: code, label: stageLabel(setup, code) })),
    [setup],
  );

  const notSent = rows.filter((r) => !r.sent_date).length;
  const period = `${fmtDate(applied.date_from)} To ${fmtDate(applied.date_to)}`;

  const openCase = React.useCallback(
    (r: LaDispatchRow) => onOpenCase?.(r.case_id, branchId),
    [onOpenCase, branchId],
  );

  const printRegister = () => {
    const lines = [
      exportHeader.companyName,
      exportHeader.branchName ? `${exportHeader.branchName} (Branch)` : "",
      `Letters issued ${period}`,
      applied.stage_code ? `Letter: ${stageLabel(setup, applied.stage_code)}` : "",
      applied.batch_ref.trim() ? `Batch: ${applied.batch_ref.trim()}` : "",
    ];
    const ok = printReportSections(
      {
        title: DISPATCH_REPORT_NAME,
        headerLines: lines,
        landscape: true,
        footnote: `${rows.length} letter${rows.length === 1 ? "" : "s"}. Printed ${fmtDate(today)}.`,
      },
      dispatchPrintSections(rows),
    );
    if (!ok) onNotify("Allow pop-ups for this site to print the register.", "warning");
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportDispatchToExcel(rows, await exportHeader.build(DISPATCH_REPORT_NAME, period));
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : "Could not write the Excel file", "error");
    } finally {
      setExporting(false);
    }
  };

  const saveDispatch = async (letter: LaLetter, changes: LetterUpdateFields) => {
    const res = await updateLaLetter({ co_id: coId, letter_id: letter.letter_id, ...changes });
    setEditing(null);
    if (res.letter) {
      const updated = res.letter;
      setRows((prev) => prev.map((r) => (r.letter_id === updated.letter_id ? { ...r, ...updated } : r)));
    } else {
      void load(applied);
    }
    onNotify(`Dispatch saved — ${letterTitle(letter)}.`, "success");
  };

  const columns = React.useMemo<GridColDef<LaDispatchRow>[]>(
    () => [
      ...(canEdit
        ? [
            {
              field: "record",
              headerName: "",
              width: 150,
              sortable: false,
              filterable: false,
              disableColumnMenu: true,
              renderCell: (p) => (
                <Button
                  size="small"
                  startIcon={<Send size={14} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(p.row);
                  }}
                >
                  Record dispatch
                </Button>
              ),
            } satisfies GridColDef<LaDispatchRow>,
          ]
        : []),
      { field: "batch_ref", headerName: "Batch", width: 170, valueGetter: (_v, row) => row.batch_ref ?? "" },
      {
        field: "case_no",
        headerName: "Case",
        width: 140,
        renderCell: (p) =>
          onOpenCase ? (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                openCase(p.row);
              }}
              sx={{ p: 0, minWidth: 0, textTransform: "none" }}
            >
              {p.row.case_no ?? p.row.case_id}
            </Button>
          ) : (
            (p.row.case_no ?? "")
          ),
      },
      { field: "emp_code", headerName: "EB No", width: 90 },
      { field: "emp_name", headerName: "Name", flex: 1, minWidth: 160 },
      { field: "dept_desc", headerName: "Dept", width: 120 },
      {
        field: "stage_code",
        headerName: "Letter",
        width: 160,
        valueGetter: (_v, row) => row.stage_label,
        renderCell: (p) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <StageChip code={p.row.stage_code} label={p.row.stage_label} />
          </Box>
        ),
      },
      { field: "issue_date", headerName: "Issue date", width: 105, valueFormatter: (v: string | null) => fmtDate(v) },
      {
        field: "sent_date",
        headerName: "Sent date",
        width: 105,
        valueGetter: (_v, row) => sentText(row.sent_date),
        renderCell: (p) => <SentCell sent={p.row.sent_date} />,
      },
      {
        field: "dispatch_mode_label",
        headerName: "Dispatch",
        width: 170,
        valueGetter: (_v, row) => row.dispatch_mode_label ?? row.dispatch_mode ?? "",
      },
      { field: "ad_no", headerName: "A.D. no", width: 130 },
      {
        field: "delivery_status_label",
        headerName: "Delivery",
        width: 110,
        valueGetter: (_v, row) => row.delivery_status_label ?? row.delivery_status ?? "",
      },
      {
        field: "delivery_date",
        headerName: "Delivery date",
        width: 115,
        valueFormatter: (v: string | null) => fmtDate(v),
      },
    ],
    [canEdit, onOpenCase, openCase],
  );

  if (branchId == null) {
    return <Alert severity="info">Select a branch to see its letters.</Alert>;
  }

  return (
    <Box>
      <Paper elevation={1} sx={{ mb: 2, p: { xs: 1.5, md: 2 } }}>
        <Box
          component="form"
          noValidate
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            apply(filters);
          }}
          sx={{
            display: "grid",
            gap: 1.5,
            alignItems: "start",
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              md: "160px 160px 220px 220px 1fr",
            },
          }}
        >
          <TextField
            type="date"
            size="small"
            label="Issued from"
            value={filters.date_from}
            onChange={(e) => setField("date_from", e.target.value)}
            error={Boolean(errors.date_from)}
            helperText={errors.date_from}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: filters.date_to || today } }}
            fullWidth
          />
          <TextField
            type="date"
            size="small"
            label="Issued to"
            value={filters.date_to}
            onChange={(e) => setField("date_to", e.target.value)}
            error={Boolean(errors.date_to)}
            helperText={errors.date_to}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: filters.date_from || undefined } }}
            fullWidth
          />
          <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
            <SearchableOptionSelect<string>
              label="Letter"
              placeholder="All letters"
              options={stageOptions}
              value={filters.stage_code}
              onChange={(v) => {
                const next = { ...filters, stage_code: v };
                setFilters(next);
                apply(next);
              }}
              fullWidth
            />
          </Box>
          <TextField
            size="small"
            label="Batch"
            placeholder="e.g. B20261011-1030-5"
            value={filters.batch_ref}
            onChange={(e) => setField("batch_ref", e.target.value)}
            error={Boolean(errors.batch_ref)}
            helperText={errors.batch_ref}
            slotProps={{ htmlInput: { maxLength: BATCH_REF_MAX } }}
            sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}
            fullWidth
          />
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            justifyContent={{ md: "flex-end" }}
            sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}
          >
            <Button
              type="submit"
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />}
              disabled={loading}
              sx={{ minHeight: 40 }}
            >
              Refresh
            </Button>
            <Button
              variant="outlined"
              startIcon={<Printer size={16} />}
              onClick={printRegister}
              disabled={rows.length === 0}
              sx={{ minHeight: 40 }}
            >
              Print register
            </Button>
            <Button
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <FileSpreadsheet size={16} />}
              onClick={() => void exportExcel()}
              disabled={rows.length === 0 || exporting}
              sx={{ minHeight: 40 }}
            >
              Export
            </Button>
          </Stack>
        </Box>
      </Paper>

      {loadError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      ) : null}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {loading && rows.length === 0
          ? "Loading…"
          : `${rows.length} letter${rows.length === 1 ? "" : "s"} issued ${period}${
              notSent ? ` · ${notSent} without a sent date` : ""
            }`}
      </Typography>

      {isMobile ? (
        rows.length === 0 ? (
          loading ? null : (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No letters issued in this range.
            </Typography>
          )
        ) : (
          <DispatchCards
            rows={rows}
            canEdit={canEdit}
            onRecord={setEditing}
            onOpenCase={onOpenCase ? openCase : undefined}
          />
        )
      ) : (
        <Box sx={{ width: "100%", overflowX: "auto" }}>
          <DataGrid
            autoHeight
            rows={rows}
            columns={columns}
            getRowId={(r) => r.letter_id}
            loading={loading}
            density="compact"
            disableRowSelectionOnClick
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 50, page: 0 } } }}
            localeText={{ noRowsLabel: "No letters issued in this range." }}
            sx={{ minWidth: 960 }}
          />
        </Box>
      )}

      <LetterUpdateDialog
        letter={editing}
        dispatchModes={setup?.dispatch_modes ?? []}
        deliveryStatuses={setup?.delivery_statuses ?? []}
        today={today}
        onClose={() => setEditing(null)}
        onSubmit={saveDispatch}
      />
    </Box>
  );
}
