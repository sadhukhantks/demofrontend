"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Pencil, Trash2, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { formatDmy } from "./periodPreview";
import {
  periodEditSchema,
  type PeriodEditFormValues,
  type PeriodGenerateResult,
  type PeriodRow,
} from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  periodTypeId: number | null;
  periodTypeName: string;
  /** Called after generate / edit / delete so the list can refresh period counts. */
  onChanged?: () => void;
}

/**
 * Generated periods of one period type: pick a year, generate (idempotent),
 * edit name / dates / active, or delete a period.
 */
export default function PeriodsDialog({ open, onClose, periodTypeId, periodTypeName, onChanged }: Props) {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editRow, setEditRow] = useState<PeriodRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState<PeriodRow | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" | "warning" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const notify = useCallback(
    (message: string, severity: "success" | "error" | "warning" = "error") =>
      setSnackbar({ open: true, message, severity }),
    [],
  );

  const yearValid = Number.isInteger(year) && year >= 1900 && year <= 2200;

  const fetchRows = useCallback(async () => {
    if (periodTypeId == null || !yearValid) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ period_type_id: String(periodTypeId), year: String(year) });
      const { data, error } = await fetchWithCookie<{ data: PeriodRow[] }>(
        `${apiRoutesPortalMasters.PERIOD_TABLE}?${params}`,
        "GET",
      );
      if (error || !data) throw new Error(error || "Failed to fetch periods");
      setRows((data.data || []).map((r) => ({ ...r, id: r.period_id })));
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Error fetching periods");
    } finally {
      setLoading(false);
    }
  }, [periodTypeId, year, yearValid, notify]);

  useEffect(() => {
    if (open) void fetchRows();
    else setRows([]);
  }, [open, fetchRows]);

  const handleGenerate = async () => {
    if (periodTypeId == null || !yearValid) return;
    setGenerating(true);
    try {
      const { data, error } = await fetchWithCookie<PeriodGenerateResult>(
        apiRoutesPortalMasters.PERIOD_GENERATE,
        "POST",
        { period_type_id: periodTypeId, year },
      );
      if (error || !data) throw new Error(error || "Generate failed");
      const conflicts = data.conflicts?.length ? ` Conflicts: ${data.conflicts.join("; ")}` : "";
      notify(`Created ${data.created}, skipped ${data.skipped}.${conflicts}`, data.conflicts?.length ? "warning" : "success");
      await fetchRows();
      onChanged?.();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;
    try {
      const { error } = await fetchWithCookie(`${apiRoutesPortalMasters.PERIOD_DELETE}/${deleteRow.period_id}`, "DELETE");
      if (error) throw new Error(error);
      notify("Period deleted", "success");
      setDeleteRow(null);
      await fetchRows();
      onChanged?.();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Delete failed");
      setDeleteRow(null);
    }
  };

  const { control, handleSubmit, reset } = useForm<PeriodEditFormValues>({
    resolver: zodResolver(periodEditSchema),
    defaultValues: { period_name: "", from_date: "", to_date: "", active: true },
  });

  useEffect(() => {
    if (editRow) {
      reset({
        period_name: editRow.period_name,
        from_date: editRow.from_date,
        to_date: editRow.to_date,
        active: Boolean(editRow.active),
      });
    }
  }, [editRow, reset]);

  const onEditValid = async (values: PeriodEditFormValues) => {
    if (!editRow) return;
    setSaving(true);
    try {
      const { error } = await fetchWithCookie(`${apiRoutesPortalMasters.PERIOD_EDIT}/${editRow.period_id}`, "PUT", {
        ...values,
        period_name: values.period_name.trim(),
        active: values.active ? 1 : 0,
      });
      if (error) throw new Error(error);
      notify("Period updated", "success");
      setEditRow(null);
      await fetchRows();
      onChanged?.();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<GridColDef<PeriodRow>[]>(
    () => [
      { field: "period_code", headerName: "Code", width: 100 },
      { field: "period_name", headerName: "Name", flex: 1, minWidth: 160 },
      { field: "from_date", headerName: "From", width: 120, valueFormatter: (v: string) => formatDmy(v) },
      { field: "to_date", headerName: "To", width: 120, valueFormatter: (v: string) => formatDmy(v) },
      { field: "active", headerName: "Active", width: 90, valueFormatter: (v: unknown) => (v ? "Yes" : "No") },
      {
        field: "__actions",
        headerName: "Actions",
        width: 110,
        sortable: false,
        filterable: false,
        renderCell: (p) => (
          <>
            <IconButton size="small" aria-label="Edit period" onClick={() => setEditRow(p.row)}>
              <Pencil size={16} />
            </IconButton>
            <IconButton size="small" aria-label="Delete period" onClick={() => setDeleteRow(p.row)}>
              <Trash2 size={16} />
            </IconButton>
          </>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
          <Typography variant="h6" component="span">
            Periods — {periodTypeName}
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close dialog">
            <X size={20} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", mb: 2, pt: 1 }}>
            <TextField
              label="Year"
              type="number"
              size="small"
              value={Number.isNaN(year) ? "" : year}
              onChange={(e) => setYear(e.target.value === "" ? Number.NaN : Number(e.target.value))}
              error={!yearValid}
              sx={{ width: 120 }}
            />
            <Button variant="contained" disabled={!yearValid || generating} onClick={() => void handleGenerate()}>
              {generating ? "Generating..." : `Generate ${yearValid ? year : ""}`}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Existing periods are skipped; generating again is safe.
            </Typography>
          </Box>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            autoHeight
            disableRowSelectionOnClick
            pageSizeOptions={[12, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 12 } } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editRow !== null} onClose={() => setEditRow(null)} fullWidth maxWidth="xs">
        <DialogTitle>Edit Period {editRow?.period_code}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ pt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <Controller
              control={control}
              name="period_name"
              render={({ field, fieldState }) => (
                <TextField {...field} label="Name" size="small" fullWidth error={!!fieldState.error} helperText={fieldState.error?.message} />
              )}
            />
            <Controller
              control={control}
              name="from_date"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="From"
                  type="date"
                  size="small"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="to_date"
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label="To"
                  type="date"
                  size="small"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="Active"
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={handleSubmit(onEditValid)}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteRow !== null} onClose={() => setDeleteRow(null)}>
        <DialogTitle>Delete period?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete {deleteRow?.period_code} ({formatDmy(deleteRow?.from_date)} to {formatDmy(deleteRow?.to_date)})? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRow(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => void handleDelete()}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={7000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
