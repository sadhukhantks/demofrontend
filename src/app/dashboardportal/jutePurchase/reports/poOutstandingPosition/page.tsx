"use client";

/**
 * Outstanding PO Position — the raw-jute purchase position as on a date, at a
 * glance: which qualities are still to arrive, how much, and what it is worth.
 *
 * Backend: `GET /api/juteReports/po-outstanding-position`
 * (../vowerp3be/src/juteProcurement/po_position.py) — contract in ./types.ts.
 *
 * Built to be read quickly, on a phone as much as a desktop: it loads on open
 * for the sidebar branch as on today, shows the KPI tiles and the PO Detail
 * grid first, and keeps the supplier-wise and quality-wise roll-ups behind
 * tabs. Tapping "POs" on a quality or supplier row (or double-clicking the
 * row) jumps back to PO Detail narrowed to it; the Supplier dropdown in
 * the filter bar sets the same filter and, unlike the quality drill-down,
 * narrows every tab and the KPI strip (client-side re-aggregation). The
 * on-screen grids carry only the columns needed to read the position. The
 * Excel and PDF downloads cover the tab currently shown: Excel writes that
 * tab's full column set on one sheet, the PDF prints the grid as displayed.
 *
 * Every weight is shown in whole metric tonnes (kg / 1000, 0 dp) — the API
 * keeps returning kg and the conversion happens once in the grid-row builders.
 * The PO Detail tab is one row per PO (item rows grouped client-side, spec
 * §11.2) and reads a PO the way the owner does: N lorries of ~X MT, as
 * Order / Received / Returned / Balance lorry-and-weight pairs.
 *
 * PO settlement (docs/claude/modules/jute-purchase/po-settlement-spec.md §8):
 * with edit access on the menu the PO Detail tab offers PO-level checkboxes +
 * "Close selected", a per-row "Close" action and a "Re-evaluate" button that
 * re-runs the settlement engine for the branch. Stale POs are tinted red,
 * merely overdue ones amber.
 */

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { usePathname } from "next/navigation";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { todayIso } from "@/components/reports/reportDates";
import type { BranchOption } from "@/components/reports/types";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { toast } from "@/hooks/use-toast";
import { tokens } from "@/styles/tokens";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import ClosePoDialog, { type CloseTarget } from "./_components/ClosePoDialog";
import { exportPoPositionPdf, type PdfSection } from "./poPositionPdf";
import type {
  BulkCloseResult,
  LorryFigures,
  PoGridRow,
  PoPositionBucket,
  PoPositionReport,
  PoSettleRule,
  QualityGridRow,
  RecomputeResult,
  SupplierGridRow,
} from "./types";
import {
  applySupplierFilter,
  buildPoGridRows,
  buildQualityGridRows,
  buildSupplierGridRows,
  detailRowClass,
  distinctPoIds,
  exportPoPositionSheet,
  filterPoRows,
  fmtInr,
  fmtPct,
  fmtWt,
  isGrandTotalRow,
  lorrySummary,
  pruneSelection,
  ruleCaption,
  summarizeBulkClose,
  summarizeRecompute,
  supplierOptions,
  TABS,
  tabExportName,
  toggleAllPoSelection,
  togglePoSelection,
  type DetailFilter,
  type SupplierOption,
  type TabKey,
} from "./poPositionUtils";

// --------------------------------------------------------------- fetch ----

interface FetchParams {
  coId: number;
  branchId: number;
  asOn: string;
}

async function fetchPoPosition(p: FetchParams): Promise<PoPositionReport> {
  const qs = new URLSearchParams({
    co_id: String(p.coId),
    branch_id: String(p.branchId),
    as_on: p.asOn,
  });
  const res = await fetchWithCookie<{ data: PoPositionReport }>(
    `${apiRoutesPortalMasters.JUTE_REPORT_PO_OUTSTANDING_POSITION}?${qs.toString()}`,
  );
  if (res.error || !res.data?.data) {
    throw new Error(res.error ?? "Failed to fetch the Outstanding PO Position report");
  }
  const d = res.data.data;
  return {
    ...d,
    detail: d.detail ?? [],
    by_quality: d.by_quality ?? [],
    by_supplier: d.by_supplier ?? [],
  };
}

/** `menu_path` tells the backend which menu to check edit access on — the same
 * page path the sidebar's hasMenuAccess gates the buttons with. */
function menuPathParam(): string {
  const p = typeof window === "undefined" ? "" : window.location.pathname;
  return p ? `&menu_path=${encodeURIComponent(p)}` : "";
}

/** `POST /jutePO/close_jute_po/{id}?co_id=` — short-close one live PO. */
async function closeOnePo(coId: number, jutePoId: number, remark: string): Promise<void> {
  const res = await fetchWithCookie<{ data: unknown }>(
    `${apiRoutesPortalMasters.JUTE_PO_CLOSE}/${jutePoId}?co_id=${coId}${menuPathParam()}`,
    "POST",
    { remark },
  );
  if (res.error) throw new Error(res.error);
}

