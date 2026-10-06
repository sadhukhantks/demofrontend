"use client";

/**
 * Machines Worked — the second tab of the Hands Report (spec §11.4 of
 * vowerp3be docs/superpowers/specs/2026-09-30-hands-norms-v2-machine-groups.md).
 *
 * One row per date x shift x machine with its status. A machine-shift "worked"
 * only when a worker is marked on it in attendance and it was not stopped for
 * the whole shift; the other two statuses are listed so the mill can see what
 * was left out of the machine targets and fix the marking.
 *
 * The page owns the fetch (same endpoint as the Manning tab, `view=machines_run`)
 * and hands the response in. Everything here is a reading of those rows: the
 * five filters only narrow what was loaded (pure helpers in ../_service), and
 * the Excel export writes exactly the rows the grid is showing.
 *
 * Manual additions and exclusions (spec §12.4): attendance may miss a machine
 * or mark a wrong one, so a role with edit access can count a machine by hand
 * ("Add machines", or Count on a "no worker marked" row), exclude a worked one,
 * and undo either — each with a reason. The actions show only when the backend
 * says the caller may edit (`meta.can_edit`) AND the sidebar menu grants edit;
 * the page does the saving (`overrides` prop) and reloads the tab afterwards.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import { Ban, Check, Plus, Undo2 } from "lucide-react";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { tokens } from "@/styles/tokens";
import AddMachinesDialog from "./AddMachinesDialog";
import FilterSlot from "./FilterSlot";
import OverrideReasonDialog, { type RowOverrideTarget } from "./OverrideReasonDialog";
import {
  canEditMachinesWorked,
  designationCaptions,
  effectiveMachineFilters,
  filterMachineRows,
  isMachineRunRow,
  MACHINE_ROW_ACTION_LABELS,
  machineFilterOptions,
  machineRowAction,
  machineScopesOf,
  machineStatusChipVariant,
  machineStatusCounts,
  machineStatusTone,
  manualTooltipLines,
  splitSources,
  syncedTimeLabel,
  toMachineWorkedRow,
  type BranchMachine,
  type HandsReport,
  type MachineFilters,
  type MachineOverrideForm,
  type MachineRowAction,
  type MachineStatus,
  type MachineTypeSummaryRow,
  type MachineWorkedRow,
} from "../_service";

type Row = MachineWorkedRow & { row_id: number };
type SummaryRow = MachineTypeSummaryRow & { row_id: number };

/** Stoppage / breakdown entries are negative evidence — tinted so nobody reads
 * them as the machine having run. */
const STOP_SOURCES = new Set(["Stoppage", "Breakdown"]);

/** `sources` and `status_label` stay plain strings on the row (the Excel export
 * and the column sizing read them); the chips are only how they are drawn. */
const machineCols: GridColDef<Row>[] = [
  { field: "date", headerName: "Date", width: 110 },
  { field: "shift", headerName: "Shift", width: 70 },
  { field: "machine", headerName: "Machine", flex: 1, minWidth: 170 },
  { field: "machine_type", headerName: "Type", width: 130 },
  { field: "dept", headerName: "Department", flex: 1, minWidth: 150 },
  { field: "groups", headerName: "Group", flex: 1, minWidth: 150 },
  numCol("workers", "Workers Marked", 110, 0),
  numCol("stoppage_hours", "Stoppage Hrs", 115),
  numCol("breakdown_min", "Breakdown Min", 125, 0),
  numCol("prod_kg", "Prod Kg", 110),
  numCol("prod_cuts", "Prod Cuts", 110),
  {
    field: "sources",
    headerName: "Entries",
    flex: 1.2,
    minWidth: 220,
    renderCell: (params) => (
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ py: 0.5 }}>
        {splitSources(String(params.value ?? "")).map((src) => (
          <Chip
            key={src}
            label={src}
            size="small"
            variant="outlined"
            color={STOP_SOURCES.has(src) ? "warning" : "default"}
          />
        ))}
      </Stack>
    ),
  },
  {
    field: "status_label",
    headerName: "Status",
    width: 170,
    renderCell: (params) => <StatusCell row={params.row} />,
  },
];

