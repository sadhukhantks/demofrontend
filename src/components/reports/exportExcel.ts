import { GridColDef, GridValidRowModel } from "@mui/x-data-grid";

/**
 * Export grid rows to a real .xlsx file using the grid's own column defs.
 * Header = each column's headerName; cell = the raw row value for that field
 * (numbers stay numeric in the sheet). Filename gets a timestamp so repeated
 * exports don't collide.
 *
 * xlsx + file-saver are imported dynamically so the heavy spreadsheet lib is
 * loaded only when the user actually exports — it stays out of the page bundle.
 *
 * ponytail: exports raw field values (no valueFormatter) — numeric columns
 * land as numbers; a couple of coded columns (e.g. txn type R/I) export their
 * code. Map them through the formatter only if a prettier sheet is needed.
 */
export async function exportRowsToExcel<T extends GridValidRowModel>(
  columns: GridColDef<T>[],
  rows: T[],
  fileNamePrefix = "jute-report",
): Promise<void> {
  const XLSX = await import("xlsx");
  const { saveAs } = await import("file-saver");

  const header = columns.map((c) => c.headerName ?? String(c.field));
  const data = rows.map((row) =>
    columns.reduce<Record<string, unknown>>((acc, c) => {
      const key = c.headerName ?? String(c.field);
      acc[key] = (row as Record<string, unknown>)[c.field as string] ?? "";
      return acc;
    }, {}),
  );

  const ws = XLSX.utils.json_to_sheet(data, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([out], { type: "application/octet-stream" }),
    `${fileNamePrefix}-${Date.now()}.xlsx`,
  );
}
