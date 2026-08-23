"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  createFilterOptions,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { usePathname } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import ReportGrid from "./ReportGrid";
import { exportRowsToExcel } from "./exportExcel";
import type { BranchOption } from "./types";

/** Options rendered at once by the async picker. MUI's listbox is not
 * virtualized and mounts every filtered option: sls co 2 / br 29 returns 4,861
 * MRs (~4,861 x N DOM nodes) and opening the empty dropdown froze the main
 * thread for seconds. Typing still searches the full list — only the RENDERED
 * count is capped.
 * ponytail: a filter limit, not a virtualized listbox. Swap in
 * react-window/MUI's ListboxComponent only if users need to scroll past 100. */
const ASYNC_OPTION_LIMIT = 100;
const limitAsyncOptions = createFilterOptions<{ value: string; label: string }>(
  { limit: ASYNC_OPTION_LIMIT },
);

/** The filter values handed to the fetcher when the user submits (branch is
 * always set — the fetcher only runs once a branch is selected). */
export interface ReportFilters {
  branchId: number;
  dateFrom: string;
  dateTo: string;
  extra: string;
}

interface ExtraSelect {
  label: string;
  /** Omit for a free-text box instead of a dropdown (e.g. Item Code). */
  options?: { value: string; label: string }[];
}

interface ReportPanelProps<TRow extends GridValidRowModel> {
  title: string;
  branches: BranchOption[];
  initialBranchId: number | null;
  /** "range" = From+To, "single" = one date (bound to dateTo), "none" = no date. */
  dates?: "range" | "single" | "none";
  initialDateFrom?: string;
  initialDateTo?: string;
  fromLabel?: string;
  toLabel?: string;
  singleLabel?: string;
  /** Optional single-select filter (e.g. Receipts/Issues/All). */
  extra?: ExtraSelect;
  /** Optional company/branch-dependent, searchable, clearable picker (e.g. the
   * MR picker). Options reload whenever the company or branch changes (and the
   * selection is cleared with them); the chosen value is carried in the same
   * `filters.extra` string as `extra`. Long lists are capped at
   * ASYNC_OPTION_LIMIT rendered rows — the user types to narrow. */
  extraAsync?: {
    label: string;
    load: (branchId: number) => Promise<{ value: string; label: string }[]>;
  };
  initialExtra?: string;
  /** Fetches the rows for the submitted filters. */
  fetcher: (filters: ReportFilters) => Promise<TRow[]>;
  columns: GridColDef<TRow>[];
  getRowId: (row: TRow) => string | number;
  sortField?: string;
  sortDir?: "asc" | "desc";
  exportName: string;
  /** Optional row drill-down (see ReportGrid); not fired for total rows. */
  onRowDoubleClick?: (row: TRow) => void;
}

/**
 * Filter toolbar (branch + date(s) + optional select + Submit + Export) over a
 * data grid. The report only (re)loads when Submit is clicked — plus one
 * automatic load once a branch is available — so changing filters doesn't fire
 * a request on every keystroke. Export builds an .xlsx from the loaded rows.
 */