/** `POST /jutePO/bulk_close_jute_po?co_id=&branch_id=` — short-close several POs. */
async function bulkClosePos(
  coId: number,
  branchId: number,
  jutePoIds: number[],
  remark: string,
): Promise<BulkCloseResult> {
  const res = await fetchWithCookie<{ data: BulkCloseResult }>(
    `${apiRoutesPortalMasters.JUTE_PO_BULK_CLOSE}?co_id=${coId}&branch_id=${branchId}${menuPathParam()}`,
    "POST",
    { jute_po_ids: jutePoIds, remark },
  );
  if (res.error || !res.data?.data) throw new Error(res.error ?? "Bulk close failed");
  return res.data.data;
}

/** `POST /jutePO/recompute_settlement?co_id=&branch_id=` — re-run the engine. */
async function recomputeSettlement(coId: number, branchId: number): Promise<RecomputeResult> {
  const res = await fetchWithCookie<{ data: RecomputeResult }>(
    `${apiRoutesPortalMasters.JUTE_PO_RECOMPUTE_SETTLEMENT}?co_id=${coId}&branch_id=${branchId}${menuPathParam()}`,
    "POST",
  );
  if (res.error || !res.data?.data) throw new Error(res.error ?? "Re-evaluate failed");
  return res.data.data;
}

// ------------------------------------------------------------- columns ----

/** "POs" tap target on a summary row — opens the PO Detail tab for that row. */
function drillCol<T extends { id: string; po_count: number }>(
  onDrill: (row: T) => void,
): GridColDef<T> {
  return {
    field: "po_count",
    headerName: "POs",
    type: "number",
    width: 70,
    renderCell: (params: GridRenderCellParams<T, number>) =>
      isGrandTotalRow(params.row) ? (
        <span>{params.value}</span>
      ) : (
        <Link
          component="button"
          type="button"
          underline="always"
          onClick={(e) => {
            e.stopPropagation();
            onDrill(params.row);
          }}
          sx={{ fontWeight: 600 }}
        >
          {params.value}
        </Link>
      ),
  };
}

/**
 * "n (MT)" lorry-and-weight cell. Right-aligned like a number; the Returned
 * column paints its cell in the error colour when anything was returned.
 */
function lorryCol<T extends { returned_lorries: number | null }>(
  field: keyof T & string,
  headerName: string,
  errorWhenReturned = false,
): GridColDef<T> {
  return {
    field,
    headerName,
    width: 125,
    align: "right",
    headerAlign: "right",
    sortable: false,
    cellClassName: errorWhenReturned
      ? (params) => ((params.row as T).returned_lorries ? "po-returned-cell" : "")
      : undefined,
  };
}

// On-screen: just what it takes to read the position. Export: everything.
// Weights are the `*_mt` fields (whole MT); quantities, rates and values as stored.
const qualityScreenColumns = (
  onDrill: (row: QualityGridRow) => void,
): GridColDef<QualityGridRow>[] => [
  { field: "item_name", headerName: "Quality", flex: 1, minWidth: 130 },
  numCol("balance_mt", "Bal Wt (MT)", 110, 0),
  numCol("balance_pct", "Bal %", 80, 1),
  numCol("balance_value", "Bal Value", 120, 0),
  drillCol(onDrill),
  numCol("overdue_pos", "Overdue", 85, 0),
  numCol("ordered_mt", "Ord Wt (MT)", 110, 0),
  numCol("received_mt", "Recv Wt (MT)", 110, 0),
];

const QUALITY_EXPORT_COLUMNS: GridColDef<QualityGridRow>[] = [
  { field: "item_code", headerName: "Code" },
  { field: "item_name", headerName: "Quality" },
  numCol("po_count", "POs", 80, 0),
  numCol("overdue_pos", "Overdue POs", 110, 0),
  numCol("ordered_qty", "Ord Qty", 110, 3),
  numCol("received_qty", "Recv Qty", 110, 3),
  numCol("balance_qty", "Bal Qty", 110, 3),
  numCol("ordered_mt", "Ord Wt (MT)", 120, 0),
  numCol("received_mt", "Recv Wt (MT)", 120, 0),
  numCol("balance_mt", "Bal Wt (MT)", 120, 0),
  numCol("balance_pct", "Bal %", 90, 2),
  numCol("avg_rate", "Avg Rate", 110, 2),
  numCol("balance_value", "Bal Value", 140, 2),
];

