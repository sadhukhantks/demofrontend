"use client";

/**
 * Passes issued in the branch by issue date (the reference "Worker Gate Pass"
 * grid): tick passes to print them together (stored figures, never
 * recomputed), download the shown rows as Excel, delete (cancel, with a
 * reason) one issued by mistake (edit access).
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { cancelJoiningPass, fetchJpList, fetchJpPass, type JpPass } from "@/utils/joiningPassService";
import { printPasses } from "../_print";
import { fmtDate } from "../_utils";

interface RegisterPanelProps {
  coId: number;
  branchId: number;
  today: string;
  canEdit: boolean;
  companyName: string;
  branchName: string;
  /** Bumped after an issue so the register reloads. */
  refreshKey: number;
  onNotify: (text: string, severity: "success" | "info" | "warning" | "error") => void;
}

function minusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const EXCEL_COLUMNS = [
  { field: "pass_no", headerName: "Pass No" },
  { field: "eb_no", headerName: "EB No" },
  { field: "name", headerName: "Name" },
  { field: "department", headerName: "Department" },
  { field: "gate_pass_date", headerName: "Gate Pass Date" },
  { field: "shift", headerName: "Shift" },
  { field: "absent_from", headerName: "Absent From" },
  { field: "absent_to", headerName: "Absent To" },
  { field: "days", headerName: "Days" },
  { field: "reasons", headerName: "Reasons" },
  { field: "authority", headerName: "Authority" },
  { field: "issued_on", headerName: "Issued On" },
  { field: "fortnight", headerName: "Fortnight Present / Working" },
  { field: "efficiency", headerName: "Fortnight Eff %" },
  { field: "status", headerName: "Status" },
];

