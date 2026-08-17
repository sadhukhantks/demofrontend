"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Backdrop,
  Box,
  CircularProgress,
  Paper,
  Snackbar,
  Typography,
} from "@mui/material";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import MuiForm, {
  type Field,
  type MuiFormHandle,
  type Option,
  type Schema,
} from "@/components/ui/muiform";
import { useSelectedCompanyCoId } from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { todayIso } from "@/components/reports/reportDates";
import { fetchPaySchemeList } from "@/utils/hrmsService";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

/** Legacy `hol_get` code for the Holiday Data process. */
const ACTION_HOLIDAY_DATA = "1";

/**
 * EJM Wages Process — period + pay scheme + action, then Process.
 *
 * Ports the header of the "Holiday/Attendance Incentive Data" screen from the
 * legacy Data-Portal-Php app (`views/other_data_entry/holiday_att_incn_process.php`).
 * The "Data For" values are the legacy `hol_get` codes verbatim so the backend
 * port can dispatch on the same numbers.
 *
 * Everything the actions write lands in `tbl_ejm_wages_data_collection`, keyed
 * by (date_from, date_to, eb_id, pay_scheme_id).
 */

/** The "Data For" list from holiday_att_incn_process.php — legacy `$holget`
 *  codes and labels verbatim, so operators and the backend port see the same
 *  numbers they do today. */
const ACTION_OPTIONS: Option[] = [
  { label: "Holiday Data", value: "1" },
  { label: "Main Payroll FN Attendance Incentive", value: "2" },
  { label: "Forthnightly Attendance Incentive", value: "3" },
  { label: "Monthly Attendance Incentive", value: "4" },
  { label: "Attendance Data For EJM", value: "5" },
  { label: "Mill Att Data EJM", value: "6" },
  { label: "Forthnightly Attendance Incentive(T)", value: "7" },
  { label: "Monthly Attendance Incentive(T)", value: "8" },
  { label: "Attendance Data For NJM", value: "9" },
  { label: "Leave Transfer Data For NJM", value: "10" },
  { label: "Sardar/Helper Hours Transfer For NJM", value: "11" },
  { label: "Beaming Production Data Transfer for NJM", value: "12" },
  { label: "NJM wages data prepartion", value: "13" },
  { label: "EJM Cash/Outsider Daily Payment prepartion", value: "14" },
  { label: "EJM Std Hands Updation", value: "15" },
  { label: "T NO Other Data Updation", value: "16" },
  { label: "Non Working Date", value: "17" },
  { label: "EJM-Main Payroll Attendance Data Transfer", value: "18" },
  { label: "EJM-Winding Production Data Transfer", value: "19" },
  { label: "EJM-Cumulative Data Transfer", value: "20" },
  { label: "EJM-Att Incentive Dept Summary", value: "21" },
  { label: "STL Data Stamement", value: "22" },
  { label: "Canteen Data Statement", value: "23" },
  { label: "Attendance Sheet", value: "24" },
  { label: "Daily Outsider Production(EJM)", value: "25" },
  { label: "Pay Roll Posting", value: "26" },
];

interface FilterValues {
  date_from: string;
  date_to: string;
  pay_scheme_id: string;
  action: string;
}

const INITIAL_FILTERS: FilterValues = {
  date_from: "",
  date_to: "",
  pay_scheme_id: "",
  action: "",
};

const submitSchema = z
  .object({
    date_from: z.string().min(1, "Please select the From Date"),
    date_to: z.string().min(1, "Please select the To Date"),
    pay_scheme_id: z.string().min(1, "Please select the Pay Scheme"),
    action: z.string().min(1, "Please select what to process"),
  })
  .refine((v) => v.date_to >= v.date_from, {
    message: "To Date cannot be earlier than From Date",
    path: ["date_to"],
  });