/** Excel only: the grid says the same in the Status cell's tooltip. */
const manualExportCol: GridColDef<Row> = { field: "manual", headerName: "Manual", width: 260 };
const exportCols: GridColDef<Row>[] = [...machineCols, manualExportCol];

/**
 * The status chip. On a manually added / excluded machine-shift it carries a
 * tooltip with the reason, who and when — opened by a tap on a phone. The
 * grid's own delegated hover tooltip (the cell text as a native `title`) is
 * kept off those cells so the two do not show at once.
 */
function StatusCell({ row }: { row: Row }) {
  const chip = (
    <Chip
      size="small"
      label={row.status_label}
      color={machineStatusTone(row.status)}
      variant={machineStatusChipVariant(row.status)}
    />
  );
  const lines = manualTooltipLines(row);
  if (lines.length === 0) return chip;
  return (
    <Box
      component="span"
      onMouseOver={(e) => {
        e.stopPropagation();
        e.currentTarget.closest(".MuiDataGrid-cell")?.removeAttribute("title");
      }}
    >
      <Tooltip
        arrow
        enterTouchDelay={0}
        leaveTouchDelay={5000}
        title={
          <Box>
            {lines.map((line) => (
              <Box key={line}>{line}</Box>
            ))}
          </Box>
        }
      >
        {chip}
      </Tooltip>
    </Box>
  );
}

const ROW_ACTION_ICONS: Record<MachineRowAction, React.ReactNode> = {
  count: <Check size={18} />,
  exclude: <Ban size={18} />,
  undo: <Undo2 size={18} />,
};

const ROW_ACTION_COLORS: Record<MachineRowAction, "success" | "error" | "default"> = {
  count: "success",
  exclude: "error",
  undo: "default",
};

/**
 * The actions column — one icon button per row at most (a row has one status,
 * and each status offers one action), so it stays 72px wide and leads the grid:
 * on a phone it is on screen without scrolling the grid sideways.
 */
function actionsCol(onAction: (action: MachineRowAction, row: Row) => void): GridColDef<Row> {
  return {
    field: "actions",
    headerName: "Action",
    width: 72,
    sortable: false,
    filterable: false,
    disableColumnMenu: true,
    renderCell: (params) => {
      const action = machineRowAction(params.row, true);
      if (!action) return null;
      const label = `${MACHINE_ROW_ACTION_LABELS[action]}: ${params.row.machine}, ${params.row.date} shift ${params.row.shift}`;
      return (
        <Tooltip title={MACHINE_ROW_ACTION_LABELS[action]}>
          <IconButton
            size="small"
            color={ROW_ACTION_COLORS[action]}
            aria-label={label}
            onClick={() => onAction(action, params.row)}
            sx={{ minWidth: 40, minHeight: 40 }}
          >
            {ROW_ACTION_ICONS[action]}
          </IconButton>
        </Tooltip>
      );
    },
  };
}

const summaryBaseCols: GridColDef<SummaryRow>[] = [
  { field: "date", headerName: "Date", width: 110 },
  { field: "machine_type", headerName: "Machine Type", flex: 1, minWidth: 160 },
  numCol("run_a", "Shift A", 90, 0),
  numCol("run_b", "Shift B", 90, 0),
  numCol("run_c", "Shift C", 90, 0),
  numCol("run_g", "Shift G", 90, 0),
  numCol("machine_shifts", "Machine-Shifts", 130, 0),
  numCol("machines", "Machines (day)", 130, 0),
];

/** The two "listed, not counted" counts — only a backend with the attendance
 * rule sends them, so the columns appear only when the rows carry them. */
const summaryNotCountedCols: GridColDef<SummaryRow>[] = [
  numCol("stopped_all_shift", "Stopped All Shift", 130, 0),
  numCol("no_worker_marked", "No Worker Marked", 130, 0),
];
const summaryFullCols: GridColDef<SummaryRow>[] = [...summaryBaseCols, ...summaryNotCountedCols];

/** The machine-wise grid has no total lines. Without this ReportGrid would take
 * a row whose typed reason is the single word "Total" or "Closing" for one. */
const neverTotalRow = () => false;