const supplierScreenColumns = (
  onDrill: (row: SupplierGridRow) => void,
): GridColDef<SupplierGridRow>[] => [
  { field: "party_name", headerName: "Supplier", flex: 1, minWidth: 150 },
  lorryCol("bal_lw", "Bal Lorry (Wt)"),
  numCol("balance_pct", "Bal %", 80, 1),
  numCol("balance_value", "Bal Value", 120, 0),
  drillCol(onDrill),
  numCol("overdue_pos", "Overdue", 85, 0),
  lorryCol("order_lw", "Order Lorry (Wt)"),
  lorryCol("recv_lw", "Recv Lorry (Wt)"),
  lorryCol("returned_lw", "Returned Lorry (Wt)", true),
  { field: "oldest_po_date", headerName: "Oldest PO", width: 105 },
];

/** Numeric Excel columns for the four lorry-and-weight pairs (two per pair). */
const lorryExportColumns = <T extends LorryFigures>(): GridColDef<T>[] => [
  numCol("order_lorries", "Order Lorries", 100, 0),
  numCol("order_wt_mt", "Order Wt (MT)", 110, 0),
  numCol("received_lorries", "Recv Lorries", 100, 0),
  numCol("received_wt_mt", "Recv Wt (MT)", 110, 0),
  numCol("returned_lorries", "Returned Lorries", 110, 0),
  numCol("returned_wt_mt", "Returned Wt (MT)", 120, 0),
  numCol("pending_lorries", "Bal Lorries", 100, 0),
  numCol("pending_wt_mt", "Bal Wt (MT)", 110, 0),
];

const SUPPLIER_EXPORT_COLUMNS: GridColDef<SupplierGridRow>[] = [
  { field: "party_name", headerName: "Supplier" },
  numCol("po_count", "POs", 80, 0),
  numCol("overdue_pos", "Overdue POs", 110, 0),
  { field: "oldest_po_date", headerName: "Oldest PO" },
  ...lorryExportColumns<SupplierGridRow>(),
  numCol("ordered_mt", "Ord Wt (MT)", 120, 0),
  numCol("received_mt", "Recv Wt (MT)", 120, 0),
  numCol("balance_mt", "Bal Wt (MT)", 120, 0),
  numCol("balance_pct", "Bal %", 90, 2),
  numCol("balance_value", "Bal Value", 140, 2),
];

interface DetailColumnOptions {
  /** Edit access on the menu: adds the checkbox and the per-row Close action. */
  canEdit: boolean;
  selected: ReadonlySet<number>;
  /** Header checkbox state for the visible rows. */
  headerState: "none" | "some" | "all";
  onToggle: (poId: number) => void;
  onToggleAll: () => void;
  onCloseRow: (row: PoGridRow) => void;
}

