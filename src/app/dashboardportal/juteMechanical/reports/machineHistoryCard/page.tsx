"use client";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import type { GridColDef } from "@mui/x-data-grid";
import ReportGrid, { numCol } from "@/components/reports/ReportGrid";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { fetchMachineHistoryReport } from "@/utils/juteMechanicalService";
import MechFilterToolbar, {
  MechReportTitle,
  UnattributedCaption,
} from "../_components/MechFilterToolbar";
import {
  useMechReportFilters,
  useMechReportRun,
} from "../_components/useMechReportFilters";
import {
  asNamedRows,
  asRecord,
  dmy,
  dmyTime,
  pickNum,
  pickStr,
  pickText,
  unattributedPctFromRows,
} from "../_components/mechReportUtils";

/**
 * R11 — Machine History Card: every breakdown, PM execution, overhaul and spare
 * for ONE machine. `machine_id` is required by this endpoint.
 *
 * `data` arrives as an OBJECT (`machine`, `breakdowns`, `pm_executions`,
 * `overhauls`, `spares`) rather than a flat array, so it is read through
 * {@link asNamedRows}. Breakdowns cover ALL downtime types — this is the
 * machine's history, not a failure analysis — while the unattributed figure
 * stays failure-based so it lines up with the other reports.
 */
type HistoryView = "breakdowns" | "pm_executions" | "overhauls" | "spares";

interface ViewOption {
  code: HistoryView;
  label: string;
}

const VIEW_OPTIONS: ViewOption[] = [
  { code: "breakdowns", label: "Breakdowns" },
  { code: "pm_executions", label: "Preventive Maintenance" },
  { code: "overhauls", label: "Overhauls" },
  { code: "spares", label: "Spares Consumed" },
];

type HistoryRow = { id: string; view: HistoryView } & Record<
  string,
  string | number | null
>;

interface MachineHeader {
  machine_name: string;
  mech_code: string;
  machine_type_name: string;
  dept_name: string;
  make: string;
  model: string;
  serial_no: string;
  commissioning_date: string;
  criticality: string;
  last_pm_date: string;
  next_pm_due: string;
  pm_freq_days: number | null;
  last_overhaul_date: string;
  next_overhaul_due: string;
  overhaul_freq_months: number | null;
}

const BREAKDOWN_COLUMNS: GridColDef<HistoryRow>[] = [
  { field: "tran_date", headerName: "Date", width: 105 },
  { field: "spell_code", headerName: "Spell", width: 80 },
  { field: "stop_datetime", headerName: "Stopped At", width: 140 },
  { field: "attended_datetime", headerName: "Attended At", width: 140 },
  { field: "restart_datetime", headerName: "Restarted At", width: 140 },
  numCol<HistoryRow>("duration_min", "Downtime (Min)", 125),
  numCol<HistoryRow>("response_min", "Response (Min)", 125),
  { field: "reason_code", headerName: "Reason Code", width: 110 },
  { field: "reason_desc", headerName: "Reason", minWidth: 180 },
  { field: "component_name", headerName: "Component", width: 130 },
  { field: "discipline", headerName: "Discipline", width: 110 },
  { field: "downtime_type", headerName: "Downtime Type", width: 130 },
  { field: "attended_dept_name", headerName: "Attended By Dept", width: 150 },
  { field: "attended_by", headerName: "Attended By", width: 130 },
  { field: "root_cause", headerName: "Root Cause", minWidth: 170 },
  { field: "action_taken", headerName: "Action Taken", minWidth: 170 },
  { field: "preventive_action", headerName: "Preventive Action", minWidth: 170 },
  { field: "status", headerName: "Status", width: 120 },
  { field: "remarks", headerName: "Remarks", minWidth: 150 },
];

const PM_COLUMNS: GridColDef<HistoryRow>[] = [
  { field: "pm_date", headerName: "PM Date", width: 110 },
  { field: "frequency", headerName: "Frequency", width: 120 },
  { field: "done_by", headerName: "Done By", width: 140 },
  numCol<HistoryRow>("downtime_min", "Downtime (Min)", 125),
  { field: "next_due_date", headerName: "Next Due", width: 110 },
  numCol<HistoryRow>("task_count", "Tasks", 90),
  numCol<HistoryRow>("not_ok_count", "Not OK", 95),
  { field: "remarks", headerName: "Remarks", minWidth: 180 },
];