/**
 * What the page provides for the manual additions / exclusions. The tab owns
 * the dialogs; the page owns the API calls, the toasts and the reload.
 */
export interface MachineOverrideControls {
  /** `hasMenuAccess(pathname, "edit")` — ANDed here with `meta.can_edit`. */
  menuEdit: boolean;
  /** Every active machine of the loaded branch, for the Add machines picker. */
  machines: ReadonlyArray<BranchMachine>;
  machinesLoading: boolean;
  machinesError: string | null;
  /** Called each time the Add machines dialog opens; the page fetches the
   * branch machines the first time (and again for another branch). */
  onLoadMachines: () => void;
  /** Saves an ADD / EXCLUDE. Resolves true when saved (the dialog then
   * closes), false when it failed (the dialog stays open). */
  onSave: (form: MachineOverrideForm) => Promise<boolean>;
  /** Retires one override. Same true / false contract. */
  onUndo: (overrideId: number) => Promise<boolean>;
}

export interface MachinesWorkedTabProps {
  /** The `view=machines_run` response; null before the first load / on error. */
  report: HandsReport | null;
  loading: boolean;
  error: string | null;
  /** Null shows the grid's "select a branch" prompt. */
  branchId: number | null;
  /** The five client-side filters. Held by the page so they survive a switch
   * to the Manning tab and back. */
  filters: MachineFilters;
  onFiltersChange: (next: MachineFilters) => void;
  /** Excel header of the machine-wise sheet: company, branch, report name and
   * period. The by-type summary sheet adds " by Type" to the name. */
  exportHeader: ReportExportHeader;
  /** Report No for the Excel header — resolved only when the user exports. */
  resolveReportNo: () => Promise<string | number | null | undefined>;
  /**
   * True when the loaded rows are the whole window the `meta` counts describe.
   * False (a department filter went to the server) makes the status chips count
   * the loaded rows instead, so chips and grid never disagree.
   */
  countsFromMeta: boolean;
  /** Manual additions / exclusions. Omitted = read-only tab. */
  overrides?: MachineOverrideControls;
}

