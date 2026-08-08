"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Eye, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
  deletePlanning,
  fetchPlanningById,
  fetchPlanningTable,
  type PlanningTableRow,
} from "@/utils/juteProductionPlanningService";
import { openStyledPrintWindow } from "@/utils/printUtils";
import ProductionPlanningPreview from "./components/ProductionPlanningPreview";
import { apiToUiDoc } from "./createProductionPlanning/utils/planningMappers";
import type { PlanningDocUI } from "./createProductionPlanning/types/productionPlanningTypes";

const CREATE_ROUTE = "/dashboardportal/juteProduction/productionPlanning/createProductionPlanning";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatKg(value: number | string | null | undefined): string {
  if (value == null || value === "") return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : "-";
}

/**
 * Production Planning list: date-range filter + one row per plan document with
 * View / Edit / Print / Delete actions and a "New Plan" entry point.
 */
export default function ProductionPlanningListPage() {
  const router = useRouter();

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const { coId } = useSelectedCompanyCoId();
  const { selectedBranches } = useSidebarContext();
  const branchId = selectedBranches.length === 1 ? Number(selectedBranches[0]) : null;

  const [fromDate, setFromDate] = React.useState<string>(firstOfMonthISO());
  const [toDate, setToDate] = React.useState<string>(todayISO());

  const [rows, setRows] = React.useState<PlanningTableRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [snack, setSnack] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!coId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlanningTable({ coId, branchId, fromDate, toDate });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plans.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [coId, branchId, fromDate, toDate]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Print (fetch full doc → preview dialog → styled print window) ───────
  const [printDoc, setPrintDoc] = React.useState<PlanningDocUI | null>(null);
  const [printLoading, setPrintLoading] = React.useState(false);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const handleOpenPrint = React.useCallback(
    async (planningId: number) => {
      if (!coId) return;
      setPrintLoading(true);
      try {
        const api = await fetchPlanningById(planningId, coId);
        setPrintDoc(apiToUiDoc(api));
      } catch (e) {
        setSnack(e instanceof Error ? e.message : "Failed to load the plan for printing.");
      } finally {
        setPrintLoading(false);
      }
    },
    [coId]
  );

  const handlePrint = React.useCallback(() => {
    const content = previewRef.current?.innerHTML || "";
    const win = openStyledPrintWindow(content, `Production Planning - ${printDoc?.plan_no ?? "Print"}`);
    if (!win) return;
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  }, [printDoc]);

  // ── Delete ──────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = React.useState<PlanningTableRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget || !coId) return;
    setDeleting(true);
    try {
      await deletePlanning({ planningId: deleteTarget.planning_id, coId });
      setSnack(`Deleted ${deleteTarget.plan_no ?? `plan #${deleteTarget.planning_id}`}.`);
      setDeleteTarget(null);
      void refresh();
    } catch (e) {
      setSnack(e instanceof Error ? e.message : "Failed to delete the plan.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, coId, refresh]);

  const columns = React.useMemo<GridColDef<PlanningTableRow>[]>(
    () => [
      { field: "plan_no", headerName: "Plan No", width: 110 },
      { field: "plan_date", headerName: "Date", width: 110 },
      { field: "plan_name", headerName: "Name", width: 180 },
      { field: "branch_name", headerName: "Branch", width: 140 },
      {
        field: "total_cloth_kg",
        headerName: "Cloth Kg/Day",
        width: 120,
        type: "number",
        valueFormatter: (value: number | string | null) => formatKg(value),
      },
      {
        field: "raw_jute_kg",
        headerName: "Raw Jute Kg/Day",
        width: 140,
        type: "number",
        valueFormatter: (value: number | string | null) => formatKg(value),
      },
      { field: "updated_date_time", headerName: "Updated", width: 170 },
      {
        field: "actions",
        headerName: "Actions",
        width: 170,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const row = params.row;
          return (
            <Box sx={{ display: "flex", gap: 0.25 }}>
              <Tooltip title="View">
                <IconButton
                  size="small"
                  onClick={() => router.push(`${CREATE_ROUTE}?mode=view&id=${row.planning_id}`)}
                >
                  <Eye size={15} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={() => router.push(`${CREATE_ROUTE}?mode=edit&id=${row.planning_id}`)}
                >
                  <Pencil size={15} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Print">
                <IconButton size="small" onClick={() => void handleOpenPrint(row.planning_id)}>
                  <Printer size={15} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => setDeleteTarget(row)}>
                  <Trash2 size={15} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    [router, handleOpenPrint]
  );

  if (!mounted) return null;

  if (!coId) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Select a company to continue.
      </Alert>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Production Planning
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          size="small"
          startIcon={<Plus size={15} />}
          onClick={() => router.push(`${CREATE_ROUTE}?mode=create`)}
        >
          New Plan
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Daily loom plan, yarn requirement and department-wise machine breakup.
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mb: 2 }}>
        <TextField
          type="date"
          size="small"
          label="From"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          type="date"
          size="small"
          label="To"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Box sx={{ width: "100%" }}>
        <DataGrid
          autoHeight
          rows={rows}
          getRowId={(r) => r.planning_id}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          density="compact"
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25, page: 0 } },
          }}
          sx={{ width: "100%" }}
        />
      </Box>

      {/* Print preview dialog */}
      <Dialog
        open={printDoc != null || printLoading}
        onClose={() => setPrintDoc(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogContent>
          {printLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : printDoc ? (
            <ProductionPlanningPreview ref={previewRef} doc={printDoc} coId={coId} />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintDoc(null)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<Printer size={15} />}
            onClick={handlePrint}
            disabled={!printDoc}
          >
            Print
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget != null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete plan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget
              ? `Delete ${deleteTarget.plan_no ?? `plan #${deleteTarget.planning_id}`} dated ${deleteTarget.plan_date}? It will no longer appear in the list.`
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack != null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack ?? ""}
      />
    </Box>
  );
}
