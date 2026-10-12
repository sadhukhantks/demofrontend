/**
 * One column definition that serves three renderers: the desktop DataGrid
 * (via `toGridColumns`), the phone CompactTable (via `cellText`) and the
 * Excel / PDF / print exports (which read the grid columns). Defining a
 * column once keeps the phone view, the grid and the files showing the same
 * figures with the same formatting.
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
  /** Derived cell value — the grid gets it as a valueGetter, so exports and
   * the phone table read exactly what the grid shows. */
  value?: (row: T) => string | number | null;
  /** Hide on phones (default shown). */
  phone?: boolean;
  /** Header tooltip, e.g. the full date behind a dd/mm header. */
  description?: string;
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
      def.valueFormatter = (value: unknown) => fmtNum(value, decimals);
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
  if (col.num) return fmtNum(raw, col.decimals ?? 2);
  return raw == null ? "" : String(raw);
}