export default function EjmWagesProcessPage() {
  const { coId } = useSelectedCompanyCoId();
  // Every action here processes one branch's data — the legacy screen used the
  // logged-in company, this uses the sidebar branch selection.
  const { selectedBranches } = useSidebarContext();
  const branchId = selectedBranches.length > 0 ? selectedBranches[0] : undefined;
  const formRef = useRef<MuiFormHandle>(null);

  const [filters, setFilters] = useState<FilterValues>(INITIAL_FILTERS);
  const [paySchemes, setPaySchemes] = useState<Option[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const notify = useCallback(
    (message: string, severity: "success" | "error" | "info" = "info") =>
      setSnackbar({ open: true, message, severity }),
    [],
  );

  // Default both dates to today — after mount, never during render: server and
  // browser can straddle midnight and baking "today" into SSR breaks hydration.
  useEffect(() => {
    const today = todayIso();
    formRef.current?.setValue("date_from", today);
    formRef.current?.setValue("date_to", today);
  }, []);

  useEffect(() => {
    if (!coId) return;
    let cancelled = false;
    (async () => {
      // page_size 200: the scheme list is a dropdown here, not a browse grid.
      const { data, error } = await fetchPaySchemeList(coId, { page_size: 200 });
      if (cancelled) return;
      if (error || !data) {
        notify(error || "Failed to load pay schemes", "error");
        return;
      }
      setPaySchemes(
        (data.data ?? [])
          // Same statuses the backend's own pay-scheme dropdown query keeps —
          // Active(1) and Locked(32). A deactivated scheme can't be processed.
          .filter((r: Record<string, unknown>) =>
            [1, 32].includes(Number(r.record_status)),
          )
          .map((r: Record<string, unknown>) => ({
            label: String(r.payscheme_name ?? r.payscheme_code ?? ""),
            value: String(r.payscheme_id),
          })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [coId, notify]);

  const schema = useMemo<Schema>(
    () => ({
      fields: [
        { name: "date_from", label: "From Date", type: "date", required: true, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "date_to", label: "To Date", type: "date", required: true, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "pay_scheme_id", label: "Pay Scheme", type: "select", options: paySchemes, required: true, grid: { xs: 12, sm: 6, md: 3 } },
        { name: "action", label: "Report", type: "select", options: ACTION_OPTIONS, required: true, grid: { xs: 12, sm: 6, md: 3 } },
      ] satisfies Field[],
    }),
    [paySchemes],
  );

  const handleValuesChange = useCallback((vals: Record<string, unknown>) => {
    setFilters((prev) => ({ ...prev, ...(vals as Partial<FilterValues>) }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const parsed = submitSchema.safeParse(filters);
    if (!parsed.success) {
      notify(parsed.error.issues[0]?.message ?? "Invalid selection", "error");
      return;
    }
    const label =
      ACTION_OPTIONS.find((o) => o.value === parsed.data.action)?.label ?? "";

    // Holiday Data is scoped to one branch's calendar, so it cannot run off the
    // company alone the way the legacy screen did.
    if (parsed.data.action === ACTION_HOLIDAY_DATA && branchId == null) {
      notify("Select a branch in the sidebar before processing", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (parsed.data.action === ACTION_HOLIDAY_DATA) {
        // Pay scheme narrows who gets credited — a branch's workforce spans
        // several schemes and a wages run for one must not pay the others.
        const { data, error } = await fetchWithCookie<{ message: string }>(
          apiRoutesPortalMasters.HOLIDAY_PROCESS_RANGE,
          "POST",
          {
            branch_id: branchId,
            date_from: parsed.data.date_from,
            date_to: parsed.data.date_to,
            pay_scheme_id: parsed.data.pay_scheme_id,
          },
        );
        if (error || !data) {
          notify(error || "Holiday processing failed", "error");
          return;
        }
        notify(data.message, "success");
        return;
      }

      // ponytail: the remaining actions are not ported from Ejmprocessdata.php
      // yet. Swap each for its service call as the backend lands; the validation
      // above is the part that would otherwise get rewritten.
      notify(`"${label}" is not wired to the backend yet`, "info");
    } finally {
      setSubmitting(false);
    }
  }, [filters, notify, branchId]);

  return (
    // Same page shell as the other HRMS pages (attendance open/close, payroll).
    <Box className="flex min-h-screen flex-col gap-6 bg-gray-50 p-8">
      <Box className="flex flex-col gap-1">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
          EJM Wages Data Preparation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select the wage period, pay scheme and action, then Process
        </Typography>
      </Box>

      <Paper className="p-4">
        {/* One row: the four fields fill MuiForm's 12-column grid (4 × span 3),
            and the button sits beside it rather than inside the grid. */}
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <MuiForm
              ref={formRef}
              schema={schema}
              mode="create"
              hideModeToggle
              hideSubmit
              onValuesChange={handleValuesChange}
            />
          </Box>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="shrink-0"
          >
            {submitting ? "Processing..." : "Submit"}
          </Button>
        </Box>
      </Paper>

      {/* A batch can walk a whole date range of holidays, so the wait is long
          enough to need a blocking spinner — the legacy screen did the same
          (showSpinnerCounter). It also stops a second Submit landing mid-run. */}
      <Backdrop
        open={submitting}
        sx={(theme) => ({
          zIndex: theme.zIndex.drawer + 1,
          color: theme.palette.common.white,
          flexDirection: "column",
          gap: 2,
        })}
      >
        <CircularProgress color="inherit" />
        <Typography variant="body2">Processing…</Typography>
      </Backdrop>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
