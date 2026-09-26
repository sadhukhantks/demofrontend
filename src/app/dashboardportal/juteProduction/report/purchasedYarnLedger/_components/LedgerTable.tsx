"use client";

/**
 * Main grid of the Purchased Yarn Ledger: one row per yarn item, a totals
 * row, and under each item an expandable per-department breakdown of the
 * floor movement.
 *
 * Built on the shared compact-table pieces (DprTable) rather than DataGrid:
 * the MIT DataGrid has no master-detail row, and the printed sheet must show
 * every department line whatever the screen state — so the detail rows are
 * always mounted, hidden with CSS while collapsed and forced visible in print,
 * exactly as the Winding & Weaving Difference sheet does for its mill-use
 * block.
 */

import React from "react";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  DprTable,
  NumTd,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../../dailyProductionReport/_components/DprPieces";
import type { LedgerFigures, LedgerRow } from "../_service";

export interface LedgerTableProps {
  rows: readonly LedgerRow[];
  totals: LedgerFigures;
  /** item_ids the backend flagged GODOWN_DIFF — the only rows whose
   *  difference is coloured red (the backend owns the tolerance). */
  flaggedDiffItems: ReadonlySet<number>;
  expanded: ReadonlySet<number>;
  onToggle: (itemId: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

/** Column count of the main table, for the detail row's colSpan. */
const MAIN_COLS = 13;

/** Difference cell: red text only when the backend flagged the item. */
function DiffTd({ value, bad = false, bold }: { value: number | null; bad?: boolean; bold?: boolean }) {
  return (
    <Td
      align="right"
      sx={{ color: bad ? "error.main" : undefined, fontWeight: bold || bad ? 700 : undefined }}
      data-diff-bad={bad ? "true" : undefined}
    >
      {fmt(value, 3)}
    </Td>
  );
}

/** Display name for an item whose master may lack a description. */
function itemLabel(row: LedgerRow): string {
  return row.item_name ?? row.item_code ?? `item ${row.item_id}`;
}

function YarnLabel({ row }: { row: LedgerRow }) {
  return (
    <Box>
      <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
        {itemLabel(row)}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {[row.yarn_count != null ? `${fmt(row.yarn_count, 1)} ct` : null, row.item_code]
          .filter(Boolean)
          .join(" · ") || " "}
      </Typography>
    </Box>
  );
}

export function LedgerTable({
  rows,
  totals,
  flaggedDiffItems,
  expanded,
  onToggle,
  onExpandAll,
  onCollapseAll,
}: LedgerTableProps) {
  const allOpen = rows.length > 0 && rows.every((r) => expanded.has(r.item_id));
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 0.75, displayPrint: "none" }}>
        <Button
          size="small"
          variant="text"
          onClick={allOpen ? onCollapseAll : onExpandAll}
          disabled={rows.length === 0}
        >
          {allOpen ? "Collapse all departments" : "Expand all departments"}
        </Button>
      </Stack>
      <DprTable
        head={
          <Tr>
            <Td sx={{ width: 36 }} />
            <Td>Yarn</Td>
            <Td align="right">Godown Opening</Td>
            <Td align="right">Purchases</Td>
            <Td align="right">Issues</Td>
            <Td align="right">Returns</Td>
            <Td align="right">Book Closing</Td>
            <Td align="right">Counted Closing</Td>
            <Td align="right">Difference</Td>
            <Td align="right">Floor Opening</Td>
            <Td align="right">Floor Closing</Td>
            <Td align="right">Consumption</Td>
            <Td align="right">Days of Stock</Td>
          </Tr>
        }
      >
        {rows.length === 0 ? (
          <Tr>
            <Td colSpan={MAIN_COLS}>
              <Typography variant="body2" color="text.secondary">
                No purchased yarn movement or stock in this month.
              </Typography>
            </Td>
          </Tr>
        ) : null}
        {rows.map((r) => {
          const open = expanded.has(r.item_id);
          const hasDepts = r.depts.length > 0;
          return (
            <React.Fragment key={r.item_id}>
              <Tr hover>
                <Td sx={{ px: 0.5 }}>
                  {hasDepts ? (
                    <IconButton
                      size="small"
                      aria-label={open ? "Hide departments" : "Show departments"}
                      aria-expanded={open}
                      onClick={() => onToggle(r.item_id)}
                      sx={{ displayPrint: "none" }}
                    >
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </IconButton>
                  ) : null}
                </Td>
                <Td>
                  <YarnLabel row={r} />
                </Td>
                <NumTd value={r.godown_opening_kg} digits={3} />
                <NumTd value={r.purchases_kg} digits={3} />
                <NumTd value={r.issues_kg} digits={3} />
                <NumTd value={r.returns_kg} digits={3} />
                <NumTd value={r.godown_book_closing_kg} digits={3} tone="neg-bad" />
                <NumTd value={r.godown_count_closing_kg} digits={3} />
                <DiffTd value={r.godown_diff_kg} bad={flaggedDiffItems.has(r.item_id)} />
                <NumTd value={r.floor_opening_kg} digits={3} />
                <NumTd value={r.floor_closing_kg} digits={3} />
                <NumTd value={r.consumption_kg} digits={3} />
                <NumTd value={r.days_of_stock} digits={1} />
              </Tr>
              {hasDepts ? (
                <Tr
                  data-testid={`dept-breakdown-${r.item_id}`}
                  sx={{
                    display: open ? "table-row" : "none",
                    displayPrint: "table-row",
                    "& > td": { bgcolor: "action.hover" },
                  }}
                >
                  <Td />
                  <Td colSpan={MAIN_COLS - 1} sx={{ py: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
                      {itemLabel(r)} — floor movement by department (kg)
                    </Typography>
                    <DprTable
                      head={
                        <Tr>
                          <Td>Department</Td>
                          <Td align="right">Floor Opening</Td>
                          <Td align="right">Issues</Td>
                          <Td align="right">Returns</Td>
                          <Td align="right">Floor Closing</Td>
                          <Td align="right">Consumption</Td>
                        </Tr>
                      }
                    >
                      {r.depts.map((d) => (
                        <Tr key={`${r.item_id}-${d.dept_id}`}>
                          <Td>{d.dept_desc ?? `dept ${d.dept_id}`}</Td>
                          <NumTd value={d.floor_opening_kg} digits={3} />
                          <NumTd value={d.issues_kg} digits={3} />
                          <NumTd value={d.returns_kg} digits={3} />
                          <NumTd value={d.floor_closing_kg} digits={3} />
                          <NumTd value={d.consumption_kg} digits={3} />
                        </Tr>
                      ))}
                    </DprTable>
                  </Td>
                </Tr>
              ) : null}
            </React.Fragment>
          );
        })}
        <Tr sx={totalRowSx()}>
          <Td />
          <Td>Total</Td>
          <NumTd value={totals.godown_opening_kg} digits={3} bold />
          <NumTd value={totals.purchases_kg} digits={3} bold />
          <NumTd value={totals.issues_kg} digits={3} bold />
          <NumTd value={totals.returns_kg} digits={3} bold />
          <NumTd value={totals.godown_book_closing_kg} digits={3} bold tone="neg-bad" />
          <NumTd value={totals.godown_count_closing_kg} digits={3} bold />
          <DiffTd value={totals.godown_diff_kg} bold />
          <NumTd value={totals.floor_opening_kg} digits={3} bold />
          <NumTd value={totals.floor_closing_kg} digits={3} bold />
          <NumTd value={totals.consumption_kg} digits={3} bold />
          <NumTd value={totals.days_of_stock} digits={1} bold />
        </Tr>
      </DprTable>
    </Box>
  );
}
