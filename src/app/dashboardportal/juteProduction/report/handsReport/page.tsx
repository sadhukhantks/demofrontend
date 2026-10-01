"use client";

/**
 * Hands Report — actual manning against the norms, per designation.
 *
 * Port of the legacy MIS "Daily Hands Comparison". The four views (Detailed /
 * By Date / By Occupation / By Department) are grains of the same detail grid
 * and are rolled up server-side, so switching the view refetches rather than
 * regrouping here: two code paths computing the same totals is exactly how the
 * legacy sheets ended up disagreeing with each other.
 *
 * The shift-wise columns are a client-side toggle only — the endpoint always
 * returns them, and hiding them is a reading preference, not a different query.
 *
 * MTD Actual / Target / Excess / Short (TKT-000154) come from the endpoint too:
 * month-to-date as at the To Date on the rollup views, a running figure up to
 * each row's date on Detailed and By Date.
 *
 * Two tabs share the branch, the dates and the department: "Manning" (the four
 * views above) and "Machines Worked" — the machine-wise sheet behind the machine
 * targets, same endpoint with `view=machines_run`, drawn by
 * `_components/MachinesWorkedTab`. Each tab keeps its own loaded response, so
 * going back to a tab whose filters have not changed shows it without a
 * refetch; a tab whose data is for other dates reloads when it is opened.
 *
 * Machines Worked also takes manual additions and exclusions (spec §12 of the
 * hands-norms-v2 spec): this page does the saving for the tab — the override
 * POSTs, the toast, the reload of the tab for the filters it was loaded with —
 * and marks Manning stale, because its machine targets are computed off the
 * same machines; Manning then refetches the next time it is opened.
 *
 * Detailed (TKT-000167) is ordered date -> department -> occupation, with a
 * Total line under each department and each date. Those totals are rolled up
 * server-side like every other figure; the page only places them (toggle:
 * "Department & day totals"), and they go into the Excel export as shown.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { fmtNum, numCol } from "@/components/reports/ReportGrid";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { currentMonthRange } from "@/components/reports/reportDates";
import { exportRowsToExcel, type ReportExportHeader } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import type { BranchOption } from "@/components/reports/types";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { toast } from "@/hooks/use-toast";
import { tokens } from "@/styles/tokens";
import FilterSlot from "./_components/FilterSlot";
import MachinesWorkedTab, { type MachineOverrideControls } from "./_components/MachinesWorkedTab";
import {
  buildOverridePayload,
  buildUndoPayload,
  fetchBranchMachines,
  fetchHandsReport,
  isMachineRunRow,
  MACHINES_VIEW,
  MACHINES_VIEW_LABEL,
  MANNING_VIEWS,
  NO_MACHINE_FILTERS,
  NORM_KIND_NAMES,
  normKindLabel,
  normKindOf,
  saveMachineOverride,
  undoMachineOverride,
  withDetailedTotals,
  type BranchMachine,
  type HandsReport,
  type HandsReportFilters,
  type HandsRow,
  type MachineFilters,
  type MachineOverrideForm,
  type MachineRunRow,
  type ManningView,
} from "./_service";

const TITLE = "Hands Report";

/** Short hours above this are called out in red. Zero means any shortfall at
 * all is flagged; raise it if rounding noise starts crying wolf. The sibling
 * low-producer reports flag efficiency under 75% — a manning report has no
 * efficiency, so the shortfall is what gets the same treatment. */
const SHORT_RED_ABOVE = 0;

const DIRECT_INDIRECT = [
  { value: "D", label: "Direct" },
  { value: "I", label: "Indirect" },
];

/** Manning row plus a grid key — the endpoint returns no row id, and the
 * natural key differs per view (date / designation / dept), with the GRAND
 * TOTAL line having none at all. */
type Row = HandsRow & { row_id: number };

type TabKey = "manning" | "machines";

/** What one tab has loaded. `deptFiltered` records that the response was
 * pulled with a department filter — its rows are then a subset of the window
 * the `meta` machine counts describe. */
