"use client";

import * as React from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Plus, Trash2 } from "lucide-react";
import type { ClothQualityOption, YarnItemOption } from "@/utils/juteProductionPlanningService";
import type {
  LoomCalcKey,
  LoomLineUI,
  LoomTotals,
  ProductGroup,
} from "../types/productionPlanningTypes";
import { PRODUCT_GROUPS } from "../utils/planningConstants";
import { loomLineDayKg, round1, round3 } from "../utils/planningCalc";
import { CalcCell, NumCell, SectionHeader, TextCell, compactTableSx } from "./PlanningCells";

export type LoomPlanSectionProps = {
  lines: readonly LoomLineUI[];
  totals: LoomTotals;
  clothQualities: readonly ClothQualityOption[];
  yarnItems: readonly YarnItemOption[];
  disabled: boolean;
  warningUids: ReadonlySet<string>;
  onAddLine: (group: ProductGroup) => void;
  onRemoveLine: (uid: string) => void;
  onPatchLine: (uid: string, patch: Partial<LoomLineUI>) => void;
  onCalcCell: (uid: string, key: LoomCalcKey, value: number) => void;
  onQualityChange: (uid: string, qualityItemId: number | null, qualityDesc: string) => void;
  onRecalculate: () => void;
};

/** Number of shifts a row actually runs (for the kg/loom/day inline helper). */
function shiftsRun(line: LoomLineUI): number {
  return [line.looms_a, line.looms_b, line.looms_c].filter((v) => v > 0).length;
}

/**
 * Section 1 — loom/weaving plan grid, grouped by product group. Group-level
 * rows (no quality) feed the SACKING-style % yarn split; quality rows carry
 * warp/weft yarn + pct for the HESSIAN/PACKSHEET-style derivation.
 */
