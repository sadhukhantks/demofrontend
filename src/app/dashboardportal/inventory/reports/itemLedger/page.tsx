"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { currentMonthRange } from "@/components/reports/reportDates";
import {
  fetchItemLedgerReport,
  searchItems,
  type ItemOption,
} from "@/utils/inventoryReportService";

type LedgerGridRow = {
  id: string | number;
  txn_date: string | null;
  txn_type: string;
  ref_no: string | null;
  in_qty: number | null;
  out_qty: number | null;
  balance: number;
};

const columns: GridColDef<LedgerGridRow>[] = [
  { field: "txn_date", headerName: "Date", width: 120 },
  { field: "txn_type", headerName: "Type", width: 140 },
  { field: "ref_no", headerName: "Ref No", flex: 1, minWidth: 140 },
  numCol("in_qty", "In Qty"),
  numCol("out_qty", "Out Qty"),
  numCol("balance", "Balance", 140),
];

function ItemLedgerContent() {
  const { branches, coId, initialBranchId, dateParam } = useReportBranches();
  const { from, to } = currentMonthRange();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState<string>(from);
  const [dateTo, setDateTo] = useState<string>(dateParam || to);

  // Async item picker (server-side search via item_search).
  const [itemInput, setItemInput] = useState("");
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);

  const [openingQty, setOpeningQty] = useState(0);
  const [rows, setRows] = useState<
    Awaited<ReturnType<typeof fetchItemLedgerReport>>["rows"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced item search.
  useEffect(() => {
    if (coId == null) return;
    const q = itemInput.trim();
    const handle = setTimeout(() => {
      setItemLoading(true);
      searchItems(coId, q)
        .then(setItemOptions)
        .catch(() => setItemOptions([]))
        .finally(() => setItemLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [itemInput, coId]);

  const runReport = useCallback(async () => {
    if (coId == null || selectedItem == null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchItemLedgerReport({
        coId,
        itemId: selectedItem.item_id,
        dateFrom,
        dateTo,
        branchId,
      });
      setOpeningQty(res.openingQty);
      setRows(res.rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setRows([]);
      setOpeningQty(0);
    } finally {
      setLoading(false);
    }
  }, [coId, selectedItem, dateFrom, dateTo, branchId]);

  const gridRows: LedgerGridRow[] = useMemo(
    () => [
      {
        id: "opening",
        txn_date: dateFrom,
        txn_type: "Opening Balance",
        ref_no: "",
        in_qty: null,
        out_qty: null,
        balance: openingQty,
      },
      ...rows.map((r, i) => ({ id: i, ...r })),
    ],
    [rows, openingQty, dateFrom],
  );

  const branch = branches.find((b) => b.branch_id === branchId) ?? null;

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}
      >
        Item Ledger
      </Typography>

      <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
        >
          <Autocomplete
            options={itemOptions}
            loading={itemLoading}
            filterOptions={(x) => x}
            getOptionLabel={(o) =>
              o.full_item_code ? `${o.full_item_code} — ${o.item_name}` : o.item_name
            }
            isOptionEqualToValue={(o, v) => o.item_id === v.item_id}
            value={selectedItem}
            onChange={(_, v) => setSelectedItem(v)}
            onInputChange={(_, v) => setItemInput(v)}
            renderInput={(params) => (
              <TextField {...params} label="Item" size="small" required />
            )}
            sx={{ minWidth: 320 }}
          />

          <Autocomplete
            options={branches}
            getOptionLabel={(o) => o.branch_name}
            isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
            value={branch}
            onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
            renderInput={(params) => (
              <TextField {...params} label="Branch" size="small" />
            )}
            sx={{ minWidth: 220 }}
          />

          <TextField
            type="date"
            label="From Date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 170 }}
          />
          <TextField
            type="date"
            label="To Date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 170 }}
          />

          <Button
            variant="contained"
            disabled={selectedItem == null || loading}
            onClick={() => {
              void runReport();
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
            disabled={rows.length === 0}
            onClick={() => {
              void exportRowsToExcel(columns, gridRows, "item-ledger");
            }}
            sx={{ textTransform: "none" }}
          >
            Export to Excel
          </Button>
        </Box>
      </Paper>

      {selectedItem == null ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            Select an item to view its ledger
          </Typography>
        </Box>
      ) : (
        <ReportGrid
          rows={gridRows}
          columns={columns}
          getRowId={(r) => r.id}
          loading={loading}
          error={error}
        />
      )}
    </Box>
  );
}

export default function ItemLedgerPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <ItemLedgerContent />
    </Suspense>
  );
}