interface TabData {
  report: HandsReport | null;
  loading: boolean;
  error: string | null;
  deptFiltered: boolean;
}

const EMPTY_TAB: Readonly<TabData> = Object.freeze({
  report: null,
  loading: false,
  error: null,
  deptFiltered: false,
});

/** A request a tab's loaded response answers: its filters, and the key they
 * make (see `requestKey`). Kept so the tab can be reloaded exactly as loaded. */
interface LoadedRequest {
  key: string;
  filters: HandsReportFilters;
}

/** The branch machines of the Add machines picker, loaded on first use. */
interface BranchMachinesData {
  list: ReadonlyArray<BranchMachine>;
  loading: boolean;
  error: string | null;
}

const NO_BRANCH_MACHINES: Readonly<BranchMachinesData> = Object.freeze({
  list: Object.freeze([]),
  loading: false,
  error: null,
});

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/** Hours short of the norm, called out in red. Never fired on a null target
 * (norm unresolved) — a blank cell there is the honest answer. */
function shortCol(field: "short" | "mtd_short" = "short", header = "Short"): GridColDef<Row> {
  return {
    ...numCol<Row>(field, header, 100),
    renderCell: (params) => {
      const n = Number(params.value);
      if (params.value == null || !Number.isFinite(n)) return "";
      return (
        <Box
          component="span"
          sx={n > SHORT_RED_ABOVE ? { color: "error.main", fontWeight: 600 } : undefined}
        >
          {fmtNum(n)}
        </Box>
      );
    },
  };
}

const shiftCols: GridColDef<Row>[] = [
  numCol("shift_a", "Shift A", 95),
  numCol("shift_b", "Shift B", 95),
  numCol("shift_c", "Shift C", 95),
  numCol("shift_g", "Shift G", 95),
  numCol("target_a", "Target A", 100),
  numCol("target_b", "Target B", 100),
  numCol("target_c", "Target C", 100),
  numCol("target_g", "Target G", 100),
];

const totalCols: GridColDef<Row>[] = [
  numCol("total_actual", "Total Actual", 120),
  numCol("total_target", "Total Target", 120),
  numCol("excess", "Excess", 100),
  shortCol(),
];

/** Month-to-date block, after the day/window totals on every manning view. */
const mtdCols: GridColDef<Row>[] = [
  numCol("mtd_actual", "MTD Actual", 110),
  numCol("mtd_target", "MTD Target", 110),
  numCol("mtd_excess", "MTD Excess", 110),
  shortCol("mtd_short", "MTD Short"),
];

const dateCol: GridColDef<Row> = { field: "date", headerName: "Date", width: 110 };

const deptCol: GridColDef<Row> = {
  field: "dept",
  headerName: "Department",
  flex: 1,
  minWidth: 160,
};
/** "Occupation" is what the shed calls it; designation is the master's name. */
const desigCols: GridColDef<Row>[] = [
  { field: "designation", headerName: "Occupation", flex: 1, minWidth: 170 },
  { field: "direct_indirect", headerName: "D/I", width: 70 },
  {
    // Hands Norms v2 kind: F fixed, M machine-based, P production-based,
    // N no norm (blank target), A as actual. Legacy V/F rows read as M/F.
    field: "norm_kind",
    headerName: "Kind",
    width: 70,
    description: "F Fixed · M Machine-based · P Production-based · N No norm · A As actual",
    valueGetter: (_v, row) => normKindLabel(row),
    renderCell: (params) => {
      const kind = normKindOf(params.row);
      return kind ? (
        <Tooltip title={NORM_KIND_NAMES[kind]}>
          <span>{kind}</span>
        </Tooltip>
      ) : (
        ""
      );
    },
  },
  { field: "norms_text", headerName: "Norms", flex: 1, minWidth: 140 },
];

