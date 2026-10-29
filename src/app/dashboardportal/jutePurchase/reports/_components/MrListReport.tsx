"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { useMrListReport } from "../hooks/useMrListReport";
import type { BranchOption, MrListReportRow } from "../types/reportTypes";
import {
  fetchJuteTallyDownload,
  fetchMrListStatuses,
  type MrListStatusOption,
} from "@/utils/juteReportService";
import { saveAs } from "file-saver";
import { usePathname } from "next/navigation";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import {
  MR_LIST_DEFAULT_STATUS_IDS,
  mrListListedDate,
  mrListStatusLabel,
} from "./mrListRows";

interface MrListReportProps {
  coId: number | null;
  companyName?: string | null;
  branches: BranchOption[];
}

/** Returns {from, to} as YYYY-MM-DD for the first and last day of the current month. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const fmt = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  return { from: fmt(first), to: fmt(last) };
}

function fmtNum(value: unknown): string {
  if (value == null) return "";
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

const baseColumns: GridColDef<MrListReportRow>[] = [
  { field: "mr_number", headerName: "MR #", width: 140 },
  { field: "jute_mr_date", headerName: "MR Date", width: 110 },
  { field: "party_name", headerName: "Party", flex: 1, minWidth: 180 },
  { field: "branch_name", headerName: "Branch", width: 160 },
  { field: "vehicle_no", headerName: "Vehicle", width: 130 },
  { field: "challan_no", headerName: "Challan #", width: 130 },
  {
    field: "gross_weight",
    headerName: "Gross Wt",
    type: "number",
    width: 120,
    valueFormatter: (value: unknown) => fmtNum(value),
  },
  {
    field: "net_weight",
    headerName: "Net Wt",
    type: "number",
    width: 120,
    valueFormatter: (value: unknown) => fmtNum(value),
  },
  {
    field: "actual_weight",
    headerName: "Actual Wt",
    type: "number",
    width: 120,
    valueFormatter: (value: unknown) => fmtNum(value),
  },
  {
    field: "net_total",
    headerName: "Net Total",
    type: "number",
    width: 130,
    valueFormatter: (value: unknown) => fmtNum(value),
  },
  {
    field: "status_name",
    headerName: "Status",
    width: 150,
    valueGetter: (_value: unknown, row: MrListReportRow) => mrListStatusLabel(row),
  },
];

/** Gate-entry columns: an MR that is Open or out on a transfer chain has no MR date yet. */
const gateEntryColumns: GridColDef<MrListReportRow>[] = [
  { field: "jute_gate_entry_no", headerName: "GE #", type: "number", width: 90 },
  { field: "jute_gate_entry_date", headerName: "GE Date", width: 110 },
  {
    field: "listed_date",
    headerName: "Listed On",
    width: 110,
    valueGetter: (_value: unknown, row: MrListReportRow) => mrListListedDate(row),
  },
];

const [mrNumberCol, mrDateCol, ...restCols] = baseColumns;
const columns: GridColDef<MrListReportRow>[] = [mrNumberCol, mrDateCol, ...gateEntryColumns, ...restCols];

