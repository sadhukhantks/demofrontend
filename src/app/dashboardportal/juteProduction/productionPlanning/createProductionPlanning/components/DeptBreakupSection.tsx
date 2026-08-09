"use client";

import * as React from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import type { DeptCalcKey, DeptLineUI } from "../types/productionPlanningTypes";
import { STAGES } from "../utils/planningConstants";
import { CalcCell, NumCell, SectionHeader, TextCell, compactTableSx } from "./PlanningCells";

export type DeptBreakupSectionProps = {
  lines: readonly DeptLineUI[];
  disabled: boolean;
  warningUids: ReadonlySet<string>;
  onPatchLine: (uid: string, patch: Partial<DeptLineUI>) => void;
  onCalcCell: (uid: string, key: DeptCalcKey, value: number) => void;
  onRecalculate: () => void;
};

/**
 * Section 3 — dept-wise breakup / machines required, one row per stage in flow
 * order (BATCHING → … → WEAVING). BATCHING input is the headline raw-jute
 * requirement; WINDING counts are labelled Machines / Workers (person-keyed).
 */
export default function DeptBreakupSection({
  lines,
  disabled,
  warningUids,
  onPatchLine,
  onCalcCell,
  onRecalculate,
}: DeptBreakupSectionProps) {
  const machineLabel = (line: DeptLineUI): string =>
    STAGES.find((s) => s.stage_code === line.stage_code)?.machine_label ?? "Machines";

  return (
    <Box>
      <SectionHeader
        title="3. Department-wise Breakup / Machines Required"
        subtitle="Backward material chain — each stage's input feeds the stage above"
        disabled={disabled}
        onRecalculate={onRecalculate}
      />
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ ...compactTableSx, minWidth: 980 }}>
          <TableHead>
            <TableRow>
              <TableCell>Stage</TableCell>
              <TableCell>Output Kg/Day</TableCell>
              <TableCell>Waste %</TableCell>
              <TableCell>Input Kg/Day</TableCell>
              <TableCell>Kg/Machine/Shift</TableCell>
              <TableCell>Required</TableCell>
              <TableCell>A</TableCell>
              <TableCell>B</TableCell>
              <TableCell>C</TableCell>
              <TableCell>Installed</TableCell>
              <TableCell>Maint.</TableCell>
              <TableCell>Ready</TableCell>
              <TableCell>Remarks</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.uid}
                sx={
                  warningUids.has(line.uid)
                    ? { bgcolor: (t: Theme) => alpha(t.palette.warning.main, 0.12) }
                    : undefined
                }
              >
                <TableCell sx={{ textAlign: "left" }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {line.stage_seq}. {line.stage_label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.6rem" }}>
                    {machineLabel(line)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <CalcCell field={line.output_kg_day} onChange={(v) => onCalcCell(line.uid, "output_kg_day", v)} disabled={disabled} width={86} />
                </TableCell>
                <TableCell>
                  <NumCell value={line.waste_pct} onChange={(v) => onPatchLine(line.uid, { waste_pct: v })} disabled={disabled} width={56} />
                </TableCell>
                <TableCell>
                  <CalcCell
                    field={line.input_kg_day}
                    onChange={(v) => onCalcCell(line.uid, "input_kg_day", v)}
                    disabled={disabled}
                    width={86}
                    helper={line.stage_code === "BATCHING" ? "raw jute/day" : undefined}
                  />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.kg_per_machine} onChange={(v) => onCalcCell(line.uid, "kg_per_machine", v)} disabled={disabled} width={80} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.machines_required} onChange={(v) => onCalcCell(line.uid, "machines_required", v)} disabled={disabled} width={64} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.machines_a} onChange={(v) => onCalcCell(line.uid, "machines_a", v)} disabled={disabled} width={56} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.machines_b} onChange={(v) => onCalcCell(line.uid, "machines_b", v)} disabled={disabled} width={56} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.machines_c} onChange={(v) => onCalcCell(line.uid, "machines_c", v)} disabled={disabled} width={56} />
                </TableCell>
                <TableCell>
                  <NumCell
                    value={line.machines_installed ?? 0}
                    onChange={(v) => onPatchLine(line.uid, { machines_installed: v })}
                    disabled={disabled}
                    width={60}
                  />
                </TableCell>
                <TableCell>
                  <NumCell
                    value={line.machines_maint ?? 0}
                    onChange={(v) => onPatchLine(line.uid, { machines_maint: v })}
                    disabled={disabled}
                    width={56}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {line.machines_ready ?? "—"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <TextCell value={line.remarks} onChange={(v) => onPatchLine(line.uid, { remarks: v })} disabled={disabled} width={110} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
