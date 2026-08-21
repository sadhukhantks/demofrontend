"use client";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { fetchPaySchemeList } from "@/utils/hrmsService";
import {
  fetchPayPeriods,
  fetchPayRegisterPrint,
  type PayPeriodOption,
  type PayRegisterPrintRow,
} from "@/utils/hrmsReportService";
import type { BranchOption } from "@/components/reports/types";

/** Payscheme option for the picker (from /hrms/pay_scheme_list). */
export interface PaySchemeOption {
  payscheme_id: number;
  payscheme_name: string | null;
  payscheme_code: string | null;
}

/** Rows grouped by department, in backend (dept_code, eb_no) order. */
export interface DeptGroup {
  deptCode: string;
  deptDesc: string;
  rows: PayRegisterPrintRow[];
}

export function groupByDept(rows: PayRegisterPrintRow[]): DeptGroup[] {
  const groups: DeptGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.deptCode === r.dept_code) {
      last.rows.push(r);
    } else {
      groups.push({ deptCode: r.dept_code, deptDesc: r.dept_desc, rows: [r] });
    }
  }
  return groups;
}

/** "2026-08-15" -> "15-08-2026" (legacy F/E date format). */
export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** "2026-08-15" -> "AUG'2026" (legacy PAY SLIP FOR format). */
export function fmtMonth(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const mon = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return `${mon}'${d.getFullYear()}`;
}

export const f2 = (n: number) => n.toFixed(2);
export const f0 = (n: number) => Math.round(n).toString();

interface PayrollPrintState {
  companyName: string | null;
  scheme: PaySchemeOption | null;
  period: PayPeriodOption | null;
  rows: PayRegisterPrintRow[];
  loading: boolean;
  error: string | null;
  controls: React.ReactNode;
}

/**
 * Shared state + filter bar for the Pay Register / Payslip print pages:
 * Branch (sidebar-seeded) → Payscheme (company's pay_scheme_master) →
 * Pay Period (non-cancelled, newest first) → Load + Print. The caller renders
 * `controls` and then its own printable document from `rows`.
 */
export function usePayrollPrint(title: string): PayrollPrintState {
  const { branches, coId, companyName, initialBranchId } = useReportBranches();
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [schemes, setSchemes] = useState<PaySchemeOption[]>([]);
  const [scheme, setScheme] = useState<PaySchemeOption | null>(null);
  const [periods, setPeriods] = useState<PayPeriodOption[]>([]);
  const [period, setPeriod] = useState<PayPeriodOption | null>(null);
  const [rows, setRows] = useState<PayRegisterPrintRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sidebar context hydrates after mount — adopt its branch once available.
  useEffect(() => {
    if (branchId == null && initialBranchId != null) setBranchId(initialBranchId);
  }, [branchId, initialBranchId]);

  useEffect(() => {
    if (coId == null) return;
    let mounted = true;
    fetchPaySchemeList(String(coId), { page: 1, page_size: 500 })
      .then((res) => {
        if (!mounted) return;
        const data = (res.data as { data?: PaySchemeOption[] } | null)?.data;
        setSchemes(Array.isArray(data) ? data : []);
      })
      .catch(() => setSchemes([]));
    return () => {
      mounted = false;
    };
  }, [coId]);

  useEffect(() => {
    setPeriod(null);
    setPeriods([]);
    setRows([]);
    if (!scheme) return;
    let mounted = true;
    fetchPayPeriods({ payschemeId: scheme.payscheme_id, branchId })
      .then((res) => {
        if (mounted) setPeriods(res);
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load periods");
        }
      });
    return () => {
      mounted = false;
    };
  }, [scheme, branchId]);

  const load = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchPayRegisterPrint({ payperiodId: period.payperiod_id }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load payroll data");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const branch = branches.find((b: BranchOption) => b.branch_id === branchId) ?? null;

  const controls = (
    <Box className="print:hidden" sx={{ p: 3, pb: 0 }}>
      <Typography variant="h5" sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}>
        {title}
      </Typography>
      <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Autocomplete
            options={branches}
            getOptionLabel={(o: BranchOption) => o.branch_name}
            isOptionEqualToValue={(o: BranchOption, v: BranchOption) =>
              o.branch_id === v.branch_id
            }
            value={branch}
            onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
            renderInput={(params) => (
              <TextField {...params} label="Branch" size="small" />
            )}
            sx={{ minWidth: 220 }}
          />
          <Autocomplete
            options={schemes}
            getOptionLabel={(o) => o.payscheme_name ?? o.payscheme_code ?? ""}
            isOptionEqualToValue={(o, v) => o.payscheme_id === v.payscheme_id}
            value={scheme}
            onChange={(_, v) => setScheme(v)}
            renderInput={(params) => (
              <TextField {...params} label="Pay Scheme" size="small" />
            )}
            sx={{ minWidth: 280 }}
          />
          <Autocomplete
            options={periods}
            getOptionLabel={(o) => `${fmtDate(o.from_date)} To ${fmtDate(o.to_date)}`}
            isOptionEqualToValue={(o, v) => o.payperiod_id === v.payperiod_id}
            value={period}
            onChange={(_, v) => setPeriod(v)}
            renderInput={(params) => (
              <TextField {...params} label="Pay Period" size="small" />
            )}
            sx={{ minWidth: 260 }}
          />
          <Button
            variant="contained"
            disabled={!period || loading}
            onClick={() => {
              void load();
            }}
            sx={{
              backgroundColor: "#0C3C60",
              "&:hover": { backgroundColor: "#092d47" },
              textTransform: "none",
            }}
          >
            Load
          </Button>
          <Button
            variant="outlined"
            disabled={rows.length === 0}
            onClick={() => window.print()}
            sx={{ textTransform: "none" }}
          >
            Print
          </Button>
          {loading && <CircularProgress size={22} />}
        </Box>
      </Paper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );

  return { companyName, scheme, period, rows, loading, error, controls };
}

/**
 * Print isolation: everything except the .pay-print-area is hidden while
 * printing, so window.print() emits only the document (no sidebar/toolbar).
 */
export function printStyles(orientation: "landscape" | "portrait"): string {
  return `
@media print {
  body * { visibility: hidden; }
  .pay-print-area, .pay-print-area * { visibility: visible; }
  .pay-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
  .pay-dept-section { break-before: page; }
  .pay-dept-section:first-of-type { break-before: auto; }
  @page { size: A4 ${orientation}; margin: 8mm; }
}
`;
}
