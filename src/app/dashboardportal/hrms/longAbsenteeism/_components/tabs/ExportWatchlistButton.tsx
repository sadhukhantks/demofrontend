"use client";

/**
 * Watchlist "Export" button: writes the rows on screen (view + filters
 * applied) as the Personnel office's "Long Absent Report" sheet — column
 * order of the spec section 8, then the extra columns named in Settings
 * (../../_export.ts). The Report No in the sheet header is this page's menu id.
 */

import * as React from "react";
import { Alert, Button, CircularProgress, Snackbar } from "@mui/material";
import { FileSpreadsheet } from "lucide-react";
import { usePathname } from "next/navigation";
import { fmtDate } from "@/components/lowPerformerFollowup/schemas";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { WATCHLIST_REPORT_NAME, exportWatchlistToExcel } from "../../_export";
import type { ExportWatchlistButtonProps } from "./types";

export default function ExportWatchlistButton({
  rows,
  setup,
  companyName,
  branchName,
  disabled,
}: ExportWatchlistButtonProps) {
  const pathname = usePathname();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const enabled = !disabled && rows.length > 0 && !busy;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const reportNo = await resolveReportMenuId(pathname);
      await exportWatchlistToExcel(rows, setup, {
        companyName: companyName || null,
        branchName: branchName || null,
        reportName: WATCHLIST_REPORT_NAME,
        reportNo,
        reportFor: setup?.today ? fmtDate(setup.today) : null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not write the Excel file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <FileSpreadsheet size={16} />}
        disabled={!enabled}
        onClick={() => void run()}
        title={rows.length ? `Export ${rows.length} row${rows.length === 1 ? "" : "s"} to Excel` : undefined}
        sx={{ minHeight: 40 }}
      >
        Export
      </Button>
      <Snackbar
        open={error != null}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setError(null)} variant="filled">
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
