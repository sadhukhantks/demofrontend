/**
 * Print-ready PDF for pages that are NOT a single DataGrid: custom-layout
 * report sheets (several small tables, warnings, a grand total) and single
 * documents (a header block, a line-item table, totals).
 *
 * The page builds a plain {@link TablesPdfSpec} — every cell already a display
 * string, exactly as the screen shows it — with a pure, unit-testable builder;
 * this module only lays it out: letterhead (company, title, subtitle lines), a
 * preface of notes/warnings, one autotable per section (blue header band,
 * shaded total rows, header row repeated across pages), closing lines, and
 * "Page n of m". Same fonts, sizes and colours as `exportRowsToPdf`.
 *
 * jspdf + jspdf-autotable are imported dynamically so they stay out of the
 * page bundle until someone downloads or prints.
 */
import type { jsPDF as JsPdf } from "jspdf";

/** One block of the document: a titled table or key/value grid. */
export interface PdfTableSection {
  /** Bold heading printed above the table. */
  title?: string;
  /** Smaller grey line under the heading. */
  subtitle?: string;
  /** Column headers. Omit for a key/value grid (no header band). */
  head?: string[];
  /** Body cells, already formatted for display. */
  body: string[][];
  /** Per-column alignment; defaults to left. */
  aligns?: ("left" | "right" | "center")[];
  /** Body row indexes to shade and bold (subtotal / total lines). */
  totalRows?: number[];
  /** [row, col] body cells shown greyed and struck through (not comparable). */
  struckCells?: [number, number][];
  /** [row, col] body cells shown greyed italic (e.g. "not comparable"). */
  mutedCells?: [number, number][];
  /** Column indexes printed bold (labels of a key/value grid). */
  boldCols?: number[];
  /** Small lines printed under the table (captions, mismatch notes). */
  notes?: string[];
}

/** A preface line (warning / info) printed above the first section. */
export interface PdfPrefaceLine {
  text: string;
  tone?: "normal" | "warning";
}

/** Everything the renderer needs; build it with a pure function per page. */
export interface TablesPdfSpec {
  /** File name without extension. */
  fileName: string;
  orientation?: "portrait" | "landscape";
  companyName?: string | null;
  title: string;
  /** Centered small lines under the title (branch, period, document no). */
  subtitleLines?: string[];
  preface?: PdfPrefaceLine[];
  sections: PdfTableSection[];
  /** Bold lines after the last section (grand totals). */
  closingLines?: string[];
  /** Small grey paragraph at the very end (report note / computer-generated note). */
  footNote?: string;
}

const BLUE: [number, number, number] = [62, 166, 218];
const TOTAL_FILL: [number, number, number] = [235, 235, 235];
const MUTED: [number, number, number] = [150, 150, 150];
const WARNING: [number, number, number] = [176, 96, 0];

/**
 * jsPDF's built-in Helvetica only covers WinAnsi (roughly Latin-1). Map the
 * typographic characters the screen uses (em dash for "no value", the minus
 * sign, the rupee sign, curly quotes) to ASCII, and replace anything else
 * outside Latin-1 so it cannot print as garbage. Accepts any value. Pure; tested.
 */
export function pdfSafeText(value: unknown): string {
  // API fields typed as strings sometimes arrive as numbers (document numbers,
  // ids); null/undefined print as empty.
  return (value == null ? "" : String(value))
    .replace(/[‒–—―−]/g, "-")
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\u0000-ÿ]/g, "?");
}