// One row per PO (§11.2): lorry-and-weight pairs read "n (MT)".
const detailScreenColumns = (o: DetailColumnOptions): GridColDef<PoGridRow>[] => {
  const cols: GridColDef<PoGridRow>[] = [];
  if (o.canEdit) {
    cols.push({
      field: "__select",
      headerName: "",
      width: 52,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderHeader: () => (
        <Checkbox
          size="small"
          checked={o.headerState === "all"}
          indeterminate={o.headerState === "some"}
          onChange={o.onToggleAll}
          onClick={(e) => e.stopPropagation()}
          inputProps={{ "aria-label": "Select all POs" }}
          sx={{ color: "white", "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: "white" } }}
        />
      ),
      renderCell: (params: GridRenderCellParams<PoGridRow>) => (
        <Checkbox
          size="small"
          checked={o.selected.has(params.row.jute_po_id)}
          onChange={() => o.onToggle(params.row.jute_po_id)}
          onClick={(e) => e.stopPropagation()}
          inputProps={{ "aria-label": `Select PO ${params.row.po_label}` }}
        />
      ),
    });
  }
  cols.push(
    { field: "po_label", headerName: "PO #", width: 170 },
    { field: "po_date", headerName: "PO Date", width: 105 },
    { field: "party_name", headerName: "Supplier", flex: 1, minWidth: 140 },
    { field: "mukam", headerName: "Mukam", width: 110 },
    {
      field: "qualities",
      headerName: "Qualities",
      flex: 1.4,
      minWidth: 180,
      // One quality per line (the text carries "\n"; the grid row grows to fit).
      renderCell: (params: GridRenderCellParams<PoGridRow, string>) => (
        <Box component="span" sx={{ whiteSpace: "pre-line" }}>
          {params.value}
        </Box>
      ),
    },
    lorryCol("order_lw", "Order Lorry (Wt)"),
    lorryCol("recv_lw", "Recv Lorry (Wt)"),
    lorryCol("returned_lw", "Returned Lorry (Wt)", true),
    lorryCol("bal_lw", "Bal Lorry (Wt)"),
    numCol("balance_pct", "Bal %", 80, 1),
    numCol("balance_value", "Bal Value", 120, 0),
    { field: "due_date", headerName: "Due", width: 105 },
    numCol("age_days", "Age (d)", 80, 0),
    { field: "stale_label", headerName: "Stale", width: 70 },
    { field: "settle_label", headerName: "Settle?", width: 80 },
    { field: "last_receipt_date", headerName: "Last Receipt", width: 115 },
  );
  if (o.canEdit) {
    cols.push({
      field: "__close",
      headerName: "",
      width: 80,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: (params: GridRenderCellParams<PoGridRow>) => (
        <Tooltip title="Short-close this PO">
          <Button
            size="small"
            color="error"
            variant="text"
            onClick={(e) => {
              e.stopPropagation();
              o.onCloseRow(params.row);
            }}
            sx={{ textTransform: "none", minWidth: 0, px: 1 }}
          >
            Close
          </Button>
        </Tooltip>
      ),
    });
  }
  return cols;
};

const DETAIL_EXPORT_COLUMNS: GridColDef<PoGridRow>[] = [
  { field: "po_label", headerName: "PO #" },
  { field: "po_date", headerName: "PO Date" },
  numCol("age_days", "Age (days)", 100, 0),
  { field: "due_date", headerName: "Due Date" },
  { field: "overdue_label", headerName: "Overdue" },
  { field: "stale_label", headerName: "Stale" },
  { field: "settle_label", headerName: "Settle?" },
  { field: "party_name", headerName: "Supplier" },
  { field: "mukam", headerName: "Mukam" },
  { field: "qualities", headerName: "Qualities" },
  ...lorryExportColumns<PoGridRow>(),
  numCol("balance_pct", "Bal %", 90, 2),
  numCol("ordered_value", "Ord Value", 140, 2),
  numCol("balance_value", "Bal Value", 140, 2),
  numCol("mr_count", "MRs", 80, 0),
  { field: "last_receipt_date", headerName: "Last Receipt" },
  numCol("days_since_receipt", "Days Since Receipt", 120, 0),
];

/** Grid tall enough for its rows (header + rows + footer), capped like the kit default. */
const gridHeight = (rowCount: number): number =>
  Math.min(600, Math.max(220, 60 + 53 + rowCount * 44));

// ---------------------------------------------------------------- KPIs ----

function KpiTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ fontWeight: 700, color: color ?? "text.primary", lineHeight: 1.3, wordBreak: "break-word" }}
      >
        {value}
      </Typography>
      {sub ? (
        <Typography variant="caption" sx={{ color: color ?? "text.secondary" }}>
          {sub}
        </Typography>
      ) : null}
    </Paper>
  );
}

