"use client";

import * as React from "react";
import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import CompanyHeaderBlock from "@/app/dashboardportal/procurement/_shared/PrintHeader";
import type { PlanningDocUI } from "../createProductionPlanning/types/productionPlanningTypes";
import {
  computeLoomTotals,
  computeSummary,
  deptMachinesAllocated,
  loomLineDayKg,
  round1,
  saleDailyCommitment,
  yarnFramesAllocated,
} from "../createProductionPlanning/utils/planningCalc";
import { PRODUCT_GROUPS, STAGES } from "../createProductionPlanning/utils/planningConstants";

export type ProductionPlanningPreviewProps = {
  doc: PlanningDocUI;
  coId?: string | number | null;
  branchName?: string;
};

const printTableSx = {
  borderCollapse: "collapse",
  width: "100%",
  mb: 2,
  "& th, & td": {
    border: "1px solid",
    borderColor: "text.primary",
    p: 0.4,
    fontSize: "0.7rem",
    textAlign: "center",
  },
  "& th": { fontWeight: 700 },
} as const;

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Print preview (Pattern A): the whole plan as one printable sheet — company
 * letterhead, title, Sections 1–3 as compact bordered tables mirroring the
 * mill's Excel, plus a machine-availability summary box. Forwarded ref wraps
 * the printable root so callers can pass `ref.current.innerHTML` to
 * `openStyledPrintWindow`.
 */
