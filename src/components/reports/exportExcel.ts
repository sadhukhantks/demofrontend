import { GridColDef, GridValidRowModel } from "@mui/x-data-grid";

/** Optional report header block prepended above the column headers in the sheet. */
export interface ReportExportHeader {
  companyName?: string | null;
  branchName?: string | null;
  reportName?: string | null;
  reportNo?: string | number | null;
  /** Period line, e.g. "2026-07-01 To 2026-07-14" or a single as-on date. */
  reportFor?: string | null;
}

/**
 * Export grid rows to a real .xlsx file using the grid's own column defs.
 * Header = each column's headerName; cell = the raw row value for that field
 * (numbers stay numeric in the sheet). Filename gets a timestamp so repeated
 * exports don't collide. When `header` is given, a report header block
 * (Company / Branch / Report / Report No / Report For) is written above the
 * column headers.
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
  header?: ReportExportHeader,
): Promise<void> {
  const XLSX = await import("xlsx");
  const { saveAs } = await import("file-saver");

  const colHeader = columns.map((c) => c.headerName ?? String(c.field));
  const data = rows.map((row) =>
    columns.reduce<Record<string, unknown>>((acc, c) => {
      const key = c.headerName ?? String(c.field);
      acc[key] = (row as Record<string, unknown>)[c.field as string] ?? "";
      return acc;
    }, {}),
  );

  const meta: (string | number)[][] = [];
  if (header) {
    if (header.companyName) meta.push(["Company:", header.companyName]);
    if (header.branchName) meta.push(["Branch:", header.branchName]);
    if (header.reportName) meta.push(["Report:", header.reportName]);
    if (header.reportNo != null && header.reportNo !== "") {
      meta.push(["Report No:", header.reportNo]);
    }
    if (header.reportFor) meta.push(["Report For:", header.reportFor]);
    if (meta.length) meta.push([]); // blank spacer row before the column headers
  }

  let ws;
  if (meta.length) {
    ws = XLSX.utils.aoa_to_sheet(meta);
    XLSX.utils.sheet_add_json(ws, data, { header: colHeader, origin: meta.length });
  } else {
    ws = XLSX.utils.json_to_sheet(data, { header: colHeader });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(
    new Blob([out], { type: "application/octet-stream" }),
    `${fileNamePrefix}-${Date.now()}.xlsx`,
  );
}