const OVERHAUL_COLUMNS: GridColDef<HistoryRow>[] = [
  { field: "overhaul_type", headerName: "Type", width: 130 },
  { field: "from_date", headerName: "From", width: 110 },
  { field: "to_date", headerName: "To", width: 110 },
  numCol<HistoryRow>("downtime_days", "Downtime (Days)", 130),
  { field: "done_by", headerName: "Done By", width: 130 },
  { field: "party_name", headerName: "Vendor", minWidth: 160 },
  numCol<HistoryRow>("labour_cost", "Labour Cost", 115),
  numCol<HistoryRow>("spare_cost", "Spare Cost", 110),
  numCol<HistoryRow>("total_cost", "Total Cost", 110),
  { field: "next_due_date", headerName: "Next Due", width: 110 },
  { field: "work_done", headerName: "Work Done", minWidth: 200 },
  { field: "remarks", headerName: "Remarks", minWidth: 150 },
];

const SPARE_COLUMNS: GridColDef<HistoryRow>[] = [
  { field: "source", headerName: "Source", width: 120 },
  { field: "document_date", headerName: "Date", width: 110 },
  { field: "item_code", headerName: "Item Code", width: 120 },
  { field: "item_name", headerName: "Item Description", minWidth: 200 },
  { field: "uom_name", headerName: "UOM", width: 80 },
  numCol<HistoryRow>("qty", "Qty", 95),
  numCol<HistoryRow>("rate", "Rate", 100),
  numCol<HistoryRow>("amount", "Amount", 110),
  { field: "remarks", headerName: "Remarks", minWidth: 150 },
];

const COLUMNS_BY_VIEW: Record<HistoryView, GridColDef<HistoryRow>[]> = {
  breakdowns: BREAKDOWN_COLUMNS,
  pm_executions: PM_COLUMNS,
  overhauls: OVERHAUL_COLUMNS,
  spares: SPARE_COLUMNS,
};