export default function MachinesWorkedTab({
  report,
  loading,
  error,
  branchId,
  filters,
  onFiltersChange,
  exportHeader,
  resolveReportNo,
  countsFromMeta,
  overrides,
}: MachinesWorkedTabProps) {
  const meta = report?.meta;
  const canEdit = canEditMachinesWorked(meta, overrides?.menuEdit === true);
  const [addOpen, setAddOpen] = useState(false);
  const [rowTarget, setRowTarget] = useState<RowOverrideTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const allRows: MachineWorkedRow[] = useMemo(
    () => (report?.rows ?? []).filter(isMachineRunRow).map(toMachineWorkedRow),
    [report],
  );
  const scopes = useMemo(() => machineScopesOf(report), [report]);
  const options = useMemo(() => machineFilterOptions(allRows, scopes), [allRows, scopes]);
  // A reload can take a picked shift / group / designation off the lists; the
  // stale pick is ignored rather than left hiding every row.
  const active = useMemo(() => effectiveMachineFilters(filters, options), [filters, options]);
  const rows: Row[] = useMemo(
    () => filterMachineRows(allRows, active, scopes).map((r, i) => ({ ...r, row_id: i })),
    [allRows, active, scopes],
  );
  // The caption reads the worked machines of the designation's scope, so it is
  // taken with the Status filter off — "Status: Stopped all shift" must not
  // turn it into "no machines worked".
  const captions = useMemo(
    () =>
      designationCaptions(
        active.designationId,
        scopes,
        filterMachineRows(allRows, { ...active, status: "" }, scopes),
      ),
    [allRows, active, scopes],
  );

  const counts = useMemo(
    () => machineStatusCounts(allRows, countsFromMeta ? meta : null),
    [allRows, countsFromMeta, meta],
  );
  const synced = syncedTimeLabel(meta?.synced_at);
  // The two manual chips only appear once there is something to say.
  const statusChips: { status: MachineStatus; label: string }[] = [
    { status: "WORKED", label: `Worked ${counts.worked}` },
    ...(counts.addedManually > 0
      ? [{ status: "ADDED_MANUALLY" as const, label: `Added manually ${counts.addedManually}` }]
      : []),
    { status: "STOPPED_ALL_SHIFT", label: `Stopped all shift ${counts.stoppedAllShift}` },
    { status: "NO_WORKER_MARKED", label: `No worker marked ${counts.noWorkerMarked}` },
    ...(counts.excludedManually > 0
      ? [{ status: "EXCLUDED_MANUALLY" as const, label: `Excluded ${counts.excludedManually}` }]
      : []),
  ];

  const onRowAction = useCallback(
    (action: MachineRowAction, row: Row) => setRowTarget({ action, row }),
    [],
  );
  // Stable while `canEdit` holds: ReportGrid sizes the columns once per columns
  // array, so a new array on every render would re-measure them each time.
  const gridCols = useMemo(
    () => (canEdit ? [actionsCol(onRowAction), ...machineCols] : machineCols),
    [canEdit, onRowAction],
  );

  const openAdd = () => {
    overrides?.onLoadMachines();
    setAddOpen(true);
  };
  /** Runs a save / undo; the dialogs close only when it went through. */
  const settle = async (run: Promise<boolean> | undefined) => {
    if (!run) return;
    setSaving(true);
    const ok = await run;
    setSaving(false);
    if (ok) {
      setAddOpen(false);
      setRowTarget(null);
    }
  };

  const summaryRows: SummaryRow[] = useMemo(
    () => (report?.type_summary ?? []).map((r, i) => ({ ...r, row_id: i })),
    [report],
  );
  const summaryCols = useMemo(
    () =>
      summaryRows.some((r) => r.stopped_all_shift != null || r.no_worker_marked != null)
        ? summaryFullCols
        : summaryBaseCols,
    [summaryRows],
  );

  const filtered = rows.length !== allRows.length;
  // Built on the sanitised filters, so a stale pick is dropped for good the
  // next time any filter is touched.
  const setFilter = <K extends keyof MachineFilters>(key: K, value: MachineFilters[K]) =>
    onFiltersChange({ ...active, [key]: value });

  const exportTo = (kind: "rows" | "summary") => {
    void (async () => {
      const reportNo = await resolveReportNo();
      if (kind === "rows") {
        // The sheet shades any row holding a cell that reads "Total" / "Closing"
        // as a total line; a typed reason may be exactly that word. The reason
        // is exported inside the Manual text, so its bare copy is left out.
        const sheetRows = rows.map((r) => ({ ...r, manual_reason: null }));
        await exportRowsToExcel(exportCols, sheetRows, "machines-worked", { ...exportHeader, reportNo });
      } else {
        await exportRowsToExcel(summaryCols, summaryRows, "machines-worked-by-type", {
          ...exportHeader,
          reportName: `${exportHeader.reportName ?? ""} by Type`.trim(),
          reportNo,
        });
      }
    })();
  };

  return (
    <Box>
      {report ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
          {statusChips.map((c) => (
            <Chip
              key={c.status}
              label={c.label}
              color={machineStatusTone(c.status)}
              variant={machineStatusChipVariant(c.status)}
              size="small"
            />
          ))}
          {synced ? (
            <Tooltip title={`Machines worked rebuilt from the entries at ${meta?.synced_at ?? ""}`}>
              <Chip label={`Synced ${synced}`} size="small" variant="outlined" />
            </Tooltip>
          ) : null}
          {countsFromMeta && meta?.machines_run != null ? (
            <Tooltip title="Distinct machines behind the worked machine-shifts">
              <Chip label={`Machines ${meta.machines_run}`} size="small" variant="outlined" />
            </Tooltip>
          ) : null}
          {canEdit ? (
            <>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                size="small"
                startIcon={<Plus size={16} />}
                onClick={openAdd}
                disabled={loading}
                sx={{
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                  textTransform: "none",
                  minHeight: 36,
                  width: { xs: "100%", sm: "auto" },
                }}
              >
                Add machines
              </Button>
            </>
          ) : null}
        </Stack>
      ) : null}

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
        <FilterSlot width={120}>
          <SearchableOptionSelect<string>
            label="Shift"
            size="small"
            placeholder="All"
            options={options.shifts}
            value={active.shift}
            onChange={(v) => setFilter("shift", v)}
            fullWidth
          />
        </FilterSlot>
        <FilterSlot width={200}>
          <SearchableOptionSelect<MachineStatus>
            label="Status"
            size="small"
            placeholder="All"
            options={options.statuses}
            value={active.status}
            onChange={(v) => setFilter("status", v)}
            fullWidth
          />
        </FilterSlot>
        <FilterSlot width={200}>
          <SearchableOptionSelect<number>
            label="Machine type"
            size="small"
            placeholder="All"
            options={options.machineTypes}
            value={active.machineTypeId}
            onChange={(v) => setFilter("machineTypeId", v)}
            fullWidth
          />
        </FilterSlot>
        <FilterSlot width={210}>
          <SearchableOptionSelect<number>
            label="Group"
            size="small"
            placeholder="All"
            noOptionsText="No machine groups on these rows"
            options={options.groups}
            value={active.groupId}
            onChange={(v) => setFilter("groupId", v)}
            fullWidth
          />
        </FilterSlot>
        <FilterSlot width={230}>
          <SearchableOptionSelect<number>
            label="Designation"
            size="small"
            placeholder="All"
            noOptionsText="No machine or production norms in force"
            options={options.designations}
            value={active.designationId}
            onChange={(v) => setFilter("designationId", v)}
            fullWidth
          />
        </FilterSlot>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="outlined"
          size="small"
          disabled={branchId == null || summaryRows.length === 0}
          onClick={() => exportTo("summary")}
          sx={{ textTransform: "none" }}
        >
          Export Summary
        </Button>
        <Button
          variant="outlined"
          size="small"
          disabled={branchId == null || rows.length === 0}
          onClick={() => exportTo("rows")}
          sx={{ textTransform: "none" }}
        >
          Export to Excel
        </Button>
      </Box>

      {captions.map((line) => (
        <Typography key={line} variant="body2" sx={{ mb: 1, px: 0.5 }}>
          {line}
        </Typography>
      ))}

      {meta?.notes?.length ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {meta.notes.join(" · ")}
        </Alert>
      ) : null}

      {summaryRows.length > 0 ? (
        <>
          <Typography variant="subtitle1" sx={{ color: tokens.report.header, fontWeight: 600, mb: 0.5 }}>
            Machines worked by type (counted machine-shifts)
          </Typography>
          <ReportGrid
            rows={summaryRows}
            columns={summaryCols}
            getRowId={(r) => r.row_id}
            loading={loading}
            error={null}
            height={Math.min(120 + summaryRows.length * 36, 360)}
          />
        </>
      ) : null}

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, flexWrap: "wrap", mt: 2, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ color: tokens.report.header, fontWeight: 600 }}>
          Machine-wise detail
        </Typography>
        {report ? (
          <Typography variant="body2" color="text.secondary">
            {filtered
              ? `${rows.length} of ${allRows.length} machine-shifts (filtered)`
              : `${allRows.length} machine-shifts`}
          </Typography>
        ) : null}
      </Box>
      <ReportGrid
        rows={rows}
        columns={gridCols}
        getRowId={(r) => r.row_id}
        loading={loading}
        error={error}
        branchId={branchId}
        isTotalRow={neverTotalRow}
      />

      {canEdit && overrides ? (
        <>
          <AddMachinesDialog
            open={addOpen}
            rows={allRows}
            dateFrom={meta?.date_from ?? ""}
            dateTo={meta?.date_to ?? ""}
            defaultShift={active.shift}
            machines={overrides.machines}
            machinesLoading={overrides.machinesLoading}
            machinesError={overrides.machinesError}
            saving={saving}
            onClose={() => setAddOpen(false)}
            onSave={(form) => void settle(overrides.onSave(form))}
          />
          <OverrideReasonDialog
            target={rowTarget}
            saving={saving}
            onClose={() => setRowTarget(null)}
            onSave={(form) => void settle(overrides.onSave(form))}
            onUndo={(overrideId) => void settle(overrides.onUndo(overrideId))}
          />
        </>
      ) : null}
    </Box>
  );
}