/** by_date carries its own direct/indirect split of the day's hands. */
const splitCols: GridColDef<Row>[] = [
  numCol("direct_actual", "Direct Actual", 125),
  numCol("direct_target", "Direct Target", 125),
  numCol("indirect_actual", "Indirect Actual", 130),
  numCol("indirect_target", "Indirect Target", 135),
  numCol("unclassified_actual", "Unclassified Actual", 150),
  numCol("unclassified_target", "Unclassified Target", 155),
];

/** Identity columns differ per view; the numeric block is the same throughout. */
function buildColumns(view: ManningView, showShiftDetail: boolean): GridColDef<Row>[] {
  const lead: GridColDef<Row>[] =
    view === "detailed"
      ? [dateCol, deptCol, ...desigCols]
      : view === "by_date"
        ? [dateCol]
        : view === "by_occupation"
          ? [deptCol, ...desigCols]
          : [deptCol];
  return [
    ...lead,
    ...(showShiftDetail ? shiftCols : []),
    ...totalCols,
    ...mtdCols,
    ...(view === "by_date" ? splitCols : []),
  ];
}

interface DeptOption {
  dept_id: number;
  dept: string;
}

/** The departments present in the loaded rows — no separate master fetch, and
 * no options for departments nobody in this branch worked in. by_date rows
 * carry no department, so its response simply contributes nothing. */
function deptsOf(rows: Array<HandsRow | MachineRunRow>): DeptOption[] {
  const seen = new Map<number, string>();
  for (const r of rows) {
    if (r.dept_id != null && !seen.has(r.dept_id)) {
      seen.set(r.dept_id, r.dept ?? String(r.dept_id));
    }
  }
  return [...seen]
    .map(([dept_id, dept]) => ({ dept_id, dept }))
    .sort((a, b) => a.dept.localeCompare(b.dept));
}