export default function ReportPanel<TRow extends GridValidRowModel>({
  title,
  branches,
  initialBranchId,
  dates = "range",
  initialDateFrom = "",
  initialDateTo = "",
  fromLabel = "From Date",
  toLabel = "To Date",
  singleLabel = "Date",
  extra,
  extraAsync,
  initialExtra = "",
  fetcher,
  columns,
  getRowId,
  sortField,
  sortDir,
  exportName,
  onRowDoubleClick,
}: ReportPanelProps<TRow>) {
  // Draft filters — bound to the inputs.
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState<string>(initialDateFrom);
  const [dateTo, setDateTo] = useState<string>(initialDateTo);
  const [extraValue, setExtraValue] = useState<string>(initialExtra);

  const pathname = usePathname();
  const { selectedCompany } = useSidebarContext();

  // The branch list and selection come from the localStorage-backed sidebar
  // context, so the server renders an empty branch and the client renders the
  // saved one. Holding the filters back until mount keeps the first client
  // render identical to the server HTML (same gate as MuiDataGrid).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [rows, setRows] = useState<TRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runFetch = useCallback(async () => {
    if (branchId == null) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetcher({ branchId, dateFrom, dateTo, extra: extraValue }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo, extraValue, fetcher]);

  // One automatic load once a branch is available; afterwards only on Submit.
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current && branchId != null) {
      didInit.current = true;
      void runFetch();
    }
  }, [branchId, runFetch]);

  // Branch-dependent picker options. The loader is held in a ref so pages can
  // pass an inline `extraAsync={{...}}` object without re-firing the effect.
  const [asyncOptions, setAsyncOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const loadExtra = useRef(extraAsync?.load);
  loadExtra.current = extraAsync?.load;
  // Keyed on company AND branch: a deep link can mount with the branch already
  // resolved from the URL while selectedCompany is still null (the page's
  // loader then returns []), and switching company in the sidebar leaves the
  // branch untouched — both left the picker showing the wrong list forever.
  const loadedKey = useRef<string | null>(null);
  const coId = selectedCompany?.co_id ?? null;
  useEffect(() => {
    const load = loadExtra.current;
    if (!load || branchId == null) return;
    const key = `${coId}:${branchId}`;
    // A different company or branch invalidates the current selection.
    if (loadedKey.current !== null && loadedKey.current !== key) {
      setExtraValue("");
    }
    loadedKey.current = key;
    let alive = true;
    void load(branchId)
      .then((opts) => {
        if (alive) setAsyncOptions(opts);
      })
      // ponytail: a failed option load just empties the picker — the report
      // itself still runs (cleared picker == all MRs).
      .catch(() => {
        if (alive) setAsyncOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [branchId, coId]);

  const branch = branches.find((b) => b.branch_id === branchId) ?? null;

  // Company / branch / report / period block written above the column headers
  // in the exported sheet.
  const handleExport = useCallback(async () => {
    const reportFor =
      dates === "range"
        ? [dateFrom, dateTo].filter(Boolean).join(" To ")
        : dates === "single"
          ? dateTo
          : "";
    await exportRowsToExcel(columns, rows, exportName, {
      companyName: selectedCompany?.co_name,
      branchName: branch?.branch_name,
      reportName: title,
      reportNo: await resolveReportMenuId(pathname),
      reportFor,
    });
  }, [
    dates,
    dateFrom,
    dateTo,
    columns,
    rows,
    exportName,
    selectedCompany?.co_name,
    branch?.branch_name,
    title,
    pathname,
  ]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}
      >
        {title}
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              <Autocomplete
                options={branches}
                getOptionLabel={(option) => option.branch_name}
                isOptionEqualToValue={(option, value) =>
                  option.branch_id === value.branch_id
                }
                value={branch}
                onChange={(_, newValue) =>
                  setBranchId(newValue?.branch_id ?? null)
                }
                renderInput={(params) => (
                  <TextField {...params} label="Branch" size="small" />
                )}
                sx={{ minWidth: 240 }}
              />

              {dates === "range" && (
                <>
                  <TextField
                    type="date"
                    label={fromLabel}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ width: 170 }}
                  />
                  <TextField
                    type="date"
                    label={toLabel}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ width: 170 }}
                  />
                </>
              )}

              {dates === "single" && (
                <TextField
                  type="date"
                  label={singleLabel}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 180 }}
                />
              )}

              {extra && !extra.options && (
                <TextField
                  label={extra.label}
                  value={extraValue}
                  onChange={(e) => setExtraValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runFetch();
                  }}
                  size="small"
                  sx={{ width: 170 }}
                />
              )}

              {extra?.options && (
                // Type-to-filter like every other dropdown; the filter value
                // stays the option's `value` string in `extraValue`.
                <Box sx={{ minWidth: 150 }}>
                  <SearchableSelect<{ value: string; label: string }>
                    variant="outlined"
                    label={extra.label}
                    options={extra.options}
                    value={
                      extra.options.find((o) => o.value === extraValue) ?? null
                    }
                    onChange={(option) => setExtraValue(option?.value ?? "")}
                    getOptionLabel={(o) => o.label}
                    getOptionKey={(o) => o.value}
                    isOptionEqualToValue={(o, v) => o.value === v.value}
                    clearable={false}
                  />
                </Box>
              )}

              {extraAsync && (
                <Autocomplete
                  options={asyncOptions}
                  filterOptions={limitAsyncOptions}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(o, v) => o.value === v.value}
                  value={
                    asyncOptions.find((o) => o.value === extraValue) ?? null
                  }
                  onChange={(_, newValue) =>
                    setExtraValue(newValue?.value ?? "")
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={extraAsync.label}
                      size="small"
                      // Without this, a capped list reads as "my MR isn't there".
                      helperText={
                        asyncOptions.length > ASYNC_OPTION_LIMIT
                          ? `Type to search — max ${ASYNC_OPTION_LIMIT} of ${asyncOptions.length} shown`
                          : undefined
                      }
                    />
                  )}
                  sx={{ minWidth: 300 }}
                />
              )}

              <Button
                variant="contained"
                disabled={branchId == null || loading}
                onClick={() => {
                  void runFetch();
                }}
                sx={{
                  backgroundColor: "#0C3C60",
                  "&:hover": { backgroundColor: "#092d47" },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>

              <Button
                variant="outlined"
                // branchId == null: ReportGrid has already swapped the grid for
                // "Select a branch", but `rows` still holds the previous
                // branch's data — exporting it would write a sheet with no
                // Branch line in the header over another branch's rows.
                disabled={branchId == null || rows.length === 0}
                onClick={() => {
                  void handleExport();
                }}
                sx={{ textTransform: "none" }}
              >
                Export to Excel
              </Button>
            </Box>
          </Paper>

          <ReportGrid
            rows={rows}
            columns={columns}
            getRowId={getRowId}
            loading={loading}
            error={error}
            branchId={branchId}
            sortField={sortField}
            sortDir={sortDir}
            onRowDoubleClick={onRowDoubleClick}
          />
        </>
      )}
    </Box>
  );
}
