"use client";

/**
 * Control Desk — Support Tickets management screen.
 *
 * The VOW team triages tickets raised from the Portal / Tenant Admin dashboards:
 * filter & search, open a ticket to assign an owner, move it through its
 * lifecycle and converse with the reporter.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Chip, MenuItem, Paper, TextField, FormControlLabel, Switch, Typography } from "@mui/material";
import type { GridColDef, GridPaginationModel, GridRenderCellParams } from "@mui/x-data-grid";

import IndexWrapper from "@/components/ui/IndexWrapper";
import { handleAuthError } from "@/utils/auth";
import { getManageStats, listManageTickets } from "@/utils/supportTicketService";
import {
  TICKET_PRIORITY_COLOR,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLOR,
  TICKET_STATUS_LABELS,
  type ManageTicketRow,
  type TicketStatsResponse,
} from "@/utils/supportTicketTypes";
import TicketManageDrawer from "./_components/TicketManageDrawer";

type Row = ManageTicketRow & { id: number };

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, minWidth: 160 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function SupportTicketsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<number | "">("");
  const [priorityFilter, setPriorityFilter] = useState<number | "">("");
  const [openOnly, setOpenOnly] = useState(false);

  const [drawerTicketId, setDrawerTicketId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stats, setStats] = useState<TicketStatsResponse | null>(null);

  const fetchStats = useCallback(async () => {
    const { data, status } = await getManageStats();
    if (handleAuthError(status)) return;
    setStats(data);
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await listManageTickets({
      page: paginationModel.page + 1,
      limit: paginationModel.pageSize,
      status_id: statusFilter === "" ? null : statusFilter,
      priority: priorityFilter === "" ? null : priorityFilter,
      only_open: openOnly,
      search: search || null,
    });
    setLoading(false);
    if (handleAuthError(status)) return;
    if (error || !data) {
      setRows([]);
      setTotal(0);
      return;
    }
    setRows((data.data ?? []).map((t) => ({ ...t, id: t.ticket_id })));
    setTotal(data.total ?? 0);
  }, [paginationModel.page, paginationModel.pageSize, statusFilter, priorityFilter, openOnly, search]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      { field: "ticket_no", headerName: "Ticket", width: 120 },
      { field: "subject", headerName: "Subject", flex: 1, minWidth: 200 },
      { field: "con_org_shortname", headerName: "Org", width: 90 },
      { field: "reporter_name", headerName: "Reporter", width: 150 },
      {
        field: "priority",
        headerName: "Priority",
        width: 110,
        renderCell: (p: GridRenderCellParams<Row, number>) => (
          <Chip
            size="small"
            variant="outlined"
            label={TICKET_PRIORITY_LABELS[p.value ?? 0] ?? p.value}
            color={TICKET_PRIORITY_COLOR[p.value ?? 0] ?? "default"}
          />
        ),
      },
      {
        field: "status_id",
        headerName: "Status",
        width: 130,
        renderCell: (p: GridRenderCellParams<Row, number>) => (
          <Chip
            size="small"
            label={TICKET_STATUS_LABELS[p.value ?? 0] ?? p.value}
            color={TICKET_STATUS_COLOR[p.value ?? 0] ?? "default"}
          />
        ),
      },
      { field: "assigned_to_name", headerName: "Assignee", width: 150 },
      {
        field: "updated_date_time",
        headerName: "Updated",
        width: 150,
        valueFormatter: (value: string) => formatDateTime(value),
      },
    ],
    [],
  );

  const toolbar = (
    <Box className="flex flex-wrap items-center gap-3">
      <TextField
        select
        size="small"
        label="Status"
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value === "" ? "" : Number(e.target.value));
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        sx={{ minWidth: 150 }}
      >
        <MenuItem value="">All statuses</MenuItem>
        {Object.entries(TICKET_STATUS_LABELS).map(([id, label]) => (
          <MenuItem key={id} value={Number(id)}>
            {label}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        size="small"
        label="Priority"
        value={priorityFilter}
        onChange={(e) => {
          setPriorityFilter(e.target.value === "" ? "" : Number(e.target.value));
          setPaginationModel((m) => ({ ...m, page: 0 }));
        }}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">All priorities</MenuItem>
        {Object.entries(TICKET_PRIORITY_LABELS).map(([id, label]) => (
          <MenuItem key={id} value={Number(id)}>
            {label}
          </MenuItem>
        ))}
      </TextField>

      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.checked);
              setPaginationModel((m) => ({ ...m, page: 0 }));
            }}
          />
        }
        label="Open only"
      />
    </Box>
  );

  const statsCards = stats ? (
    <Box className="mb-6 flex flex-wrap items-stretch gap-3">
      <StatCard label="Pending Resolution" value={stats.open.total} />
      <StatCard label="Assigned" value={stats.open.assigned} />
      <StatCard label="Pending Assignment" value={stats.open.unassigned} />
      {stats.open.by_assignee.length > 0 && (
        <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, flex: 1, minWidth: 240 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Open by Assignee
          </Typography>
          <Box className="flex flex-wrap gap-1.5">
            {stats.open.by_assignee.map((a) => (
              <Chip
                key={a.con_user_id}
                size="small"
                variant="outlined"
                label={`${a.name ?? a.con_user_id}: ${a.count}`}
              />
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  ) : null;

  return (
    <>
      <IndexWrapper<Row>
        title="Support Tickets"
        subtitle="Tickets raised from the Portal and Tenant Admin dashboards"
        headerContent={statsCards}
        rows={rows}
        columns={columns}
        rowCount={total}
        loading={loading}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        search={{
          value: search,
          onChange: (e) => {
            setSearch(e.target.value);
            setPaginationModel((m) => ({ ...m, page: 0 }));
          },
          placeholder: "Search subject / ticket no / reporter",
        }}
        toolbarContent={toolbar}
        onView={(row) => {
          setDrawerTicketId(row.ticket_id);
          setDrawerOpen(true);
        }}
      />

      <TicketManageDrawer
        ticketId={drawerTicketId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onChanged={() => {
          void fetchRows();
          void fetchStats();
        }}
      />
    </>
  );
}