/** Date inputs: two per line on a phone, fixed width from `sm` up. */
const dateFieldSx = { width: { xs: "calc(50% - 8px)", sm: 170 } };

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } = useReportBranches();
  // Branch/date seed from the localStorage-backed sidebar context, so the
  // server HTML and the first client render disagree unless the filters are
  // held back until mount.
  const mounted = useMounted();
  const pathname = usePathname();
  // Manual additions / exclusions on Machines Worked need edit on this menu
  // (and the backend's own `meta.can_edit`, which the tab checks).
  const { hasMenuAccess } = useSidebarContext();
  const menuEdit = hasMenuAccess(pathname, "edit");
  const month = currentMonthRange();

  const [tab, setTab] = useState<TabKey>("manning");
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(dateParam || month.to);
  const [view, setView] = useState<ManningView>("detailed");
  const [deptId, setDeptId] = useState("");
  const [directIndirect, setDirectIndirect] = useState("");
  const [showShiftDetail, setShowShiftDetail] = useState(false);
  // Detailed view: department subtotals + day totals (TKT-000167). On by
  // default; off gives the flat one-row-per-occupation list for pivoting.
  const [showTotals, setShowTotals] = useState(true);

  const [manning, setManning] = useState<TabData>(EMPTY_TAB);
  const [machines, setMachines] = useState<TabData>(EMPTY_TAB);
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([]);
  // Machines Worked's client-side filters live here, not in the tab, so they
  // are still set when the user comes back from Manning.
  const [machineFilters, setMachineFilters] = useState<MachineFilters>(NO_MACHINE_FILTERS);
  const [branchMachines, setBranchMachines] = useState<BranchMachinesData>(NO_BRANCH_MACHINES);

  const didInit = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);
  // Per tab: the request its loaded response answers (so reopening a tab whose
  // filters are unchanged does not refetch), and a counter that lets a slow
  // response be dropped when a newer request for the same tab has gone out.
  const loadedKey = useRef<Record<TabKey, string | null>>({ manning: null, machines: null });
  const requestSeq = useRef<Record<TabKey, number>>({ manning: 0, machines: 0 });
  // What each tab's loaded response was asked for — the filter inputs may have
  // been edited since without a Submit, and a reload after a manual change must
  // bring back the same window, not whatever is typed in the inputs now.
  const loadedRequest = useRef<Record<TabKey, LoadedRequest | null>>({ manning: null, machines: null });
  // Bumped by every manual change. A Manning response that was requested before
  // the change is shown but not recorded as current, so Manning still refetches.
  const manningEpoch = useRef(0);
  // "<co>|<branch>" the branch machines are loaded (or loading) for.
  const branchMachinesKey = useRef<string | null>(null);

  /** Everything that decides a tab's response. Machines have no
   * direct/indirect side, so that filter is not part of their key. */
  const requestKey = useCallback(
    (target: TabKey, manningView: ManningView) =>
      (target === "machines"
        ? [coId, branchId, dateFrom, dateTo, MACHINES_VIEW, deptId]
        : [coId, branchId, dateFrom, dateTo, manningView, deptId, directIndirect]
      ).join("|"),
    [coId, branchId, dateFrom, dateTo, deptId, directIndirect],
  );

  /** Loads a tab: for the current filter inputs, or — `reload` — again for the
   * request its loaded response answers. */
  const runFetch = useCallback(
    async (target: TabKey, manningView: ManningView, reload?: LoadedRequest) => {
      let request = reload;
      if (!request) {
        if (coId == null || branchId == null || !dateFrom || !dateTo) return;
        request = {
          key: requestKey(target, manningView),
          filters: {
            coId,
            branchId,
            dateFrom,
            dateTo,
            view: target === "machines" ? MACHINES_VIEW : manningView,
            deptId,
            directIndirect,
          },
        };
      }
      const { key, filters } = request;
      const filteredDept = (filters.deptId ?? "").trim();
      const setData = target === "machines" ? setMachines : setManning;
      const seq = ++requestSeq.current[target];
      const epoch = manningEpoch.current;
      setData((d) => ({ ...d, loading: true, error: null }));
      try {
        const res = await fetchHandsReport(filters);
        if (seq !== requestSeq.current[target]) return;
        loadedKey.current[target] =
          target === "manning" && epoch !== manningEpoch.current ? null : key;
        loadedRequest.current[target] = request;
        setData({ report: res, loading: false, error: null, deptFiltered: Boolean(filteredDept) });
        // Only an unfiltered pull carries every department of the range —
        // refreshing the options from a filtered one would strand the user on
        // the department they just picked. by_date rows have no department, so
        // its (empty) list is ignored rather than clearing the options.
        if (!filteredDept) {
          const found = deptsOf(res.rows);
          if (found.length) setDeptOptions(found);
        }
      } catch (err: unknown) {
        if (seq !== requestSeq.current[target]) return;
        loadedKey.current[target] = null;
        loadedRequest.current[target] = null;
        setData({
          report: null,
          loading: false,
          error: errorText(err, "Failed to load the report"),
          deptFiltered: false,
        });
      }
    },
    [coId, branchId, dateFrom, dateTo, deptId, directIndirect, requestKey],
  );

  // Seed the branch ONCE when the sidebar context resolves; the user owns it after that.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: both tabs' loaded reports, the branch and the
  // department list all belong to the old company — drop them rather than show
  // them mislabeled (and let any response still in flight for it be ignored).
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      requestSeq.current.manning += 1;
      requestSeq.current.machines += 1;
      loadedKey.current = { manning: null, machines: null };
      loadedRequest.current = { manning: null, machines: null };
      branchMachinesKey.current = null;
      setManning(EMPTY_TAB);
      setMachines(EMPTY_TAB);
      setMachineFilters(NO_MACHINE_FILTERS);
      setBranchMachines(NO_BRANCH_MACHINES);
      setDeptOptions([]);
      setDeptId("");
      setBranchId(null);
      branchSeeded.current = false;
      didInit.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load of the open tab once company + branch are known;
  // afterwards only Submit, a view switch (a different grain of the same
  // report) or opening a tab whose data is not for the current filters.
  useEffect(() => {
    if (!didInit.current && coId != null && branchId != null) {
      didInit.current = true;
      void runFetch(tab, view);
    }
  }, [coId, branchId, tab, view, runFetch]);

  const onViewChange = (next: ManningView) => {
    setView(next);
    if (didInit.current) void runFetch("manning", next);
  };

  const onTabChange = (next: TabKey) => {
    setTab(next);
    if (didInit.current && loadedKey.current[next] !== requestKey(next, view)) {
      void runFetch(next, view);
    }
  };

  // ---- Machines Worked: manual additions / exclusions (spec §12) ----

  /** The branch machines for the Add machines picker — fetched the first time
   * the dialog opens for the loaded branch, then reused. A failed load is
   * retried on the next open. */
  const loadBranchMachines = useCallback(async () => {
    const loaded = loadedRequest.current.machines;
    if (!loaded) return;
    const { coId: co, branchId: br } = loaded.filters;
    const key = `${co}|${br}`;
    if (branchMachinesKey.current === key) return;
    branchMachinesKey.current = key;
    setBranchMachines({ list: [], loading: true, error: null });
    try {
      const list = await fetchBranchMachines(co, br);
      if (branchMachinesKey.current !== key) return;
      setBranchMachines({ list, loading: false, error: null });
    } catch (err: unknown) {
      if (branchMachinesKey.current !== key) return;
      branchMachinesKey.current = null;
      setBranchMachines({
        list: [],
        loading: false,
        error: errorText(err, "Could not load the branch machines"),
      });
    }
  }, []);

  /** After a manual change: Machines Worked reloads now, for the window it was
   * loaded with; Manning's targets moved too, so it refetches when next opened. */
  const afterMachineChange = useCallback(
    (loaded: LoadedRequest) => {
      manningEpoch.current += 1;
      loadedKey.current.manning = null;
      void runFetch("machines", view, loaded);
    },
    [runFetch, view],
  );

  const saveOverride = useCallback(
    async (form: MachineOverrideForm): Promise<boolean> => {
      const loaded = loadedRequest.current.machines;
      if (!loaded) return false;
      try {
        const saved = await saveMachineOverride(
          buildOverridePayload(loaded.filters.coId, loaded.filters.branchId, form),
        );
        const what = `${saved} machine${saved === 1 ? "" : "s"}`;
        toast({
          title: form.action === "ADD" ? "Counted as worked" : "Excluded",
          description:
            form.action === "ADD"
              ? `${what} added for ${form.tran_date}, shift ${form.shift}.`
              : `${what} excluded for ${form.tran_date}, shift ${form.shift}.`,
        });
        afterMachineChange(loaded);
        return true;
      } catch (err: unknown) {
        toast({
          variant: "destructive",
          title: "Could not save",
          description: errorText(err, "The change was not saved"),
        });
        return false;
      }
    },
    [afterMachineChange],
  );

  const undoOverride = useCallback(
    async (overrideId: number): Promise<boolean> => {
      const loaded = loadedRequest.current.machines;
      if (!loaded) return false;
      try {
        await undoMachineOverride(
          buildUndoPayload(loaded.filters.coId, loaded.filters.branchId, [overrideId]),
        );
        toast({ title: "Undone", description: "The machine is back to what the entries say." });
        afterMachineChange(loaded);
        return true;
      } catch (err: unknown) {
        toast({
          variant: "destructive",
          title: "Could not undo",
          description: errorText(err, "The change was not undone"),
        });
        return false;
      }
    },
    [afterMachineChange],
  );

  const overrideControls: MachineOverrideControls = useMemo(
    () => ({
      menuEdit,
      machines: branchMachines.list,
      machinesLoading: branchMachines.loading,
      machinesError: branchMachines.error,
      onLoadMachines: () => void loadBranchMachines(),
      onSave: saveOverride,
      onUndo: undoOverride,
    }),
    [menuEdit, branchMachines, loadBranchMachines, saveOverride, undoOverride],
  );

  const branch: BranchOption | null = branches.find((b) => b.branch_id === branchId) ?? null;
  const report = manning.report;

  // The GRAND TOTAL line rides at the end of the rows (by_department only);
  // ReportGrid picks it up by its "GRAND TOTAL" text and styles it as a total.
  // On Detailed the server's department / day totals are slotted in under their
  // rows (placement only — the figures are the server's).
  const rows: Row[] = useMemo(() => {
    const base = (report?.rows ?? []).filter((r): r is HandsRow => !isMachineRunRow(r));
    let all: HandsRow[] = report?.grand_total ? [...base, report.grand_total] : base;
    if (report?.view === "detailed" && showTotals) {
      all = withDetailedTotals(base, report.dept_totals ?? [], report.day_totals ?? []);
    }
    return all.map((r, i) => ({ ...r, row_id: i }));
  }, [report, showTotals]);

  // Columns follow the LOADED view, not the selector: mid-fetch the selector is
  // already on the next view while the grid still holds the previous view's
  // rows, and columns for fields those rows lack would render a page of blanks.
  const loadedView: ManningView = report && report.view !== MACHINES_VIEW ? report.view : view;
  const columns = useMemo(
    () => buildColumns(loadedView, showShiftDetail),
    [loadedView, showShiftDetail],
  );

  /** Excel header of a tab's sheet; the period is the one its data was loaded for. */
  const exportHeader = (loaded: HandsReport | null, viewLabel: string): ReportExportHeader => ({
    companyName,
    branchName: branch?.branch_name,
    reportName: `${TITLE} — ${viewLabel}`,
    reportFor: [loaded?.meta?.date_from ?? dateFrom, loaded?.meta?.date_to ?? dateTo]
      .filter(Boolean)
      .join(" To "),
  });
  const header = exportHeader(
    report,
    MANNING_VIEWS.find((v) => v.value === loadedView)?.label ?? loadedView,
  );
  const resolveReportNo = useCallback(() => resolveReportMenuId(pathname), [pathname]);

  const meta = report?.meta;
  const manningTab = tab === "manning";
  const loading = manningTab ? manning.loading : machines.loading;

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
      <Typography variant="h5" sx={{ color: tokens.report.header, fontWeight: "bold", mb: 1 }}>
        {TITLE}
      </Typography>

      {mounted && (
        <>
          <Tabs
            value={tab}
            onChange={(_, next: TabKey) => onTabChange(next)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab value="manning" label="Manning" sx={{ textTransform: "none" }} />
            <Tab value="machines" label={MACHINES_VIEW_LABEL} sx={{ textTransform: "none" }} />
          </Tabs>

          {/* Branch, dates and department are shared by both tabs; the rest of
              the bar belongs to Manning. */}
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              {/* Norm: the picker only when more than one branch is in scope. */}
              {branches.length > 1 ? (
                <Box sx={{ width: { xs: "100%", sm: 220 } }}>
                  <SearchableSelect<BranchOption>
                    variant="outlined"
                    size="small"
                    label="Branch"
                    options={branches}
                    value={branch}
                    onChange={(opt) => setBranchId(opt?.branch_id ?? null)}
                    getOptionLabel={(o) => o.branch_name}
                    getOptionKey={(o) => o.branch_id}
                    isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                  />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ width: { xs: "100%", sm: "auto" }, minWidth: 160 }}>
                  <strong>Branch:</strong> {branch?.branch_name ?? "—"}
                </Typography>
              )}
              <TextField
                type="date"
                label="From Date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={dateFieldSx}
              />
              <TextField
                type="date"
                label="To Date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={dateFieldSx}
              />
              {manningTab && (
                <FilterSlot width={190}>
                  <SearchableOptionSelect<ManningView>
                    label="View"
                    size="small"
                    clearable={false}
                    options={MANNING_VIEWS}
                    value={view}
                    onChange={(v) => {
                      if (v !== "") onViewChange(v);
                    }}
                    fullWidth
                  />
                </FilterSlot>
              )}
              <FilterSlot width={220}>
                <SearchableOptionSelect<string>
                  label="Department"
                  size="small"
                  placeholder="All"
                  options={deptOptions.map((o) => ({ value: String(o.dept_id), label: o.dept }))}
                  value={deptId}
                  onChange={(v) => setDeptId(v)}
                  fullWidth
                />
              </FilterSlot>
              {/* Machines have no direct/indirect side and no target columns,
                  so these controls and the manning export stay on Manning. */}
              {manningTab && (
                <>
                  <FilterSlot width={170}>
                    <SearchableOptionSelect<string>
                      label="Direct / Indirect"
                      size="small"
                      placeholder="All"
                      options={DIRECT_INDIRECT}
                      value={directIndirect}
                      onChange={(v) => setDirectIndirect(v)}
                      fullWidth
                    />
                  </FilterSlot>
                  {/* Purely a reading preference — the endpoint always returns the
                      shift columns, so this never refetches. */}
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={showShiftDetail}
                        onChange={(e) => setShowShiftDetail(e.target.checked)}
                      />
                    }
                    label="Show shift-wise detail"
                  />
                  {/* Also a reading preference: the totals always come back
                      with the Detailed view, this only shows or hides them. */}
                  {view === "detailed" && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={showTotals}
                          onChange={(e) => setShowTotals(e.target.checked)}
                        />
                      }
                      label="Department & day totals"
                    />
                  )}
                </>
              )}
              <Box sx={{ flexGrow: 1 }} />
              {manningTab && (
                <Button
                  variant="outlined"
                  size="small"
                  disabled={branchId == null || rows.length === 0}
                  onClick={() => {
                    void (async () => {
                      await exportRowsToExcel(columns, rows, "hands-report", {
                        ...header,
                        reportNo: await resolveReportNo(),
                      });
                    })();
                  }}
                  sx={{ textTransform: "none" }}
                >
                  Export to Excel
                </Button>
              )}
              <Button
                variant="contained"
                disabled={branchId == null || coId == null || loading}
                onClick={() => void runFetch(tab, view)}
                sx={{
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>
            </Box>
          </Paper>

          {manningTab ? (
            <>
              {meta ? (
                <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" sx={{ mb: 1.5, px: 0.5 }}>
                  <Typography variant="body2">
                    <strong>Total actual hands:</strong> {fmtNum(meta.total_actual) || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Total target hands:</strong> {fmtNum(meta.total_target) || "—"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Excess:</strong> {fmtNum(meta.total_excess) || "—"}
                  </Typography>
                  <Typography variant="body2" color="error.main">
                    <strong>Short:</strong> {fmtNum(meta.total_short) || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>MTD actual{meta.mtd_from ? ` (from ${meta.mtd_from})` : ""}:</strong>{" "}
                    {fmtNum(meta.mtd_actual) || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>MTD target:</strong> {fmtNum(meta.mtd_target) || "—"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <strong>MTD excess:</strong> {fmtNum(meta.mtd_excess) || "—"}
                  </Typography>
                  <Typography variant="body2" color="error.main">
                    <strong>MTD short:</strong> {fmtNum(meta.mtd_short) || "—"}
                  </Typography>
                </Stack>
              ) : null}

              {meta?.notes?.length ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {meta.notes.join(" · ")}
                </Alert>
              ) : null}

              <ReportGrid
                rows={rows}
                columns={columns}
                getRowId={(r) => r.row_id}
                loading={manning.loading}
                error={manning.error}
                branchId={branchId}
              />
            </>
          ) : (
            <MachinesWorkedTab
              report={machines.report}
              loading={machines.loading}
              error={machines.error}
              branchId={branchId}
              filters={machineFilters}
              onFiltersChange={setMachineFilters}
              exportHeader={exportHeader(machines.report, MACHINES_VIEW_LABEL)}
              resolveReportNo={resolveReportNo}
              countsFromMeta={!machines.deptFiltered}
              overrides={overrideControls}
            />
          )}
        </>
      )}
    </Box>
  );
}

export default function HandsReportPage() {
  // useReportBranches() reads useSearchParams() — `next build` fails without
  // a Suspense boundary above it.
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
