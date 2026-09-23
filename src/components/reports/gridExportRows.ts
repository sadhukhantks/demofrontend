/**
 * Materialises DataGrid columns for export.
 *
 * `buildReportSheet` (exportExcel.ts) reads `row[field]` straight off the row,
 * so a column that derives its value in a `valueGetter` — pivot columns keyed
 * by date or spell, "x of y" summaries — exports blank. The helpers here
 * resolve each column the way the grid does (valueGetter, then valueFormatter
 * for display text) and hand back plain rows keyed by field, so the sheet and
 * the print-out show exactly what the grid shows.
 */
import type { GridColDef, GridValidRowModel } from "@mui/x-data-grid";
import { pdfCellText } from "./exportPdf";

/** Plain row with one entry per export column, keyed by `field`. */
export type ExportRow = Record<string, unknown> & { id: number };

/** Raw cell value as the grid computes it (valueGetter when present). */
export function gridCellValue<T extends GridValidRowModel>(
  col: GridColDef<T>,
  row: T,
): unknown {
  const raw = (row as Record<string, unknown>)[col.field];
  if (col.valueGetter) {
    return col.valueGetter(raw as never, row, col, undefined as never);
  }
  return raw;
}

/** Display text for a cell (valueGetter, then valueFormatter; null -> "") —
 * the same resolution the PDF export uses, re-exported under the name the
 * Excel/print helpers read. */
export const gridCellText: <T extends GridValidRowModel>(
  col: GridColDef<T>,
  row: T,
) => string = pdfCellText;

/** True for columns that only render widgets (edit/delete buttons, chips)
 * and carry no exportable value: no field on the row, no valueGetter. */
export function isDataColumn<T extends GridValidRowModel>(
  col: GridColDef<T>,
  sample?: T,
): boolean {
  if (col.valueGetter) return true;
  if (!sample) return true;
  return col.field in (sample as Record<string, unknown>);
}

/**
 * Flattens `rows` into plain objects with one key per column. Numeric columns
 * (`type: "number"`) keep their number so the sheet stays numeric; other
 * columns with a valueFormatter take the formatted text (a status code
 * becomes "LOW"). The returned columns are the same defs minus the callbacks,
 * so a sheet builder that reads `row[field]` gets the grid's values.
 */
export function materializeGridRows<T extends GridValidRowModel>(
  columns: GridColDef<T>[],
  rows: T[],
): { columns: GridColDef<ExportRow>[]; rows: ExportRow[] } {
  const dataCols = columns.filter((c) => isDataColumn(c, rows[0]));
  const outRows: ExportRow[] = rows.map((row, i) => {
    const out: ExportRow = { id: i };
    for (const col of dataCols) {
      if (col.type === "number") {
        const v = gridCellValue(col, row);
        const n = v == null || v === "" ? null : Number(v);
        out[col.field] = n != null && Number.isFinite(n) ? n : null;
      } else {
        out[col.field] = gridCellText(col, row);
      }
    }
    return out;
  });
  const outCols: GridColDef<ExportRow>[] = dataCols.map((c) => ({
    field: c.field,
    headerName: c.headerName ?? c.field,
    type: c.type,
    width: c.width,
    description: c.description,
  }));
  return { columns: outCols, rows: outRows };
}