const ProductionPlanningPreview = React.forwardRef<HTMLDivElement, ProductionPlanningPreviewProps>(
  function ProductionPlanningPreview({ doc, coId, branchName }, ref) {
    const loomTotals = React.useMemo(() => computeLoomTotals(doc.loom_lines), [doc.loom_lines]);
    const summary = React.useMemo(() => computeSummary(doc, loomTotals), [doc, loomTotals]);
    const orderedDept = React.useMemo(
      () => [...doc.dept_lines].sort((a, b) => a.stage_seq - b.stage_seq),
      [doc.dept_lines]
    );

    return (
      <Box
        ref={ref}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          p: 3,
          bgcolor: "background.paper",
        }}
      >
        {/* Letterhead + title + doc identity */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <CompanyHeaderBlock coId={coId} branchId={doc.branch_id} branchLabel={branchName} />
          <Box sx={{ textAlign: "center", flexGrow: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              PRODUCTION PLANNING
            </Typography>
            {doc.plan_name ? <Typography variant="body2">{doc.plan_name}</Typography> : null}
          </Box>
          <Box sx={{ textAlign: "right", minWidth: 160 }}>
            <Typography variant="body2">
              <strong>Plan No:</strong> {doc.plan_no ?? "-"}
            </Typography>
            <Typography variant="body2">
              <strong>Date:</strong> {formatDate(doc.plan_date)}
            </Typography>
          </Box>
        </Stack>

        {/* Section 1 — loom plan */}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          1. Loom Production Plan
        </Typography>
        <Table size="small" sx={printTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Quality</TableCell>
              <TableCell>Looms A</TableCell>
              <TableCell>Looms B</TableCell>
              <TableCell>Looms C</TableCell>
              <TableCell>Kg/Loom @100%</TableCell>
              <TableCell>Eff %</TableCell>
              <TableCell>Kg/Loom</TableCell>
              <TableCell>Prod A</TableCell>
              <TableCell>Prod B</TableCell>
              <TableCell>Prod C</TableCell>
              <TableCell>Kg/Day</TableCell>
              <TableCell>Warp %</TableCell>
              <TableCell>Weft %</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {PRODUCT_GROUPS.map((group) => {
              const groupLines = doc.loom_lines.filter((l) => l.product_group === group);
              if (groupLines.length === 0) return null;
              const groupTotal = loomTotals.byGroup[group];
              return (
                <React.Fragment key={group}>
                  <TableRow>
                    <TableCell colSpan={13} sx={{ textAlign: "left", fontWeight: 700 }}>
                      {group}
                    </TableCell>
                  </TableRow>
                  {groupLines.map((line) => (
                    <TableRow key={line.uid}>
                      <TableCell sx={{ textAlign: "left" }}>{line.quality_desc || "(group)"}</TableCell>
                      <TableCell>{line.looms_a}</TableCell>
                      <TableCell>{line.looms_b}</TableCell>
                      <TableCell>{line.looms_c}</TableCell>
                      <TableCell>{line.kg_per_loom_100}</TableCell>
                      <TableCell>{line.eff_pct}</TableCell>
                      <TableCell>{line.kg_per_loom.value}</TableCell>
                      <TableCell>{line.prod_a.value}</TableCell>
                      <TableCell>{line.prod_b.value}</TableCell>
                      <TableCell>{line.prod_c.value}</TableCell>
                      <TableCell>{loomLineDayKg(line)}</TableCell>
                      <TableCell>{line.warp_pct ?? "-"}</TableCell>
                      <TableCell>{line.weft_pct ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ textAlign: "right", fontWeight: 700 }}>{group} total</TableCell>
                    <TableCell colSpan={6} />
                    <TableCell sx={{ fontWeight: 700 }}>{groupTotal?.a ?? 0}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{groupTotal?.b ?? 0}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{groupTotal?.c ?? 0}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{groupTotal?.day ?? 0}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </React.Fragment>
              );
            })}
            <TableRow>
              <TableCell sx={{ textAlign: "right", fontWeight: 700 }}>TOTAL CLOTH</TableCell>
              <TableCell colSpan={6} />
              <TableCell sx={{ fontWeight: 700 }}>{loomTotals.grand.a}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{loomTotals.grand.b}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{loomTotals.grand.c}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{loomTotals.grand.day}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableBody>
        </Table>

        {/* Section 2 — yarn requirement */}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          2. Yarn Requirement &amp; Frame Allocation
        </Typography>
        <Table size="small" sx={printTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Section</TableCell>
              <TableCell>Yarn</TableCell>
              <TableCell>WP/WT</TableCell>
              <TableCell>% Prod</TableCell>
              <TableCell>Req A</TableCell>
              <TableCell>Req B</TableCell>
              <TableCell>Req C</TableCell>
              <TableCell>Req/Day</TableCell>
              <TableCell>Kg/Frame</TableCell>
              <TableCell>Frames Req</TableCell>
              <TableCell>Fr A</TableCell>
              <TableCell>Fr B</TableCell>
              <TableCell>Fr C</TableCell>
              <TableCell>Order MT</TableCell>
              <TableCell>Days</TableCell>
              <TableCell>Delivery</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {doc.yarn_lines.map((line) => (
              <TableRow key={line.uid}>
                <TableCell>{line.section}</TableCell>
                <TableCell sx={{ textAlign: "left" }}>{line.yarn_desc || "-"}</TableCell>
                <TableCell>{line.warp_weft ?? "-"}</TableCell>
                <TableCell>{line.pct_of_prod ?? "-"}</TableCell>
                <TableCell>{line.req_kg_a.value}</TableCell>
                <TableCell>{line.req_kg_b.value}</TableCell>
                <TableCell>{line.req_kg_c.value}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  {line.line_kind === "SALE" ? saleDailyCommitment(line) : line.req_kg_day.value}
                </TableCell>
                <TableCell>{line.kg_per_frame.value}</TableCell>
                <TableCell>{line.frames_required.value}</TableCell>
                <TableCell>{line.frames_a.value}</TableCell>
                <TableCell>{line.frames_b.value}</TableCell>
                <TableCell>{line.frames_c.value}</TableCell>
                <TableCell>{line.order_mt ?? "-"}</TableCell>
                <TableCell>{line.line_kind === "SALE" ? line.days_needed.value : "-"}</TableCell>
                <TableCell>{line.delivery_date ? formatDate(line.delivery_date) : "-"}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={7} sx={{ textAlign: "right", fontWeight: 700 }}>
                Total yarn / frames
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{round1(summary.totalYarnKgDay)}</TableCell>
              <TableCell />
              <TableCell sx={{ fontWeight: 700 }}>{round1(summary.framesRequired)}</TableCell>
              <TableCell colSpan={3} sx={{ fontWeight: 700 }}>
                {round1(summary.framesAllocated)} allocated
              </TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableBody>
        </Table>

        {/* Section 3 — dept breakup */}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          3. Department-wise Breakup / Machines Required
        </Typography>
        <Table size="small" sx={printTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Stage</TableCell>
              <TableCell>Output Kg/Day</TableCell>
              <TableCell>Waste %</TableCell>
              <TableCell>Input Kg/Day</TableCell>
              <TableCell>Kg/Machine</TableCell>
              <TableCell>Required</TableCell>
              <TableCell>A</TableCell>
              <TableCell>B</TableCell>
              <TableCell>C</TableCell>
              <TableCell>Allocated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orderedDept.map((line) => (
              <TableRow key={line.uid}>
                <TableCell sx={{ textAlign: "left" }}>
                  {line.stage_seq}. {line.stage_label}
                  {line.stage_code === "WINDING" ? " (Machines / Workers)" : ""}
                </TableCell>
                <TableCell>{line.output_kg_day.value}</TableCell>
                <TableCell>{line.waste_pct}</TableCell>
                <TableCell sx={{ fontWeight: line.stage_code === "BATCHING" ? 700 : 400 }}>
                  {line.input_kg_day.value}
                </TableCell>
                <TableCell>{line.kg_per_machine.value}</TableCell>
                <TableCell>{line.machines_required.value}</TableCell>
                <TableCell>{line.machines_a.value}</TableCell>
                <TableCell>{line.machines_b.value}</TableCell>
                <TableCell>{line.machines_c.value}</TableCell>
                <TableCell>{round1(deptMachinesAllocated(line))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Machine availability summary box */}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Machine Availability
        </Typography>
        <Table size="small" sx={{ ...printTableSx, width: "auto", minWidth: 420 }}>
          <TableHead>
            <TableRow>
              <TableCell>Stage</TableCell>
              <TableCell>Installed</TableCell>
              <TableCell>Maintenance</TableCell>
              <TableCell>Ready</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orderedDept.map((line) => (
              <TableRow key={line.uid}>
                <TableCell sx={{ textAlign: "left" }}>
                  {STAGES.find((s) => s.stage_code === line.stage_code)?.stage_label ?? line.stage_label}
                </TableCell>
                <TableCell>{line.machines_installed ?? "-"}</TableCell>
                <TableCell>{line.machines_maint ?? "-"}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{line.machines_ready ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Headline figures */}
        <Stack direction="row" spacing={3} sx={{ mt: 2, flexWrap: "wrap" }}>
          <Typography variant="body2">
            <strong>Total cloth:</strong> {round1(summary.totalClothKgDay)} kg/day
          </Typography>
          <Typography variant="body2">
            <strong>Total yarn:</strong> {round1(summary.totalYarnKgDay)} kg/day
          </Typography>
          <Typography variant="body2">
            <strong>Raw jute required:</strong> {round1(summary.rawJuteKgDay)} kg/day
          </Typography>
        </Stack>
        {doc.remarks ? (
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>Remarks:</strong> {doc.remarks}
          </Typography>
        ) : null}
      </Box>
    );
  }
);

export default ProductionPlanningPreview;