/** File-name-safe slug: keeps letters, digits, dot, dash, underscore. */
export function pdfFileSlug(s: string): string {
  return s.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function cellKey(r: number, c: number): string {
  return `${r}:${c}`;
}

/** Lay the spec out into a jsPDF document (not saved). */
export async function buildTablesPdf(spec: TablesPdfSpec): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: spec.orientation ?? "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const bottom = pageHeight - 12;
  const textWidth = pageWidth - marginX * 2;
  let y = 12;

  const ensureRoom = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = 12;
    }
  };
  const paragraph = (text: string, size: number, color: [number, number, number] | number, style = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    if (typeof color === "number") doc.setTextColor(color);
    else doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(pdfSafeText(text), textWidth) as string[];
    const lineH = size * 0.42;
    for (const line of lines) {
      ensureRoom(lineH);
      doc.text(line, marginX, y);
      y += lineH;
    }
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
  };

  // Letterhead
  if (spec.companyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(pdfSafeText(spec.companyName), pageWidth / 2, y, { align: "center" });
    y += 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(pdfSafeText(spec.title), pageWidth / 2, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  for (const line of [...(spec.subtitleLines ?? []), `Generated: ${new Date().toLocaleString()}`]) {
    doc.text(pdfSafeText(line), pageWidth / 2, y, { align: "center" });
    y += 4;
  }
  y += 2;

  for (const p of spec.preface ?? []) {
    paragraph(p.text, 8, p.tone === "warning" ? WARNING : 0, p.tone === "warning" ? "bold" : "normal");
    y += 1;
  }

  for (const s of spec.sections) {
    y += 3;
    if (s.title) {
      ensureRoom(14);
      paragraph(s.title, 10, 0, "bold");
    }
    if (s.subtitle) paragraph(s.subtitle, 7.5, 110);
    y += 1;

    const totals = new Set(s.totalRows ?? []);
    const struck = new Set((s.struckCells ?? []).map(([r, c]) => cellKey(r, c)));
    const muted = new Set((s.mutedCells ?? []).map(([r, c]) => cellKey(r, c)));
    const bold = new Set(s.boldCols ?? []);
    const aligns = s.aligns ?? [];

    autoTable(doc, {
      startY: y,
      head: s.head ? [s.head.map(pdfSafeText)] : undefined,
      body: s.body.map((r) => r.map(pdfSafeText)),
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 1.2,
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        textColor: 20,
      },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" },
      rowPageBreak: "avoid",
      columnStyles: Object.fromEntries(
        aligns.map((a, i) => [i, { halign: a }]),
      ),
      margin: { left: marginX, right: marginX, bottom: 12 },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const key = cellKey(data.row.index, data.column.index);
        if (bold.has(data.column.index)) data.cell.styles.fontStyle = "bold";
        if (totals.has(data.row.index)) {
          data.cell.styles.fillColor = TOTAL_FILL;
          data.cell.styles.fontStyle = "bold";
        }
        if (struck.has(key)) data.cell.styles.textColor = MUTED;
        if (muted.has(key)) {
          data.cell.styles.textColor = MUTED;
          data.cell.styles.fontStyle = "bolditalic";
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body" || !struck.has(cellKey(data.row.index, data.column.index))) return;
        const text = data.cell.text.join(" ");
        if (!text) return;
        const w = doc.getTextWidth(text);
        const right = data.cell.x + data.cell.width - data.cell.padding("right");
        const left = data.cell.x + data.cell.padding("left");
        const halign = data.cell.styles.halign;
        const x1 = halign === "right" ? right - w : halign === "center" ? data.cell.x + (data.cell.width - w) / 2 : left;
        const midY = data.cell.y + data.cell.height / 2;
        doc.setDrawColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.setLineWidth(0.2);
        doc.line(x1, midY, x1 + w, midY);
        doc.setDrawColor(0);
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;

    for (const n of s.notes ?? []) paragraph(n, 7, 90);
  }

  if (spec.closingLines?.length) {
    y += 3;
    for (const line of spec.closingLines) {
      ensureRoom(5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(pdfSafeText(line), pageWidth - marginX, y, { align: "right" });
      y += 5;
    }
    doc.setFont("helvetica", "normal");
  }

  if (spec.footNote) {
    y += 2;
    paragraph(spec.footNote, 7, 90);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(`Page ${i} of ${pages}`, pageWidth - marginX, pageHeight - 5, { align: "right" });
  }
  doc.setTextColor(0);
  return doc;
}

/** Build and save the PDF as `<fileName>.pdf`. No-op on the server. */
export async function downloadTablesPdf(spec: TablesPdfSpec): Promise<void> {
  if (typeof window === "undefined") return;
  const doc = await buildTablesPdf(spec);
  doc.save(`${spec.fileName}.pdf`);
}

/**
 * Build the same PDF and open it in a new tab with the print dialog armed, so
 * the paper copy is identical to the download. Falls back to saving the file
 * when the browser blocks the new tab (common on phones).
 */
export async function printTablesPdf(spec: TablesPdfSpec): Promise<void> {
  if (typeof window === "undefined") return;
  const doc = await buildTablesPdf(spec);
  doc.autoPrint();
  const url = doc.output("bloburl");
  const win = window.open(String(url), "_blank");
  if (!win) doc.save(`${spec.fileName}.pdf`);
}
