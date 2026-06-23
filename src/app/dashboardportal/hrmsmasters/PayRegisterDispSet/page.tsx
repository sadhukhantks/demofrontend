"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  MenuItem,
  TextField,
  Checkbox,
  IconButton,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import { Save, Trash2 } from "lucide-react";
import { useSelectedCompanyCoId } from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
  fetchPayslipPrintComponentSetup,
  fetchPaySchemeComponents,
  fetchPayslipPrintComponentList,
  createPayslipPrintComponent,
  updatePayslipPrintComponent,
} from "@/utils/hrmsService";
import {
  type Option,
  FIXED_VAR_OPTIONS,
  META_COMPONENT_OPTIONS,
} from "./types/payRegisterDispSetTypes";

/** One editable spreadsheet row. `pay_id === null` means an unsaved (new) row. */
type EditRow = {
  pay_id: number | null;
  component_id: string;
  desc_print: string;
  payslip_order: string;
  fixed_var_cols: string;
  total_print: boolean;
  payslip_print: boolean;
  is_active: boolean;
  saving: boolean;
};

const blankRow = (): EditRow => ({
  pay_id: null,
  component_id: "",
  desc_print: "",
  payslip_order: "1",
  fixed_var_cols: "F",
  total_print: false,
  payslip_print: false,
  is_active: true,
  saving: false,
});