export default function LoomPlanSection({
  lines,
  totals,
  clothQualities,
  yarnItems,
  disabled,
  warningUids,
  onAddLine,
  onRemoveLine,
  onPatchLine,
  onCalcCell,
  onQualityChange,
  onRecalculate,
}: LoomPlanSectionProps) {
  const yarnOptions = React.useMemo(() => [...yarnItems], [yarnItems]);
  const qualityOptions = React.useMemo(() => [...clothQualities], [clothQualities]);

  const renderYarnSelect = (
    line: LoomLineUI,
    field: "warp_yarn_item_id" | "weft_yarn_item_id"
  ) => (
    <Autocomplete<YarnItemOption>
      size="small"
      options={yarnOptions}
      getOptionLabel={(o) => o.item_name}
      isOptionEqualToValue={(o, v) => o.item_id === v.item_id}
      value={yarnOptions.find((o) => o.item_id === line[field]) ?? null}
      onChange={(_e, value) => onPatchLine(line.uid, { [field]: value?.item_id ?? null })}
      disabled={disabled}
      sx={{ width: 140 }}
      renderInput={(params) => <TextField {...params} variant="outlined" size="small" />}
    />
  );

  const renderRow = (line: LoomLineUI) => {
    const warn = warningUids.has(line.uid);
    return (
      <TableRow
        key={line.uid}
        sx={warn ? { bgcolor: (t) => alpha(t.palette.warning.main, 0.12) } : undefined}
      >
        <TableCell>
          <Autocomplete<ClothQualityOption>
            size="small"
            options={qualityOptions}
            getOptionLabel={(o) => o.item_name}
            isOptionEqualToValue={(o, v) => o.item_id === v.item_id}
            value={qualityOptions.find((o) => o.item_id === line.quality_item_id) ?? null}
            onChange={(_e, value) =>
              onQualityChange(line.uid, value?.item_id ?? null, value?.item_name ?? line.quality_desc)
            }
            disabled={disabled}
            sx={{ width: 170 }}
            renderInput={(params) => (
              <TextField {...params} variant="outlined" size="small" placeholder="Group level" />
            )}
          />
        </TableCell>
        <TableCell>
          <TextCell
            value={line.quality_desc}
            onChange={(v) => onPatchLine(line.uid, { quality_desc: v })}
            disabled={disabled}
            width={130}
            placeholder="Description"
          />
        </TableCell>
        <TableCell>
          <NumCell value={line.looms_a} onChange={(v) => onPatchLine(line.uid, { looms_a: v })} disabled={disabled} width={62} />
        </TableCell>
        <TableCell>
          <NumCell value={line.looms_b} onChange={(v) => onPatchLine(line.uid, { looms_b: v })} disabled={disabled} width={62} />
        </TableCell>
        <TableCell>
          <NumCell value={line.looms_c} onChange={(v) => onPatchLine(line.uid, { looms_c: v })} disabled={disabled} width={62} />
        </TableCell>
        <TableCell>
          <NumCell
            value={line.kg_per_loom_100}
            onChange={(v) => onPatchLine(line.uid, { kg_per_loom_100: v })}
            disabled={disabled}
            width={72}
          />
        </TableCell>
        <TableCell>
          <NumCell value={line.eff_pct} onChange={(v) => onPatchLine(line.uid, { eff_pct: v })} disabled={disabled} width={58} />
        </TableCell>
        <TableCell>
          <CalcCell
            field={line.kg_per_loom}
            onChange={(v) => onCalcCell(line.uid, "kg_per_loom", v)}
            disabled={disabled}
            width={72}
            helper={`≈ ${round3(line.kg_per_loom.value * shiftsRun(line))} kg/loom/day`}
          />
        </TableCell>
        <TableCell>
          <CalcCell field={line.prod_a} onChange={(v) => onCalcCell(line.uid, "prod_a", v)} disabled={disabled} width={72} />
        </TableCell>
        <TableCell>
          <CalcCell field={line.prod_b} onChange={(v) => onCalcCell(line.uid, "prod_b", v)} disabled={disabled} width={72} />
        </TableCell>
        <TableCell>
          <CalcCell field={line.prod_c} onChange={(v) => onCalcCell(line.uid, "prod_c", v)} disabled={disabled} width={72} />
        </TableCell>
        <TableCell>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {loomLineDayKg(line)}
          </Typography>
        </TableCell>
        <TableCell>{renderYarnSelect(line, "warp_yarn_item_id")}</TableCell>
        <TableCell>
          <NumCell
            value={line.warp_pct ?? 0}
            onChange={(v) => onPatchLine(line.uid, { warp_pct: v })}
            disabled={disabled}
            width={56}
          />
        </TableCell>
        <TableCell>{renderYarnSelect(line, "weft_yarn_item_id")}</TableCell>
        <TableCell>
          <NumCell
            value={line.weft_pct ?? 0}
            onChange={(v) => onPatchLine(line.uid, { weft_pct: v })}
            disabled={disabled}
            width={56}
          />
        </TableCell>
        <TableCell>
          <TextCell
            value={line.remarks}
            onChange={(v) => onPatchLine(line.uid, { remarks: v })}
            disabled={disabled}
            width={110}
          />
        </TableCell>
        <TableCell>
          <IconButton size="small" onClick={() => onRemoveLine(line.uid)} disabled={disabled} aria-label="Remove line">
            <Trash2 size={14} />
          </IconButton>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box>
      <SectionHeader
        title="1. Loom Production Plan"
        subtitle="Looms per shift × kg/loom — cloth production by quality"
        disabled={disabled}
        onRecalculate={onRecalculate}
      />
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={compactTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Quality</TableCell>
              <TableCell>Description</TableCell>
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
              <TableCell>Warp Yarn</TableCell>
              <TableCell>Warp %</TableCell>
              <TableCell>Weft Yarn</TableCell>
              <TableCell>Weft %</TableCell>
              <TableCell>Remarks</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {PRODUCT_GROUPS.map((group) => {
              const groupLines = lines.filter((l) => l.product_group === group);
              const groupTotal = totals.byGroup[group];
              return (
                <React.Fragment key={group}>
                  <TableRow>
                    <TableCell colSpan={18} sx={{ textAlign: "left", bgcolor: "action.hover" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>
                          {group}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {groupTotal
                            ? `A ${groupTotal.a} • B ${groupTotal.b} • C ${groupTotal.c} • ${groupTotal.day} kg/day`
                            : "no lines"}
                        </Typography>
                        <Button
                          size="small"
                          startIcon={<Plus size={13} />}
                          onClick={() => onAddLine(group)}
                          disabled={disabled}
                          sx={{ py: 0, minHeight: 0 }}
                        >
                          Add row
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                  {groupLines.map(renderRow)}
                </React.Fragment>
              );
            })}
            <TableRow>
              <TableCell colSpan={8} sx={{ textAlign: "right", fontWeight: 700 }}>
                Total cloth
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{totals.grand.a}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{totals.grand.b}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{totals.grand.c}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{round1(totals.grand.day)}</TableCell>
              <TableCell colSpan={6} />
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