export default function RegisterPanel({
  coId,
  branchId,
  today,
  canEdit,
  companyName,
  branchName,
  refreshKey,
  onNotify,
}: RegisterPanelProps) {
  const [selected, setSelected] = React.useState<number[]>([]);
  const [dateFrom, setDateFrom] = React.useState(() => minusDays(today, 30));
  const [dateTo, setDateTo] = React.useState(today);
  const [search, setSearch] = React.useState("");
  const [includeCancelled, setIncludeCancelled] = React.useState(false);
  const [rows, setRows] = React.useState<JpPass[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [cancelling, setCancelling] = React.useState<JpPass | null>(null);
  const [reason, setReason] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      fetchJpList({ coId, branchId, dateFrom, dateTo, search: search.trim() || null, includeCancelled })
        .then((r) => {
          if (alive) {
            setRows(r);
            setSelected([]);
          }
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [coId, branchId, dateFrom, dateTo, search, includeCancelled, refreshKey, reloadKey]);

  const print = async (ids: number[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const passes = await Promise.all(ids.map((id) => fetchJpPass(coId, id)));
      printPasses(
        passes.map((p) => p.letter),
        ids.length === 1 ? `Joining pass ${passes[0].pass_no ?? ""}` : "Joining passes",
      );
    } catch (e) {
      onNotify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelling || !reason.trim()) return;
    setBusy(true);
    try {
      await cancelJoiningPass(coId, cancelling.joining_pass_id, reason.trim());
      onNotify(`Pass ${cancelling.pass_no ?? ""} deleted`, "success");
      setCancelling(null);
      setReason("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const activeIds = rows.filter((r) => r.active === 1).map((r) => r.joining_pass_id);
  const allTicked = activeIds.length > 0 && activeIds.every((id) => selected.includes(id));
  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const downloadExcel = async () => {
    try {
      await exportRowsToExcel(
        EXCEL_COLUMNS,
        rows.map((r) => ({
          id: r.joining_pass_id,
          pass_no: r.pass_no ?? "",
          eb_no: r.emp_code ?? "",
          name: r.emp_name ?? "",
          department: r.dept_desc ?? "",
          gate_pass_date: fmtDate(r.join_date),
          shift: r.spell_code ?? "",
          absent_from: fmtDate(r.absent_from),
          absent_to: fmtDate(r.absent_to),
          days: r.absent_working_days,
          reasons: r.remarks ?? "",
          authority: r.authority ?? "",
          issued_on: fmtDate(r.issue_date),
          fortnight: r.fn_days_present != null ? `${r.fn_days_present} / ${r.fn_working_days}` : "",
          efficiency: r.fn_efficiency ?? "",
          status: r.active === 1 ? "Issued" : `Deleted: ${r.cancel_reason ?? ""}`,
        })),
        "joining-passes",
        { companyName, branchName, reportName: "Worker Gate Pass (Joining Pass) Register", reportFor: `${fmtDate(dateFrom)} To ${fmtDate(dateTo)}` },
      );
    } catch (e) {
      onNotify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          label="Issued from"
          type="date"
          size="small"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: { xs: "47%", sm: 170 } }}
        />
        <TextField
          label="to"
          type="date"
          size="small"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: { xs: "47%", sm: 170 } }}
        />
        <TextField
          label="Pass No / EB No / name"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: "100%", sm: 220 } }}
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={includeCancelled} onChange={(e) => setIncludeCancelled(e.target.checked)} />}
          label="Show deleted"
        />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={busy || selected.length === 0} onClick={() => void print(selected)}>
          Print ticked ({selected.length})
        </Button>
        <Button variant="outlined" disabled={rows.length === 0} onClick={() => void downloadExcel()}>
          Download Excel
        </Button>
      </Paper>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allTicked}
                    indeterminate={selected.length > 0 && !allTicked}
                    disabled={activeIds.length === 0}
                    onChange={() => setSelected(allTicked ? [] : activeIds)}
                  />
                </TableCell>
                <TableCell>Pass No</TableCell>
                <TableCell>EB No</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Gate pass date</TableCell>
                <TableCell>Shift</TableCell>
                <TableCell>Absent from</TableCell>
                <TableCell>Absent to</TableCell>
                <TableCell align="right">Days</TableCell>
                <TableCell>Reasons</TableCell>
                <TableCell>Authority</TableCell>
                <TableCell>Fortnight</TableCell>
                <TableCell>Issued</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14}>
                    <Typography variant="body2" color="text.secondary">
                      No passes in this period.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.joining_pass_id} hover sx={r.active === 1 ? undefined : { opacity: 0.6 }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        disabled={r.active !== 1}
                        checked={selected.includes(r.joining_pass_id)}
                        onChange={() => toggle(r.joining_pass_id)}
                      />
                    </TableCell>
                    <TableCell>
                      {r.pass_no}
                      {r.active === 1 ? null : (
                        <Chip size="small" color="error" variant="outlined" label="Deleted" sx={{ ml: 1 }} title={r.cancel_reason ?? ""} />
                      )}
                    </TableCell>
                    <TableCell>{r.emp_code}</TableCell>
                    <TableCell>
                      {r.emp_name}
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {r.dept_desc}
                      </Typography>
                    </TableCell>
                    <TableCell>{fmtDate(r.join_date)}</TableCell>
                    <TableCell>{r.spell_code}</TableCell>
                    <TableCell>{fmtDate(r.absent_from)}</TableCell>
                    <TableCell>{fmtDate(r.absent_to)}</TableCell>
                    <TableCell align="right">{r.absent_working_days}</TableCell>
                    <TableCell>{r.remarks}</TableCell>
                    <TableCell>{r.authority}</TableCell>
                    <TableCell>
                      {r.fn_days_present != null ? `${r.fn_days_present}/${r.fn_working_days}` : "—"}
                      {r.fn_efficiency != null ? ` · ${r.fn_efficiency.toFixed(2)}%` : ""}
                    </TableCell>
                    <TableCell>
                      {fmtDate(r.issue_date)}
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {r.issued_by_name}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {r.active === 1 ? (
                        <>
                          <Button size="small" disabled={busy} onClick={() => void print([r.joining_pass_id])}>
                            Print
                          </Button>
                          {canEdit ? (
                            <Button size="small" color="error" disabled={busy} onClick={() => setCancelling(r)}>
                              Delete
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={cancelling != null} onClose={() => setCancelling(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete pass {cancelling?.pass_no}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {cancelling?.emp_code} · {cancelling?.emp_name}. The absence will need a new pass.
          </Typography>
          <TextField
            label="Reason"
            fullWidth
            required
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 300))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(null)}>Back</Button>
          <Button color="error" variant="contained" disabled={busy || !reason.trim()} onClick={() => void confirmCancel()}>
            Delete pass
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
