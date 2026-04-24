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
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchSalesJuteTallyDownload } from "@/utils/salesReportService";
import { saveAs } from "file-saver";
import type { BranchOption } from "@/app/dashboardportal/jutePurchase/reports/types/reportTypes";

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

export default function SalesJuteTallyDownloadPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { selectedCompany } = useSidebarContext();

  const initialRange = useMemo(() => currentMonthRange(), []);
  const [dateFrom, setDateFrom] = useState<string>(initialRange.from);
  const [dateTo, setDateTo] = useState<string>(initialRange.to);
  const [branch, setBranch] = useState<BranchOption | null>(null);

  const [downloading, setDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const branchOptions: BranchOption[] = useMemo(
    () =>
      (selectedCompany?.branches ?? []).map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
      })),
    [selectedCompany?.branches],
  );

  const coId = selectedCompany?.co_id ?? null;

  const handleDownload = useCallback(async () => {
    if (coId == null) return;
    if (!dateFrom || !dateTo) {
      setSnackbar("From and To dates are required.");
      return;
    }
    setDownloading(true);
    setError(null);
    setSuccess(null);
    try {
      const blob = await fetchSalesJuteTallyDownload({
        coId,
        branchId: branch?.branch_id ?? null,
        dateFrom,
        dateTo,
      });
      if (!blob || blob.size === 0) {
        setSnackbar("No data for the selected range.");
        return;
      }
      saveAs(blob, `sales_raw_jute_tally_${dateFrom}_${dateTo}.xlsx`);
      setSuccess("Tally sheet downloaded.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Download failed.";
      setError(message);
    } finally {
      setDownloading(false);
    }
  }, [coId, branch, dateFrom, dateTo]);

  if (!mounted) return null;

  if (!selectedCompany?.co_id) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">
          Select a company from the sidebar to continue.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}
      >
        Jute Tally Download (Sales — Raw Jute)
      </Typography>

      <Paper elevation={1} sx={{ p: 2 }}>
        <Typography
          variant="subtitle2"
          sx={{ color: "#0C3C60", fontWeight: 600, mb: 1 }}
        >
          Filters
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
          <Autocomplete
            options={branchOptions}
            getOptionLabel={(option) => option.branch_name}
            isOptionEqualToValue={(option, value) =>
              option.branch_id === value.branch_id
            }
            value={branch}
            onChange={(_, newValue) => setBranch(newValue)}
            renderInput={(params) => (
              <TextField {...params} label="Branch (optional)" size="small" />
            )}
            sx={{ minWidth: 240 }}
          />
          <Button
            variant="contained"
            onClick={handleDownload}
            disabled={coId == null || !dateFrom || !dateTo || downloading}
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
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="info" sx={{ mt: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}
      </Paper>

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
