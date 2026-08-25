"use client";

import * as React from "react";
import { Autocomplete, Box, Button, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { Plus, Trash2 } from "lucide-react";
import type { YarnItemOption } from "@/utils/juteProductionPlanningService";
import type {
  YarnCalcKey,
  YarnLineUI,
  YarnSection,
} from "../types/productionPlanningTypes";
import { YARN_SECTIONS } from "../utils/planningConstants";
import { round1, saleDailyCommitment } from "../utils/planningCalc";
import { CalcCell, NumCell, SectionHeader, TextCell, compactTableSx } from "./PlanningCells";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";

export type YarnPlanSectionProps = {
  lines: readonly YarnLineUI[];
  yarnItems: readonly YarnItemOption[];
  disabled: boolean;
  warningUids: ReadonlySet<string>;
  onAddPctLine: (section: YarnSection) => void;
  onAddSaleLine: () => void;
  onRemoveLine: (uid: string) => void;
  onPatchLine: (uid: string, patch: Partial<YarnLineUI>) => void;
  onCalcCell: (uid: string, key: YarnCalcKey, value: number) => void;
  onYarnChange: (uid: string, yarnItemId: number | null, yarnDesc: string) => void;
  onRecalculate: () => void;
};

/**
 * Section 2 — yarn requirement + frame allocation. CLOTH rows are cloth-driven
 * (derived WP/WT rows merge in automatically; SACKING-style % rows are added by
 * hand); SALE rows are order-driven with their own commitment/days math.
 */
export default function YarnPlanSection({
  lines,
  yarnItems,
  disabled,
  warningUids,
  onAddPctLine,
  onAddSaleLine,
  onRemoveLine,
  onPatchLine,
  onCalcCell,
  onYarnChange,
  onRecalculate,
}: YarnPlanSectionProps) {
  const yarnOptions = React.useMemo(() => [...yarnItems], [yarnItems]);
  const clothLines = React.useMemo(() => lines.filter((l) => l.line_kind === "CLOTH"), [lines]);
  const saleLines = React.useMemo(() => lines.filter((l) => l.line_kind === "SALE"), [lines]);

  const rowSx = (uid: string) =>
    warningUids.has(uid) ? { bgcolor: (t: Theme) => alpha(t.palette.warning.main, 0.12) } : undefined;

  const renderYarnCell = (line: YarnLineUI) => (
    <Autocomplete<YarnItemOption>
      size="small"
      options={yarnOptions}
      getOptionLabel={(o) => o.item_name}
      isOptionEqualToValue={(o, v) => o.item_id === v.item_id}
      value={yarnOptions.find((o) => o.item_id === line.yarn_item_id) ?? null}
      onChange={(_e, value) => onYarnChange(line.uid, value?.item_id ?? null, value?.item_name ?? line.yarn_desc)}
      // Derived warp/weft rows get their yarn identity from Section 1's
      // warp/weft pickers — editing it here would be undone by the next
      // recalc (the derive step re-keys the row), so lock it like Section.
      disabled={disabled || (line.line_kind === "CLOTH" && line.warp_weft != null)}
      sx={{ width: 150 }}
      renderInput={(params) => <TextField {...params} variant="outlined" size="small" />}
    />
  );

  const renderRateCells = (line: YarnLineUI) => (
    <>
      <TableCell>
        <NumCell
          value={line.kg_per_frame_100}
          onChange={(v) => onPatchLine(line.uid, { kg_per_frame_100: v })}
          disabled={disabled}
          width={72}
        />
      </TableCell>
      <TableCell>
        <NumCell value={line.eff_pct} onChange={(v) => onPatchLine(line.uid, { eff_pct: v })} disabled={disabled} width={56} />
      </TableCell>
      <TableCell>
        <CalcCell
          field={line.kg_per_frame}
          onChange={(v) => onCalcCell(line.uid, "kg_per_frame", v)}
          disabled={disabled}
          width={72}
          helper={`${round1(line.frames_required.value / 3)} frames/shift`}
        />
      </TableCell>
    </>
  );

  const renderFramesCells = (line: YarnLineUI) => (
    <>
      <TableCell>
        <CalcCell field={line.frames_required} onChange={(v) => onCalcCell(line.uid, "frames_required", v)} disabled={disabled} width={64} />
      </TableCell>
      <TableCell>
        <CalcCell field={line.frames_a} onChange={(v) => onCalcCell(line.uid, "frames_a", v)} disabled={disabled} width={56} />
      </TableCell>
      <TableCell>
        <CalcCell field={line.frames_b} onChange={(v) => onCalcCell(line.uid, "frames_b", v)} disabled={disabled} width={56} />
      </TableCell>
      <TableCell>
        <CalcCell field={line.frames_c} onChange={(v) => onCalcCell(line.uid, "frames_c", v)} disabled={disabled} width={56} />
      </TableCell>
    </>
  );

  return (
    <Box>
      <SectionHeader
        title="2. Yarn Requirement & Frame Allocation"
        subtitle="Cloth-driven yarn (auto) + sale-order yarn (manual)"
        disabled={disabled}
        onRecalculate={onRecalculate}
      >
        <Button size="small" startIcon={<Plus size={13} />} onClick={() => onAddPctLine("SACKING")} disabled={disabled}>
          Add % line
        </Button>
        <Button size="small" startIcon={<Plus size={13} />} onClick={onAddSaleLine} disabled={disabled}>
          Add sale line
        </Button>
      </SectionHeader>

      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={compactTableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Section</TableCell>
              <TableCell>Yarn</TableCell>
              <TableCell>Desc</TableCell>
              <TableCell>WP/WT</TableCell>
              <TableCell>% of Prod</TableCell>
              <TableCell>Req A</TableCell>
              <TableCell>Req B</TableCell>
              <TableCell>Req C</TableCell>
              <TableCell>Req/Day</TableCell>
              <TableCell>Kg/Frame @100%</TableCell>
              <TableCell>Eff %</TableCell>
              <TableCell>Kg/Frame</TableCell>
              <TableCell>Frames Req</TableCell>
              <TableCell>Fr A</TableCell>
              <TableCell>Fr B</TableCell>
              <TableCell>Fr C</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Remarks</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {clothLines.map((line) => (
              <TableRow key={line.uid} sx={rowSx(line.uid)}>
                <TableCell>
                  <SearchableOptionSelect
                    size="small"
                    options={YARN_SECTIONS.map((s) => ({ value: s, label: s }))}
                    value={line.section}
                    onChange={(selectedValue) => onPatchLine(line.uid, { section: selectedValue as YarnSection })}
                    disabled={disabled || line.warp_weft != null}
                    sx={{
                      width: 104,
                      "& .MuiOutlinedInput-input": { fontSize: "0.75rem", padding: "3px 6px" },
                    }}
                  />
                </TableCell>
                <TableCell>{renderYarnCell(line)}</TableCell>
                <TableCell>
                  <TextCell value={line.yarn_desc} onChange={(v) => onPatchLine(line.uid, { yarn_desc: v })} disabled={disabled} width={110} />
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{line.warp_weft ?? "—"}</Typography>
                </TableCell>
                <TableCell>
                  {line.pct_of_prod != null ? (
                    <NumCell value={line.pct_of_prod} onChange={(v) => onPatchLine(line.uid, { pct_of_prod: v })} disabled={disabled} width={56} />
                  ) : (
                    <Typography variant="caption">—</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <CalcCell field={line.req_kg_a} onChange={(v) => onCalcCell(line.uid, "req_kg_a", v)} disabled={disabled} width={68} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.req_kg_b} onChange={(v) => onCalcCell(line.uid, "req_kg_b", v)} disabled={disabled} width={68} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.req_kg_c} onChange={(v) => onCalcCell(line.uid, "req_kg_c", v)} disabled={disabled} width={68} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.req_kg_day} onChange={(v) => onCalcCell(line.uid, "req_kg_day", v)} disabled={disabled} width={72} />
                </TableCell>
                {renderRateCells(line)}
                {renderFramesCells(line)}
                <TableCell>
                  <NumCell value={line.priority ?? 0} onChange={(v) => onPatchLine(line.uid, { priority: v || null })} disabled={disabled} width={52} />
                </TableCell>
                <TableCell>
                  <TextCell value={line.remarks} onChange={(v) => onPatchLine(line.uid, { remarks: v })} disabled={disabled} width={100} />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => onRemoveLine(line.uid)} disabled={disabled} aria-label="Remove line">
                    <Trash2 size={14} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {clothLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={19}>
                  <Typography variant="caption" color="text.secondary">
                    No cloth-driven yarn lines yet — they derive from Section 1 quality rows, or add a % line.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Box>

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>
        Sale-order yarn (order-driven)
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ ...compactTableSx, minWidth: 760 }}>
          <TableHead>
            <TableRow>
              <TableCell>Yarn</TableCell>
              <TableCell>Desc</TableCell>
              <TableCell>Order MT</TableCell>
              <TableCell>Kg/Frame @100%</TableCell>
              <TableCell>Eff %</TableCell>
              <TableCell>Kg/Frame</TableCell>
              <TableCell>Fr A</TableCell>
              <TableCell>Fr B</TableCell>
              <TableCell>Fr C</TableCell>
              <TableCell>Kg/Day</TableCell>
              <TableCell>Days Needed</TableCell>
              <TableCell>Delivery</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Remarks</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {saleLines.map((line) => (
              <TableRow key={line.uid} sx={rowSx(line.uid)}>
                <TableCell>{renderYarnCell(line)}</TableCell>
                <TableCell>
                  <TextCell value={line.yarn_desc} onChange={(v) => onPatchLine(line.uid, { yarn_desc: v })} disabled={disabled} width={110} />
                </TableCell>
                <TableCell>
                  <NumCell value={line.order_mt ?? 0} onChange={(v) => onPatchLine(line.uid, { order_mt: v })} disabled={disabled} width={64} />
                </TableCell>
                {renderRateCells(line)}
                <TableCell>
                  <CalcCell field={line.frames_a} onChange={(v) => onCalcCell(line.uid, "frames_a", v)} disabled={disabled} width={56} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.frames_b} onChange={(v) => onCalcCell(line.uid, "frames_b", v)} disabled={disabled} width={56} />
                </TableCell>
                <TableCell>
                  <CalcCell field={line.frames_c} onChange={(v) => onCalcCell(line.uid, "frames_c", v)} disabled={disabled} width={56} />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {saleDailyCommitment(line)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <CalcCell field={line.days_needed} onChange={(v) => onCalcCell(line.uid, "days_needed", v)} disabled={disabled} width={64} />
                </TableCell>
                <TableCell>
                  <TextField
                    type="date"
                    size="small"
                    value={line.delivery_date ?? ""}
                    onChange={(e) => onPatchLine(line.uid, { delivery_date: e.target.value || null })}
                    disabled={disabled}
                    inputProps={{ style: { fontSize: "0.72rem", padding: "3px 6px" } }}
                    sx={{ width: 130 }}
                  />
                </TableCell>
                <TableCell>
                  <NumCell value={line.priority ?? 0} onChange={(v) => onPatchLine(line.uid, { priority: v || null })} disabled={disabled} width={52} />
                </TableCell>
                <TableCell>
                  <TextCell value={line.remarks} onChange={(v) => onPatchLine(line.uid, { remarks: v })} disabled={disabled} width={100} />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => onRemoveLine(line.uid)} disabled={disabled} aria-label="Remove line">
                    <Trash2 size={14} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {saleLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15}>
                  <Typography variant="caption" color="text.secondary">
                    No sale-order yarn lines.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}