export default function PayRegisterDispSetPage() {
  const { coId } = useSelectedCompanyCoId();
  const { selectedCompany, selectedBranches } = useSidebarContext();

  const [schemeOptions, setSchemeOptions] = useState<Option[]>([]);
  const [branchOptions, setBranchOptions] = useState<Option[]>([]);
  const [componentOptions, setComponentOptions] = useState<Option[]>([]);
  const [payschemeId, setPayschemeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<EditRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const notify = useCallback(
    (message: string, severity: "success" | "error") =>
      setSnackbar({ open: true, message, severity }),
    [],
  );

  // ── Pay schemes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!coId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchPayslipPrintComponentSetup(coId);
        const schemes = (res?.data?.data?.pay_schemes ??
          res?.data?.pay_schemes ??
          []) as Array<Record<string, unknown>>;
        if (!cancelled) {
          setSchemeOptions(
            schemes.map((s) => ({
              label: `${String(s.payscheme_code ?? "")} — ${String(s.payscheme_name ?? "")}`,
              value: String(s.payscheme_id),
            })),
          );
        }
      } catch {
        if (!cancelled) notify("Failed to load pay schemes", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coId, notify]);

  // ── Branches (from sidebar, narrowed to selected) ────────────────
  useEffect(() => {
    const all = selectedCompany?.branches ?? [];
    const selected = new Set(selectedBranches.map(String));
    const opts: Option[] = all
      .filter((b) => selected.size === 0 || selected.has(String(b.branch_id)))
      .map((b) => ({ label: b.branch_name, value: String(b.branch_id) }));
    setBranchOptions(opts);
    setBranchId((prev) => prev || (opts[0]?.value ?? ""));
  }, [selectedCompany, selectedBranches]);

  // ── Component options for the chosen scheme (+ meta fields) ───────
  useEffect(() => {
    if (!coId || !payschemeId) {
      setComponentOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchPaySchemeComponents(coId, payschemeId);
        const list = (res?.data?.data ?? res?.data ?? []) as Array<
          Record<string, unknown>
        >;
        const schemeOpts: Option[] = list
          .filter((c) => c.component_id != null)
          .map((c) => ({
            label: `${String(c.component_code ?? "")} — ${String(c.component_name ?? "")}`,
            value: String(c.component_id),
          }));
        if (!cancelled)
          setComponentOptions([...META_COMPONENT_OPTIONS, ...schemeOpts]);
      } catch {
        if (!cancelled) setComponentOptions([...META_COMPONENT_OPTIONS]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coId, payschemeId]);

  // ── Existing rows for the chosen scheme + branch ─────────────────
  const loadRows = useCallback(async () => {
    if (!coId || !payschemeId || !branchId) {
      setRows([blankRow()]);
      return;
    }
    setLoadingRows(true);
    try {
      const { data, error } = await fetchPayslipPrintComponentList(coId, {
        payscheme_id: payschemeId,
        branch_id: branchId,
        limit: 500,
      });
      if (error) throw new Error(error);
      const list = (data?.data ?? []) as Array<Record<string, unknown>>;
      const loaded: EditRow[] = list.map((r) => ({
        pay_id: Number(r.pay_id),
        component_id: r.component_id != null ? String(r.component_id) : "",
        desc_print: String(r.desc_print ?? ""),
        payslip_order: r.payslip_order != null ? String(r.payslip_order) : "1",
        fixed_var_cols: String(r.fixed_var_cols ?? "F"),
        total_print: Number(r.total_print) === 1,
        payslip_print: Number(r.payslip_print) === 1,
        is_active: Number(r.is_active) === 1,
        saving: false,
      }));
      setRows([...loaded, blankRow()]);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to load rows", "error");
      setRows([blankRow()]);
    } finally {
      setLoadingRows(false);
    }
  }, [coId, payschemeId, branchId, notify]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const updateRow = (idx: number, patch: Partial<EditRow>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const buildPayload = (row: EditRow, isActive: boolean) => ({
    payscheme_id: Number(payschemeId),
    branch_id: Number(branchId),
    component_id: Number(row.component_id),
    desc_print: row.desc_print || null,
    payslip_order: row.payslip_order ? Number(row.payslip_order) : 1,
    fixed_var_cols: row.fixed_var_cols,
    total_print: row.total_print ? 1 : 0,
    payslip_print: row.payslip_print ? 1 : 0,
    is_active: isActive ? 1 : 0,
  });

  // ── Save one row (create or update) ──────────────────────────────
  const saveRow = useCallback(
    async (idx: number) => {
      const row = rows[idx];
      if (!coId) return notify("No company selected", "error");
      if (!payschemeId || !branchId)
        return notify("Select Pay Scheme and Branch first", "error");
      if (!row.component_id) return notify("Select a component", "error");
      if (!row.fixed_var_cols) return notify("Select Fixed/Variable", "error");

      updateRow(idx, { saving: true });
      const payload = buildPayload(row, row.is_active);
      try {
        if (row.pay_id) {
          const res = await updatePayslipPrintComponent(coId, row.pay_id, payload);
          if (res?.error) throw new Error(res.error);
          notify("Row updated", "success");
          updateRow(idx, { saving: false });
        } else {
          const res = await createPayslipPrintComponent(coId, payload);
          if (res?.error) throw new Error(res.error);
          const newId = Number(res?.data?.data?.pay_id ?? res?.data?.pay_id);
          notify("Row saved", "success");
          setRows((rs) => {
            const next = rs.map((r, i) =>
              i === idx
                ? {
                    ...r,
                    pay_id: Number.isFinite(newId) ? newId : r.pay_id,
                    saving: false,
                  }
                : r,
            );
            // Respawn a blank entry row once the previous blank is saved.
            const hasTrailingBlank =
              next.length > 0 && next[next.length - 1].pay_id === null;
            return hasTrailingBlank ? next : [...next, blankRow()];
          });
        }
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : "Save failed", "error");
        updateRow(idx, { saving: false });
      }
    },
    [rows, coId, payschemeId, branchId, notify],
  );

  // ── Remove a row (local for unsaved, soft-delete for saved) ──────
  const deleteRow = useCallback(
    async (idx: number) => {
      const row = rows[idx];
      if (!row.pay_id) {
        setRows((rs) => {
          const next = rs.filter((_, i) => i !== idx);
          return next.some((r) => r.pay_id === null) ? next : [...next, blankRow()];
        });
        return;
      }
      if (!coId) return;
      updateRow(idx, { saving: true });
      try {
        const res = await updatePayslipPrintComponent(
          coId,
          row.pay_id,
          buildPayload(row, false),
        );
        if (res?.error) throw new Error(res.error);
        notify("Row removed", "success");
        setRows((rs) => rs.filter((_, i) => i !== idx));
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : "Delete failed", "error");
        updateRow(idx, { saving: false });
      }
    },
    [rows, coId, payschemeId, branchId, notify],
  );

  const ready = Boolean(payschemeId && branchId);

  return (
    <Box className="flex flex-col gap-4 p-4">
      <Typography variant="h5">Pay Register Display Setup</Typography>

      <Paper className="flex flex-wrap items-center gap-4 p-4">
        <TextField
          select
          label="Pay Scheme"
          value={payschemeId}
          onChange={(e) => setPayschemeId(e.target.value)}
          size="small"
          sx={{ minWidth: 260 }}
        >
          <MenuItem value="">
            <em>Select pay scheme</em>
          </MenuItem>
          {schemeOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Branch"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">
            <em>Select branch</em>
          </MenuItem>
          {branchOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      <Paper className="p-2">
        {!ready ? (
          <Typography variant="body2" color="textSecondary" className="p-4">
            Select a Pay Scheme and Branch to configure its display columns.
          </Typography>
        ) : loadingRows ? (
          <Box className="flex justify-center p-8">
            <CircularProgress />
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 220 }}>Component</TableCell>
                <TableCell sx={{ minWidth: 160 }}>Print Label</TableCell>
                <TableCell sx={{ width: 90 }}>Order</TableCell>
                <TableCell sx={{ width: 130 }}>Fixed/Var</TableCell>
                <TableCell align="center" sx={{ width: 80 }}>
                  Total
                </TableCell>
                <TableCell align="center" sx={{ width: 80 }}>
                  Payslip
                </TableCell>
                <TableCell align="center" sx={{ width: 70 }}>
                  Active
                </TableCell>
                <TableCell align="center" sx={{ width: 110 }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.pay_id ?? `new-${idx}`}>
                  <TableCell>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={row.component_id}
                      onChange={(e) => updateRow(idx, { component_id: e.target.value })}
                    >
                      <MenuItem value="">
                        <em>Select component</em>
                      </MenuItem>
                      {componentOptions.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      value={row.desc_print}
                      onChange={(e) => updateRow(idx, { desc_print: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      value={row.payslip_order}
                      onChange={(e) => updateRow(idx, { payslip_order: e.target.value })}
                      sx={{ width: 70 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      value={row.fixed_var_cols}
                      onChange={(e) => updateRow(idx, { fixed_var_cols: e.target.value })}
                    >
                      {FIXED_VAR_OPTIONS.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={row.total_print}
                      onChange={(e) => updateRow(idx, { total_print: e.target.checked })}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={row.payslip_print}
                      onChange={(e) => updateRow(idx, { payslip_print: e.target.checked })}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={row.is_active}
                      onChange={(e) => updateRow(idx, { is_active: e.target.checked })}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Save row">
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          disabled={row.saving}
                          onClick={() => saveRow(idx)}
                          aria-label="Save row"
                        >
                          <Save size={18} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={row.pay_id ? "Remove (deactivate)" : "Remove row"}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={row.saving}
                          onClick={() => deleteRow(idx)}
                          aria-label="Remove row"
                        >
                          <Trash2 size={18} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

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