export default function MrListReport({ coId, companyName, branches }: MrListReportProps) {
  const pathname = usePathname();
  const initialRange = useMemo(() => currentMonthRange(), []);

  const [fromDate, setFromDate] = useState<string>(initialRange.from);
  const [toDate, setToDate] = useState<string>(initialRange.to);
  const [branch, setBranch] = useState<BranchOption | null>(null);
  const [statusIds, setStatusIds] = useState<number[]>([...MR_LIST_DEFAULT_STATUS_IDS]);
  const [statusOptions, setStatusOptions] = useState<MrListStatusOption[]>([]);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [tallyError, setTallyError] = useState<string | null>(null);
  const [tallySuccess, setTallySuccess] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const { rows, loading, error, loadReport } = useMrListReport();

  // Status options differ per tenant, so they come from the company's MRs.
  useEffect(() => {
    if (coId == null) return;
    let cancelled = false;
    fetchMrListStatuses(coId)
      .then((opts) => !cancelled && setStatusOptions(opts))
      .catch(() => !cancelled && setStatusOptions([]));
    return () => {
      cancelled = true;
    };
  }, [coId]);

  const handleLoad = useCallback(() => {
    if (coId == null) return;
    loadReport({
      coId,
      branchId: branch?.branch_id ?? null,
      dateFrom: fromDate,
      dateTo: toDate,
      statusIds,
      // ponytail: backend pages at 50 by default and silently dropped the rest;
      // 10000 is its max — add server paging if one range ever exceeds it.
      limit: 10000,
    });
  }, [coId, branch, fromDate, toDate, statusIds, loadReport]);

  const handleTallyDownload = useCallback(async () => {
    if (coId == null) return;
    if (!fromDate || !toDate) {
      setSnackbar("From and To dates are required.");
      return;
    }
    setDownloading(true);
    setTallyError(null);
    setTallySuccess(null);
    try {
      const blob = await fetchJuteTallyDownload({
        coId,
        branchId: branch?.branch_id ?? null,
        dateFrom: fromDate,
        dateTo: toDate,
      });
      if (!blob || blob.size === 0) {
        setSnackbar("No data for the selected range.");
        return;
      }
      saveAs(blob, `jute_purchase_tally_${fromDate}_${toDate}.xlsx`);
      setTallySuccess("Tally sheet downloaded.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Tally download failed.";
      setTallyError(message);
    } finally {
      setDownloading(false);
    }
  }, [coId, branch, fromDate, toDate]);

  // Regular export of the loaded grid. exportRowsToExcel reads raw fields, so the
  // valueGetter columns (Status with the Returned mark, Listed On) are baked in first.
  const handleExcelDownload = useCallback(async () => {
    const exportRows = rows.map((r) => ({
      ...r,
      status_name: mrListStatusLabel(r),
      listed_date: mrListListedDate(r),
    }));
    await exportRowsToExcel(columns, exportRows, "mr-list", {
      companyName,
      branchName: branch?.branch_name,
      reportName: "MR List",
      reportNo: await resolveReportMenuId(pathname),
      reportFor: `${fromDate} To ${toDate}`,
    });
  }, [rows, companyName, branch, pathname, fromDate, toDate]);

  const getRowId = useCallback((row: MrListReportRow) => row.jute_mr_id, []);

  if (coId == null) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">
          Select a company to view the MR List
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Filter bar — drives both the grid and the tally download */}
      <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
        <Typography
          variant="subtitle2"
          sx={{ color: "#0C3C60", fontWeight: 600, mb: 1 }}
        >
          MR List Filter
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <TextField
            type="date"
            label="From Date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 170 }}
          />
          <TextField
            type="date"
            label="To Date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 170 }}
          />
          <Autocomplete
            options={branches}
            getOptionLabel={(option) => option.branch_name}
            isOptionEqualToValue={(option, value) =>
              option.branch_id === value.branch_id
            }
            value={branch}
            onChange={(_, newValue) => setBranch(newValue)}
            renderInput={(params) => (
              <TextField {...params} label="Branch" size="small" />
            )}
            sx={{ minWidth: 240 }}
          />
          <Autocomplete
            multiple
            disableCloseOnSelect
            limitTags={2}
            size="small"
            options={statusOptions}
            getOptionLabel={(o) => o.status_name}
            isOptionEqualToValue={(o, v) => o.status_id === v.status_id}
            value={statusOptions.filter((o) => statusIds.includes(o.status_id))}
            onChange={(_, picked) => setStatusIds(picked.map((o) => o.status_id))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Status"
                placeholder={statusIds.length ? undefined : "All statuses"}
              />
            )}
            sx={{ minWidth: 330 }}
          />
          <Button
            variant="contained"
            onClick={handleLoad}
            sx={{
              backgroundColor: "#0C3C60",
              "&:hover": { backgroundColor: "#092d47" },
              textTransform: "none",
            }}
          >
            Load
          </Button>
          <Button
            variant="contained"
            onClick={handleTallyDownload}
            disabled={coId == null || !fromDate || !toDate || downloading}
            startIcon={
              downloading ? (
                <CircularProgress size={18} sx={{ color: "white" }} />
              ) : undefined
            }
            sx={{
              backgroundColor: "#0C3C60",
              "&:hover": { backgroundColor: "#092d47" },
              textTransform: "none",
            }}
          >
            {downloading ? "Downloading..." : "Download Tally Sheet"}
          </Button>
          <Button
            variant="outlined"
            onClick={() => void handleExcelDownload()}
            disabled={rows.length === 0 || loading}
            sx={{ textTransform: "none" }}
          >
            Download Excel
          </Button>
        </Box>
        <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
          MRs of the ticked statuses (none ticked = all), listed by MR date, or gate-entry date when an MR has none yet (Open, or out on a transfer chain).{" "}
          The Tally sheet always carries approved MRs only; Download Excel exports the loaded grid as shown.
        </Typography>
        {tallyError && (
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            onClose={() => setTallyError(null)}
          >
            {tallyError}
          </Alert>
        )}
        {tallySuccess && (
          <Alert
            severity="success"
            sx={{ mt: 2 }}
            onClose={() => setTallySuccess(null)}
          >
            {tallySuccess}
          </Alert>
        )}
      </Paper>

      {/* Grid */}
      <Box sx={{ position: "relative", width: "100%" }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && (
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(255,255,255,0.7)",
              zIndex: 10,
            }}
          >
            <CircularProgress />
          </Box>
        )}

        <Box sx={{ height: 520, width: "100%" }}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={getRowId}
            pageSizeOptions={[25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { page: 0, pageSize: 50 } },
              sorting: {
                sortModel: [{ field: "listed_date", sort: "desc" }],
              },
            }}
            disableRowSelectionOnClick
            sx={{
              "& .MuiDataGrid-columnHeader": {
                backgroundColor: "#1b2a4e",
                color: "white",
                fontWeight: "bold",
              },
              "& .MuiDataGrid-columnHeaderTitle": {
                fontWeight: "bold",
              },
            }}
          />
        </Box>
      </Box>

      <Snackbar
        open={snackbar != null}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        message={snackbar ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