/** Machine identity + maintenance attributes, above the event grid. */
function MachineHeaderCard({ header }: { header: MachineHeader }) {
  const facts: { label: string; value: string }[] = [
    { label: "Mech Code", value: header.mech_code },
    { label: "Section", value: header.machine_type_name },
    { label: "Department", value: header.dept_name },
    { label: "Criticality", value: header.criticality },
    { label: "Make", value: header.make },
    { label: "Model", value: header.model },
    { label: "Serial No", value: header.serial_no },
    { label: "Commissioned", value: header.commissioning_date },
    { label: "Last PM", value: header.last_pm_date },
    { label: "Next PM Due", value: header.next_pm_due },
    {
      label: "PM Frequency",
      value: header.pm_freq_days === null ? "" : `${header.pm_freq_days} days`,
    },
    { label: "Last Overhaul", value: header.last_overhaul_date },
    { label: "Next Overhaul Due", value: header.next_overhaul_due },
    {
      label: "Overhaul Frequency",
      value:
        header.overhaul_freq_months === null
          ? ""
          : `${header.overhaul_freq_months} months`,
    },
  ];

  return (
    <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        {header.machine_name || "Machine"}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {facts
          .filter((fact) => fact.value !== "")
          .map((fact) => (
            <Box key={fact.label}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {fact.label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {fact.value}
              </Typography>
            </Box>
          ))}
      </Box>
    </Paper>
  );
}

function MachineHistoryContent() {
  const filters = useMechReportFilters();
  const pathname = usePathname();
  const {
    reportParams,
    companyName,
    branch,
    dateFrom,
    dateTo,
    machineId,
    branchId,
    coId,
  } = filters;

  const [view, setView] = useState<HistoryView>("breakdowns");
  const [header, setHeader] = useState<MachineHeader | null>(null);

  // This report needs a machine; without one the backend 400s.
  const ready = coId != null && branchId != null && machineId != null;

  const fetcher = useCallback(async () => {
    if (!reportParams || reportParams.machineId == null) {
      setHeader(null);
      return { rows: [], unattributed: null };
    }
    const result = await fetchMachineHistoryReport({
      ...reportParams,
      machineId: reportParams.machineId,
    });
    const payload: unknown = result.data;

    const machineRec = asRecord(asRecord(payload).machine);
    setHeader({
      machine_name: pickText(machineRec, "machine_name"),
      mech_code: pickText(machineRec, "mech_code"),
      machine_type_name: pickText(machineRec, "machine_type_name"),
      dept_name: pickText(machineRec, "dept_name"),
      make: pickText(machineRec, "make"),
      model: pickText(machineRec, "model"),
      serial_no: pickText(machineRec, "serial_no"),
      commissioning_date: dmy(pickStr(machineRec, "commissioning_date")),
      criticality: pickText(machineRec, "criticality"),
      last_pm_date: dmy(pickStr(machineRec, "last_pm_date")),
      next_pm_due: dmy(pickStr(machineRec, "next_pm_due")),
      pm_freq_days: pickNum(machineRec, "pm_freq_days"),
      last_overhaul_date: dmy(pickStr(machineRec, "last_overhaul_date")),
      next_overhaul_due: dmy(pickStr(machineRec, "next_overhaul_due")),
      overhaul_freq_months: pickNum(machineRec, "overhaul_freq_months"),
    });

    const breakdownRecords = asNamedRows(payload, "breakdowns");
    const pmRecords = asNamedRows(payload, "pm_executions");
    const overhaulRecords = asNamedRows(payload, "overhauls");
    const spareRecords = asNamedRows(payload, "spares");

    const rows: HistoryRow[] = [
      ...breakdownRecords.map((rec, index) => ({
        id: `bd-${pickNum(rec, "breakdown_id") ?? index}-${index}`,
        view: "breakdowns" as const,
        tran_date: dmy(pickStr(rec, "tran_date")),
        spell_code: pickText(rec, "spell_code"),
        stop_datetime: dmyTime(pickStr(rec, "stop_datetime")),
        attended_datetime: dmyTime(pickStr(rec, "attended_datetime")),
        restart_datetime: dmyTime(pickStr(rec, "restart_datetime")),
        duration_min: pickNum(rec, "duration_min"),
        response_min: pickNum(rec, "response_min"),
        reason_code: pickText(rec, "reason_code"),
        reason_desc: pickText(rec, "reason_desc"),
        component_name: pickText(rec, "component_name"),
        discipline: pickText(rec, "discipline"),
        downtime_type: pickText(rec, "downtime_type"),
        attended_dept_name: pickText(rec, "attended_dept_name"),
        attended_by: pickText(rec, "attended_by"),
        root_cause: pickText(rec, "root_cause"),
        action_taken: pickText(rec, "action_taken"),
        preventive_action: pickText(rec, "preventive_action"),
        status: pickText(rec, "status"),
        remarks: pickText(rec, "remarks"),
      })),
      ...pmRecords.map((rec, index) => ({
        id: `pm-${pickNum(rec, "pm_exec_id") ?? index}-${index}`,
        view: "pm_executions" as const,
        pm_date: dmy(pickStr(rec, "pm_date")),
        frequency: pickText(rec, "frequency"),
        done_by: pickText(rec, "done_by"),
        downtime_min: pickNum(rec, "downtime_min"),
        next_due_date: dmy(pickStr(rec, "next_due_date")),
        task_count: pickNum(rec, "task_count"),
        not_ok_count: pickNum(rec, "not_ok_count"),
        remarks: pickText(rec, "remarks"),
      })),
      ...overhaulRecords.map((rec, index) => ({
        id: `oh-${pickNum(rec, "overhaul_id") ?? index}-${index}`,
        view: "overhauls" as const,
        overhaul_type: pickText(rec, "overhaul_type"),
        from_date: dmy(pickStr(rec, "from_date")),
        to_date: dmy(pickStr(rec, "to_date")),
        downtime_days: pickNum(rec, "downtime_days"),
        done_by: pickText(rec, "done_by"),
        party_name: pickText(rec, "party_name"),
        labour_cost: pickNum(rec, "labour_cost"),
        spare_cost: pickNum(rec, "spare_cost"),
        total_cost: pickNum(rec, "total_cost"),
        next_due_date: dmy(pickStr(rec, "next_due_date")),
        work_done: pickText(rec, "work_done"),
        remarks: pickText(rec, "remarks"),
      })),
      ...spareRecords.map((rec, index) => ({
        id: `sp-${pickText(rec, "source", "s")}-${pickNum(rec, "document_id") ?? index}-${index}`,
        view: "spares" as const,
        source: pickText(rec, "source"),
        document_date: dmy(pickStr(rec, "document_date")),
        item_code: pickText(rec, "item_code"),
        item_name: pickText(rec, "item_name"),
        uom_name: pickText(rec, "uom_name"),
        qty: pickNum(rec, "qty"),
        rate: pickNum(rec, "rate"),
        amount: pickNum(rec, "amount"),
        remarks: pickText(rec, "remarks"),
      })),
    ];

    // Failure rows only, matching the backend's failure-gated metric set.
    const failures = breakdownRecords.filter(
      (rec) => pickStr(rec, "downtime_type") === "BREAKDOWN",
    );
    return { rows, unattributed: unattributedPctFromRows(failures) };
  }, [reportParams]);

  const { rows, unattributed, loading, error, run } =
    useMechReportRun<HistoryRow>(fetcher, ready);

  const visibleRows = useMemo(
    () => rows.filter((row) => row.view === view),
    [rows, view],
  );
  const columns = useMemo(() => COLUMNS_BY_VIEW[view], [view]);

  const handleExport = useCallback(() => {
    void (async () => {
      const viewLabel =
        VIEW_OPTIONS.find((o) => o.code === view)?.label ?? "History";
      await exportRowsToExcel(
        columns,
        visibleRows,
        `mech-machine-history-${view}`,
        {
          companyName,
          branchName: branch?.branch_name,
          reportName: `Machine History — ${header?.machine_name ?? ""} (${viewLabel})`,
          reportNo: await resolveReportMenuId(pathname),
          reportFor: [dateFrom, dateTo].filter(Boolean).join(" To "),
        },
      );
    })();
  }, [
    columns,
    visibleRows,
    view,
    header?.machine_name,
    companyName,
    branch?.branch_name,
    pathname,
    dateFrom,
    dateTo,
  ]);

  const handleSubmit = useCallback(() => {
    void run();
  }, [run]);

  const exportDisabled = useMemo(
    () => visibleRows.length === 0 || filters.branchId == null,
    [visibleRows.length, filters.branchId],
  );

  const selectedView = useMemo(
    () => VIEW_OPTIONS.find((o) => o.code === view) ?? VIEW_OPTIONS[0],
    [view],
  );

  return (
    <Box sx={{ p: 3 }}>
      <MechReportTitle>Machine History Card</MechReportTitle>
      <UnattributedCaption value={unattributed} />

      {filters.mounted && (
        <MechFilterToolbar
          filters={filters}
          show={{ dates: true, machine: true, machineType: true, discipline: true }}
          machineRequired
          onSubmit={handleSubmit}
          onExport={handleExport}
          loading={loading}
          exportDisabled={exportDisabled}
        >
          <Box sx={{ minWidth: 220 }}>
            <SearchableSelect<ViewOption>
              variant="outlined"
              label="View"
              size="small"
              options={VIEW_OPTIONS}
              value={selectedView}
              onChange={(option) => setView(option?.code ?? "breakdowns")}
              getOptionLabel={(option) => option.label}
              getOptionKey={(option) => option.code}
              isOptionEqualToValue={(option, value) => option.code === value.code}
              clearable={false}
            />
          </Box>
        </MechFilterToolbar>
      )}

      {machineId == null ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">
            Select a machine to view its history
          </Typography>
        </Box>
      ) : (
        <>
          {header && <MachineHeaderCard header={header} />}
          <ReportGrid
            rows={visibleRows}
            columns={columns}
            getRowId={(row) => row.id}
            loading={loading}
            error={error}
            branchId={filters.branchId}
          />
        </>
      )}
    </Box>
  );
}

export default function MachineHistoryCardPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <MachineHistoryContent />
    </Suspense>
  );
}