function KpiStrip({
  totals: t,
  lorries,
  rule,
}: {
  totals: PoPositionBucket;
  /** Lorry figures over distinct POs (backend totals when present, else client-side). */
  lorries: LorryFigures;
  rule?: PoSettleRule | null;
}) {
  const stale = t.stale_pos ?? 0;
  const suggest = t.settle_suggest_pos ?? 0;
  const staleDays = rule?.stale_days;
  const returned = lorries.returned_lorries ?? 0;
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(3, minmax(0, 1fr))",
          md: "repeat(auto-fit, minmax(160px, 1fr))",
        },
      }}
    >
      <KpiTile
        label="Balance"
        value={`${fmtWt(t.balance_wt)} MT · ${lorries.pending_lorries ?? 0} lorries`}
        sub={`${fmtPct(t.balance_pct)} of ${fmtWt(t.ordered_wt)} MT · ${lorries.order_lorries ?? 0} lorries ordered`}
      />
      <KpiTile label="Balance Value" value={fmtInr(t.balance_value)} />
      <KpiTile
        label="Outstanding POs"
        value={String(t.po_count)}
        sub={`Received ${fmtWt(t.received_wt)} MT · ${lorries.received_lorries ?? 0} lorries`}
      />
      {returned > 0 ? (
        <KpiTile
          label="Returned"
          value={`${returned} ${returned === 1 ? "lorry" : "lorries"}`}
          sub={`${lorries.returned_wt_mt ?? 0} MT sent back — not counted as received`}
          color="error.main"
        />
      ) : null}
      <KpiTile
        label="Past Due Date"
        value={String(t.overdue_pos)}
        sub={t.overdue_pos ? "POs beyond PO date + delivery days" : "none"}
        color={t.overdue_pos > 0 ? "error.main" : undefined}
      />
      <KpiTile
        label="Stale"
        value={String(stale)}
        sub={
          stale
            ? `overdue, nothing received${staleDays ? ` for ${staleDays}+ days` : ""}`
            : "none"
        }
        color={stale > 0 ? "error.main" : undefined}
      />
      {suggest > 0 ? (
        <KpiTile
          label="Not yet settled"
          value={String(suggest)}
          sub="receipts meet the rule — press Re-evaluate"
          color="warning.main"
        />
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------- page ----

/** Tab index: 0 PO Detail, 1 By Supplier, 2 By Quality (see TABS). */
type View = 0 | 1 | 2;
const DETAIL_TAB: View = 0;

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  const { hasMenuAccess } = useSidebarContext();
  const mounted = useMounted();
  const pathname = usePathname();

  // Portal action-level permission for this menu (view 1 / print 2 / create 3 /
  // edit 4) — the same check IndexWrapper uses for its buttons.
  const canEdit = useMemo(() => hasMenuAccess(pathname, "edit"), [hasMenuAccess, pathname]);

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [asOn, setAsOn] = useState<string>(dateParam ?? todayIso());

  const [data, setData] = useState<PoPositionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>(DETAIL_TAB);
  const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);

  const [selectedPoIds, setSelectedPoIds] = useState<ReadonlySet<number>>(() => new Set());
  const [closeTarget, setCloseTarget] = useState<CloseTarget | null>(null);
  const [closing, setClosing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null, opts: { keepFilter?: boolean } = {}) => {
      if (coId == null || bId == null) return;
      if (!asOn) {
        setError("Pick an as-on date.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setData(await fetchPoPosition({ coId, branchId: bId, asOn }));
        if (!opts.keepFilter) setDetailFilter(null);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load the report");
      } finally {
        setLoading(false);
      }
    },
    [coId, asOn],
  );

  // Seed the branch ONCE when the sidebar context resolves.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the branch belong to the
  // old company — drop them so nothing renders mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
      setDetailFilter(null);
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once a branch is available; afterwards only on Submit.
  useEffect(() => {
    const b = branchId ?? initialBranchId;
    if (!fetchedOnce.current && coId != null && b != null) {
      fetchedOnce.current = true;
      void runFetch(b);
    }
  }, [coId, branchId, initialBranchId, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  // Supplier options come from the UNFILTERED load so the list never shrinks.
  const suppliers = useMemo(() => supplierOptions(data?.by_supplier ?? []), [data]);
  const selectedSupplier: SupplierOption | null = useMemo(
    () =>
      detailFilter?.kind === "supplier" && detailFilter.party_name
        ? (suppliers.find((s) => s.party_name === detailFilter.party_name) ?? {
            party_name: detailFilter.party_name,
          })
        : null,
    [detailFilter, suppliers],
  );

  // What is shown: the report narrowed to the supplier filter (all tabs + KPIs).
  const viewData = useMemo(
    () => (data ? applySupplierFilter(data, detailFilter) : null),
    [data, detailFilter],
  );

  const qualityRows = useMemo(
    () => buildQualityGridRows(viewData?.by_quality ?? [], viewData?.totals),
    [viewData],
  );
  const supplierRows = useMemo(
    () =>
      buildSupplierGridRows(viewData?.by_supplier ?? [], viewData?.totals, viewData?.detail ?? []),
    [viewData],
  );
  const detailRows = useMemo(() => buildPoGridRows(viewData?.detail ?? []), [viewData]);
  const visibleDetailRows = useMemo(
    () => filterPoRows(detailRows, detailFilter),
    [detailRows, detailFilter],
  );
  // KPI lorry figures: the backend totals when they carry them, else summed
  // client-side over the distinct POs shown.
  const kpiLorries = useMemo<LorryFigures>(() => {
    const local = lorrySummary(viewData?.detail ?? []);
    const t = viewData?.totals;
    if (!t || t.order_lorries == null) return local;
    return {
      ...local,
      order_lorries: t.order_lorries,
      received_lorries: t.received_lorries ?? local.received_lorries,
      returned_lorries: t.returned_lorries ?? local.returned_lorries,
      pending_lorries: t.pending_lorries ?? local.pending_lorries,
      returned_wt_mt: t.returned_weight != null ? Math.round(t.returned_weight / 1000) : local.returned_wt_mt,
    };
  }, [viewData]);

  // Selection follows the visible rows: a reload or a narrower filter drops
  // POs that are no longer on screen, so the button count is always honest.
  useEffect(() => {
    setSelectedPoIds((prev) => {
      const next = pruneSelection(prev, visibleDetailRows);
      return next.size === prev.size ? prev : next;
    });
  }, [visibleDetailRows]);

  const visiblePoIds = useMemo(() => distinctPoIds(visibleDetailRows), [visibleDetailRows]);
  const headerState: "none" | "some" | "all" = useMemo(() => {
    if (!visiblePoIds.length || selectedPoIds.size === 0) return "none";
    return visiblePoIds.every((id) => selectedPoIds.has(id)) ? "all" : "some";
  }, [visiblePoIds, selectedPoIds]);

  const drillToQuality = useCallback((row: QualityGridRow) => {
    setDetailFilter({ kind: "quality", item_id: row.item_id, label: row.item_name ?? "—" });
    setView(DETAIL_TAB);
  }, []);
  const drillToSupplier = useCallback((row: SupplierGridRow) => {
    setDetailFilter({ kind: "supplier", party_name: row.party_name, label: row.party_name ?? "—" });
    setView(DETAIL_TAB);
  }, []);
  const pickSupplier = useCallback((opt: SupplierOption | null) => {
    setDetailFilter(
      opt ? { kind: "supplier", party_name: opt.party_name, label: opt.party_name } : null,
    );
  }, []);

  const onToggle = useCallback(
    (poId: number) => setSelectedPoIds((prev) => togglePoSelection(prev, poId)),
    [],
  );
  const onToggleAll = useCallback(
    () => setSelectedPoIds((prev) => toggleAllPoSelection(prev, visibleDetailRows)),
    [visibleDetailRows],
  );
  const onCloseRow = useCallback((row: PoGridRow) => {
    setCloseTarget({ kind: "single", jute_po_id: row.jute_po_id, po_label: row.po_label });
  }, []);
  const onCloseSelected = useCallback(() => {
    if (!selectedPoIds.size) return;
    setCloseTarget({ kind: "bulk", jute_po_ids: [...selectedPoIds] });
  }, [selectedPoIds]);

  const qualityColumns = useMemo(() => qualityScreenColumns(drillToQuality), [drillToQuality]);
  const supplierColumns = useMemo(() => supplierScreenColumns(drillToSupplier), [drillToSupplier]);
  const detailColumns = useMemo(
    () =>
      detailScreenColumns({
        canEdit,
        selected: selectedPoIds,
        headerState,
        onToggle,
        onToggleAll,
        onCloseRow,
      }),
    [canEdit, selectedPoIds, headerState, onToggle, onToggleAll, onCloseRow],
  );

  const isEmpty = data != null && data.detail.length === 0;
  const hasData = data != null && !isEmpty;

  const handleCloseSubmit = useCallback(
    async (target: CloseTarget, remark: string) => {
      if (coId == null || branchId == null) return;
      setClosing(true);
      try {
        if (target.kind === "single") {
          await closeOnePo(coId, target.jute_po_id, remark);
          toast({ title: "PO closed", description: `${target.po_label} is short-closed.` });
        } else {
          const result = await bulkClosePos(coId, branchId, target.jute_po_ids, remark);
          toast({ title: "Close selected", description: summarizeBulkClose(result) });
        }
        setCloseTarget(null);
        setSelectedPoIds(new Set());
        await runFetch(branchId, { keepFilter: true });
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Close failed",
          description: e instanceof Error ? e.message : "Please try again.",
        });
      } finally {
        setClosing(false);
      }
    },
    [coId, branchId, runFetch],
  );

  const handleRecompute = useCallback(async () => {
    if (coId == null || branchId == null) return;
    setRecomputing(true);
    try {
      const result = await recomputeSettlement(coId, branchId);
      toast({ title: "Settlement re-evaluated", description: summarizeRecompute(result) });
      await runFetch(branchId, { keepFilter: true });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Re-evaluate failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setRecomputing(false);
    }
  }, [coId, branchId, runFetch]);

  const currentTab: TabKey = TABS[view];

  /** Header block shared by the Excel and PDF downloads — names the tab and the supplier filter. */
  const buildExportHeader = useCallback(async () => {
    if (!viewData) return null;
    const supplierNote =
      detailFilter?.kind === "supplier" ? ` · Supplier: ${detailFilter.label}` : "";
    const { title, slug } = tabExportName(currentTab);
    return {
      header: {
        companyName,
        branchName: selectedBranch?.branch_name ?? viewData.branch_name,
        reportName: `Outstanding PO Position — ${title}`,
        reportNo: await resolveReportMenuId(pathname),
        reportFor: `As on ${viewData.as_on}${supplierNote}`,
      },
      title,
      fileBase: `jute-po-outstanding-position-${slug}-${viewData.as_on}`,
    };
  }, [viewData, detailFilter, currentTab, companyName, selectedBranch?.branch_name, pathname]);

  const [exportBusy, setExportBusy] = useState<"excel" | "pdf" | null>(null);

  // Excel: the current tab's full column set on one sheet.
  const handleExport = useCallback(async () => {
    const meta = await buildExportHeader();
    if (!viewData || !meta) return;
    setExportBusy("excel");
    try {
      if (currentTab === "detail") {
        await exportPoPositionSheet(
          { title: meta.title, columns: DETAIL_EXPORT_COLUMNS, rows: detailRows },
          meta.header,
          meta.fileBase,
        );
      } else if (currentTab === "supplier") {
        await exportPoPositionSheet(
          { title: meta.title, columns: SUPPLIER_EXPORT_COLUMNS, rows: supplierRows },
          meta.header,
          meta.fileBase,
        );
      } else {
        await exportPoPositionSheet(
          { title: meta.title, columns: QUALITY_EXPORT_COLUMNS, rows: qualityRows },
          meta.header,
          meta.fileBase,
        );
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Excel failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setExportBusy(null);
    }
  }, [buildExportHeader, viewData, currentTab, qualityRows, supplierRows, detailRows]);

  // PDF: the current tab's grid as shown (same column defs, so MT and the
  // "n (MT)" lorry cells print exactly as displayed); widget columns dropped.
  const handlePdf = useCallback(async () => {
    const meta = await buildExportHeader();
    if (!viewData || !meta) return;
    setExportBusy("pdf");
    try {
      if (currentTab === "detail") {
        const section: PdfSection<PoGridRow> = {
          title: meta.title,
          columns: detailColumns,
          rows: detailRows,
        };
        await exportPoPositionPdf(section, meta.header, meta.fileBase);
      } else if (currentTab === "supplier") {
        const section: PdfSection<SupplierGridRow> = {
          title: meta.title,
          columns: supplierColumns,
          rows: supplierRows,
          isTotalRow: isGrandTotalRow,
        };
        await exportPoPositionPdf(section, meta.header, meta.fileBase);
      } else {
        const section: PdfSection<QualityGridRow> = {
          title: meta.title,
          columns: qualityColumns,
          rows: qualityRows,
          isTotalRow: isGrandTotalRow,
        };
        await exportPoPositionPdf(section, meta.header, meta.fileBase);
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "PDF failed",
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setExportBusy(null);
    }
  }, [
    buildExportHeader,
    viewData,
    currentTab,
    qualityColumns,
    qualityRows,
    supplierColumns,
    supplierRows,
    detailColumns,
    detailRows,
  ]);

  const caption = ruleCaption(data?.rule);
  const inputSx = { flex: { xs: "1 1 100%", sm: "0 1 170px" } } as const;
  const buttonSx = { flex: { xs: "1 1 45%", sm: "0 0 auto" }, textTransform: "none" } as const;
  const selectedCount = selectedPoIds.size;

  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 3 },
        // Returned lorry-and-weight cell (§11.2): error colour when > 0.
        "& .po-returned-cell": { color: "error.main", fontWeight: 600 },
      }}
    >
      <Typography
        variant="h5"
        sx={{ color: tokens.report.header, fontWeight: "bold", mb: caption ? 0.25 : 1.5 }}
      >
        Outstanding PO Position
      </Typography>
      {caption ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {caption}
        </Typography>
      ) : null}

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              {branches.length > 1 ? (
                <Box sx={{ flex: { xs: "1 1 100%", sm: "0 1 240px" } }}>
                  <SearchableSelect<BranchOption>
                    variant="outlined"
                    size="small"
                    label="Branch"
                    options={branches}
                    value={selectedBranch}
                    onChange={(opt) => setBranchId(opt?.branch_id ?? null)}
                    getOptionLabel={(o) => o.branch_name}
                    getOptionKey={(o) => o.branch_id}
                    isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                    clearable={false}
                    fullWidth
                  />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ flex: { xs: "1 1 100%", sm: "0 1 auto" } }}>
                  <strong>Branch:</strong> {selectedBranch?.branch_name ?? "—"}
                </Typography>
              )}
              <TextField
                type="date"
                label="As on"
                value={asOn}
                onChange={(e) => setAsOn(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={inputSx}
              />
              <Box sx={{ flex: { xs: "1 1 100%", sm: "1 1 220px" }, maxWidth: { sm: 320 } }}>
                <SearchableSelect<SupplierOption>
                  variant="outlined"
                  size="small"
                  label="Supplier"
                  placeholder={hasData ? "All suppliers" : undefined}
                  options={suppliers}
                  value={selectedSupplier}
                  onChange={pickSupplier}
                  getOptionLabel={(o) => o.party_name}
                  getOptionKey={(o) => o.party_name}
                  isOptionEqualToValue={(o, v) => o.party_name === v.party_name}
                  disabled={!hasData}
                  clearable
                  fullWidth
                />
              </Box>
              <Button
                variant="contained"
                disabled={branchId == null || loading}
                onClick={() => void runFetch(branchId)}
                sx={{
                  ...buttonSx,
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                }}
              >
                Submit
              </Button>
              <Button
                variant="outlined"
                disabled={!hasData || exportBusy != null}
                onClick={() => void handleExport()}
                sx={buttonSx}
              >
                {exportBusy === "excel" ? "Excel…" : "Excel"}
              </Button>
              <Button
                variant="outlined"
                disabled={!hasData || exportBusy != null}
                onClick={() => void handlePdf()}
                sx={buttonSx}
              >
                {exportBusy === "pdf" ? "PDF…" : "PDF"}
              </Button>
              {canEdit ? (
                <Tooltip title="Re-run the settlement rule for this branch: POs whose receipts meet it are closed, auto-closed POs that no longer do are reopened.">
                  <span style={{ display: "contents" }}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      disabled={branchId == null || loading || recomputing}
                      onClick={() => void handleRecompute()}
                      sx={buttonSx}
                    >
                      {recomputing ? "Re-evaluating…" : "Re-evaluate"}
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
            </Box>
          </Paper>

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : null}

          {!loading && branchId == null ? (
            <Alert severity="info">Select a branch to view the report.</Alert>
          ) : null}

          {!loading && isEmpty && data ? (
            <Alert severity="info">
              No jute PO has material outstanding as on {data.as_on} for this branch.
            </Alert>
          ) : null}

          {!loading && hasData && viewData ? (
            <>
              <KpiStrip totals={viewData.totals} lorries={kpiLorries} rule={data?.rule} />

              <Tabs
                value={view}
                onChange={(_, v: View) => setView(v)}
                variant="scrollable"
                allowScrollButtonsMobile
                sx={{ mt: 2, mb: 1, borderBottom: 1, borderColor: "divider" }}
              >
                <Tab
                  label={`PO Detail (${visibleDetailRows.length})`}
                  sx={{ textTransform: "none" }}
                />
                <Tab label="By Supplier" sx={{ textTransform: "none" }} />
                <Tab label="By Quality" sx={{ textTransform: "none" }} />
              </Tabs>

              {detailFilter?.kind === "supplier" && view !== DETAIL_TAB ? (
                <Box sx={{ mb: 1 }}>
                  <Chip
                    label={`Supplier: ${detailFilter.label}`}
                    onDelete={() => setDetailFilter(null)}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                </Box>
              ) : null}

              {view === 2 ? (
                <Box sx={{ overflowX: "auto", width: "100%" }}>
                  <ReportGrid
                    rows={qualityRows}
                    columns={qualityColumns}
                    getRowId={(r) => r.id}
                    loading={false}
                    error={null}
                    height={gridHeight(qualityRows.length)}
                    isTotalRow={isGrandTotalRow}
                    onRowDoubleClick={drillToQuality}
                  />
                </Box>
              ) : null}

              {view === 1 ? (
                <Box sx={{ overflowX: "auto", width: "100%" }}>
                  <ReportGrid
                    rows={supplierRows}
                    columns={supplierColumns}
                    getRowId={(r) => r.id}
                    loading={false}
                    error={null}
                    height={gridHeight(supplierRows.length)}
                    isTotalRow={isGrandTotalRow}
                    onRowDoubleClick={drillToSupplier}
                  />
                </Box>
              ) : null}

              {view === DETAIL_TAB ? (
                <>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      flexWrap: "wrap",
                      mb: 1,
                      minHeight: 32,
                    }}
                  >
                    {detailFilter ? (
                      <Chip
                        label={`${detailFilter.kind === "quality" ? "Quality" : "Supplier"}: ${detailFilter.label}`}
                        onDelete={() => setDetailFilter(null)}
                        color="primary"
                        variant="outlined"
                        size="small"
                      />
                    ) : null}
                    {canEdit ? (
                      <>
                        <Box sx={{ flex: "1 1 auto" }} />
                        {selectedCount > 0 ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => setSelectedPoIds(new Set())}
                            sx={{ textTransform: "none" }}
                          >
                            Clear
                          </Button>
                        ) : null}
                        <Button
                          size="small"
                          variant="contained"
                          color="error"
                          disabled={selectedCount === 0 || closing}
                          onClick={onCloseSelected}
                          sx={{ textTransform: "none" }}
                        >
                          Close selected ({selectedCount} PO{selectedCount === 1 ? "" : "s"})
                        </Button>
                      </>
                    ) : null}
                  </Box>
                  <Box sx={{ overflowX: "auto", width: "100%" }}>
                    <ReportGrid
                      rows={visibleDetailRows}
                      columns={detailColumns}
                      getRowId={(r) => r.id}
                      loading={false}
                      error={null}
                      height={gridHeight(visibleDetailRows.length)}
                      sortField="po_date"
                      sortDir="asc"
                      isTotalRow={() => false}
                      getRowClass={detailRowClass}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    One row per PO. Lorry columns read &quot;lorries (MT)&quot;; Returned lorries are
                    not counted as received. Red rows are stale (past due with no receipt for the
                    rule&apos;s stale period), amber rows are merely past their due date.
                    &quot;Settle?&quot; marks POs whose receipts already meet the settlement rule —
                    Re-evaluate closes them. Weights are in whole MT; receipts are counted up to the
                    as-on date by gate-entry date.
                    {canEdit
                      ? " Tick rows to short-close whole POs together, or use Close on a row."
                      : ""}
                  </Typography>
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <ClosePoDialog
        target={closeTarget}
        submitting={closing}
        onCancel={() => setCloseTarget(null)}
        onSubmit={(target, remark) => void handleCloseSubmit(target, remark)}
      />
    </Box>
  );
}

export default function PoOutstandingPositionPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
