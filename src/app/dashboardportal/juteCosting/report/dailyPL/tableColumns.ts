/**
 * One column definition that serves three renderers: the desktop DataGrid
 * (via `toGridColumns`), the phone CompactTable (via `cellText`) and the
 * Excel export (the page runs the grid columns through `materializeGridRows`
 * first). Defining a column once keeps the phone view, the grid and the file
 * showing the same figures with the same formatting.
 *
 * Copy of spinningProductionTrend/tableColumns.ts with ONE change: a null
 * number cell prints "—" (not ""), because on this report null means "not
 * available" — power with no reading keyed, a per-tonne ratio on a day
 * without cloth — and must never read as 0 or as a blank.
 *
 * Excel: `buildReportSheet` reads `row[field]` and ignores `valueGetter`, so
 * handing it the nested day rows would export every money / per-tonne column
 * blank. The page therefore materialises the rows first
 * (`materializeGridRows` from components/reports/gridExportRows resolves each
 * getter); a null figure then stays an empty cell — not "—" and not 0.
 */

import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { fmtNum } from "@/components/reports/ReportGrid";

export interface Col<T extends GridValidRowModel> {
  field: string;
  header: string;
  /** Header on phones (defaults to `header`). */
  short?: string;
  /** Right-aligned number, formatted with `decimals` (default 2). */
  num?: boolean;
  decimals?: number;
  width?: number;
  /** Grow to fill the grid (desktop only). */
  flex?: boolean;
  minWidth?: number;
  /** Derived cell value — the grid gets it as a valueGetter; the phone table
   * calls it directly and the Excel export resolves it via materializeGridRows. */
  value?: (row: T) => string | number | null;
  /** Hide on phones (default shown). */
  phone?: boolean;
  /** Header tooltip, e.g. the full date behind a dd/mm header. */
  description?: string;
}

/** Text of a number cell: fixed decimals; "—" when the figure is not available. */
export function fmtCell(value: unknown, decimals: number): string {
  return value == null ? "—" : fmtNum(value, decimals);
}

export function toGridColumns<T extends GridValidRowModel>(cols: Col<T>[]): GridColDef<T>[] {
  return cols.map((c) => {
    const def: GridColDef<T> = { field: c.field, headerName: c.header };
    if (c.description) def.description = c.description;
    if (c.flex) {
      def.flex = 1;
      def.minWidth = c.minWidth ?? 160;
    } else {
      def.width = c.width ?? (c.num ? 110 : 120);
    }
    const getter = c.value;
    if (getter) def.valueGetter = (_value: unknown, row: T) => getter(row);
    if (c.num) {
      def.type = "number";
      const decimals = c.decimals ?? 2;
      def.valueFormatter = (value: unknown) => fmtCell(value, decimals);
    }
    return def;
  });
}

/** The columns a phone shows — everything not marked `phone: false`. */
export function phoneColumns<T extends GridValidRowModel>(cols: Col<T>[]): Col<T>[] {
  return cols.filter((c) => c.phone !== false);
}

/** Display text of one cell, resolved the way the grid resolves it. */
export function cellText<T extends GridValidRowModel>(col: Col<T>, row: T): string {
  const raw = col.value ? col.value(row) : (row as Record<string, unknown>)[col.field];
  if (col.num) return fmtCell(raw, col.decimals ?? 2);
  return raw == null ? "" : String(raw);
}
