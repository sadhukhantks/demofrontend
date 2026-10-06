import type { JuteIssueYarnWiseApiRow } from "../types/reportTypes";

/** The two units the report can be read in (TKT-000214: "in kg or MT"). */
export type IssueUnit = "kg" | "mt";

/**
 * What the figures count (owner, on TKT-000214: "give filter button to exclude
 * wastage"):
 *   "all" — raw jute + wastage, the default; ties to the Jute Stock report.
 *   "raw" — raw jute only, wastage excluded.
 *
 * Wastage is the backend's definition, the one the Jute Stock report's
 * Raw / Waste split uses: process waste re-issued from the floor, plus MR
 * lines of a jute-waste item (purchased waste).
 */
export type WastageMode = "all" | "raw";

const KG_PER_MT = 1000;

/** `id` of the client-added Grand Total row. */
export const GRAND_TOTAL_ROW_ID = "grand-total";

/**
 * Grid row: whole-kg figures, their MT twins, and a stable id.
 *
 * Raw + wastage = total on every row, to the kg: total and wastage are each
 * rounded to whole kg off the API, raw is total less wastage. The MT twins
 * are each kg / 1000, so they agree at the three decimals printed.
 */
export interface IssueYarnWiseRow {
  id: string;
  /** null on the "(unassigned)" bucket and on the Grand Total row */
  yarn_type_id: number | null;
  yarn_type_name: string;
  /** Raw jute + wastage as loaded — the same in every view. */
  day_total_kg: number;
  mtd_total_kg: number;
  /** The wastage part of the totals — the same in every view. */
  day_waste_kg: number;
  mtd_waste_kg: number;
  /** Total less wastage — the same in every view. */
  day_raw_kg: number;
  mtd_raw_kg: number;
  day_total_mt: number;
  mtd_total_mt: number;
  day_waste_mt: number;
  mtd_waste_mt: number;
  day_raw_mt: number;
  mtd_raw_mt: number;
  /** What the "Excl. wastage" grid prints and what the cards lead with: the
   * total in the default view, the raw figure with wastage excluded. */
  day_issue_kg: number;
  mtd_issue_kg: number;
  day_issue_mt: number;
  mtd_issue_mt: number;
}

/** The loaded part of a row — what the API gives, rounded. */
type LoadedRow = Pick<
  IssueYarnWiseRow,
  "id" | "yarn_type_id" | "yarn_type_name" | "day_total_kg" | "mtd_total_kg" | "day_waste_kg" | "mtd_waste_kg"
>;

/** `+ 0` turns a rounded "-0" into "0". */
const wholeKg = (v: unknown): number => Math.round(Number(v) || 0) + 0;

const toMt = (kg: number): number => kg / KG_PER_MT;

/** Fill the derived figures of a row for one view. Raw jute is ALWAYS the
 * total less wastage, so raw + wastage equals the total to the kg. */
function shown(r: LoadedRow, mode: WastageMode): IssueYarnWiseRow {
  const dayRaw = r.day_total_kg - r.day_waste_kg;
  const mtdRaw = r.mtd_total_kg - r.mtd_waste_kg;
  const dayKg = mode === "raw" ? dayRaw : r.day_total_kg;
  const mtdKg = mode === "raw" ? mtdRaw : r.mtd_total_kg;
  return {
    ...r,
    day_raw_kg: dayRaw,
    mtd_raw_kg: mtdRaw,
    day_total_mt: toMt(r.day_total_kg),
    mtd_total_mt: toMt(r.mtd_total_kg),
    day_waste_mt: toMt(r.day_waste_kg),
    mtd_waste_mt: toMt(r.mtd_waste_kg),
    day_raw_mt: toMt(dayRaw),
    mtd_raw_mt: toMt(mtdRaw),
    day_issue_kg: dayKg,
    mtd_issue_kg: mtdKg,
    day_issue_mt: toMt(dayKg),
    mtd_issue_mt: toMt(mtdKg),
  };
}

/**
 * API rows -> the loaded rows (raw jute + wastage, no Grand Total yet).
 *
 * Kg is rounded to whole kg on the ROW VALUE (same rule as the Jute Stock
 * report, TKT-000155), and MT is derived from that rounded kg — so the grid,
 * the summary cards, the Grand Total row and the Excel/PDF exports all carry
 * one number, and the MT column is always exactly the kg column / 1000.
 *
 * A quality whose day and month totals both round to 0 is dropped rather than
 * printed as a line of zeros.
 */
export function toIssueYarnWiseRows(
  apiRows: JuteIssueYarnWiseApiRow[],
): IssueYarnWiseRow[] {
  return apiRows
    .map((r, i) =>
      shown(
        {
          // The index keeps ids unique even if two rows ever share a yarn id.
          id: `yarn-${r.yarn_type_id ?? "none"}-${i}`,
          yarn_type_id: r.yarn_type_id,
          yarn_type_name: r.yarn_type_name,
          day_total_kg: wholeKg(r.day_issue_kg),
          mtd_total_kg: wholeKg(r.mtd_issue_kg),
          day_waste_kg: wholeKg(r.day_waste_kg),
          mtd_waste_kg: wholeKg(r.mtd_waste_kg),
        },
        "all",
      ),
    )
    .filter((r) => r.day_total_kg !== 0 || r.mtd_total_kg !== 0);
}

/**
 * The rows to show for one view of the loaded rows, Grand Total last.
 *
 * "all" prints every loaded row — raw, wastage and total side by side. "raw"
 * prints raw jute only and drops a quality that was issued nothing but
 * wastage — the same rule that keeps a line of zeros out of the default view.
 *
 * The Grand Total row sums what is printed; its total / wastage parts are
 * summed over EVERY loaded row, so the page can still say how much wastage
 * the "raw" view left out, including on qualities it dropped. It is appended
 * whenever anything was loaded, even if the view dropped every row.
 *
 * Safe to call on its own output: any Grand Total row passed in is ignored
 * and the printed figures are re-derived from the total / wastage parts.
 */
export function issueYarnWiseView(
  rows: IssueYarnWiseRow[],
  mode: WastageMode,
): IssueYarnWiseRow[] {
  const loaded = rows.filter((r) => r.id !== GRAND_TOTAL_ROW_ID);
  if (loaded.length === 0) return [];
  const visible = loaded
    .map((r) => shown(r, mode))
    .filter((r) => r.day_issue_kg !== 0 || r.mtd_issue_kg !== 0);
  const sum = (f: "day_total_kg" | "mtd_total_kg" | "day_waste_kg" | "mtd_waste_kg") =>
    loaded.reduce((acc, r) => acc + r[f], 0);
  return [
    ...visible,
    shown(
      {
        id: GRAND_TOTAL_ROW_ID,
        yarn_type_id: null,
        // "Grand Total" is what ReportGrid and the Excel export key the bold
        // total-row styling on.
        yarn_type_name: "Grand Total",
        day_total_kg: sum("day_total_kg"),
        mtd_total_kg: sum("mtd_total_kg"),
        day_waste_kg: sum("day_waste_kg"),
        mtd_waste_kg: sum("mtd_waste_kg"),
      },
      mode,
    ),
  ];
}

/** One period's figures for the summary cards, whole kg. */
export interface IssueSplit {
  /** What the grid's Grand Total prints in the current view. */
  shown: number;
  /** Raw jute + wastage, whatever the view. */
  total: number;
  raw: number;
  wastage: number;
}

/** Day and month-to-date figures for the summary cards, read off the Grand
 * Total row of a view (zeros when nothing was loaded). */
export function issueTotals(viewRows: IssueYarnWiseRow[]): {
  day: IssueSplit;
  mtd: IssueSplit;
} {
  const t = viewRows.find((r) => r.id === GRAND_TOTAL_ROW_ID);
  const split = (shownKg = 0, total = 0, wastage = 0): IssueSplit => ({
    shown: shownKg,
    total,
    raw: total - wastage,
    wastage,
  });
  return {
    day: split(t?.day_issue_kg, t?.day_total_kg, t?.day_waste_kg),
    mtd: split(t?.mtd_issue_kg, t?.mtd_total_kg, t?.mtd_waste_kg),
  };
}

/** Display text for a weight in the chosen unit: whole kg, or MT to 3 places
 * (1 kg), with Indian digit grouping. */
export function formatIssueWeight(kg: number, unit: IssueUnit): string {
  return unit === "kg"
    ? `${kg.toLocaleString("en-IN", { maximumFractionDigits: 0 })} kg`
    : `${toMt(kg).toLocaleString("en-IN", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })} MT`;
}

/** The words that say which figures a page or an export carries — on the
 * heading, in the Excel/PDF title block and in the export file name. */
export const WASTAGE_MODE_TEXT: Record<
  WastageMode,
  { button: string; title: string; file: string }
> = {
  all: {
    button: "Incl. wastage",
    title: "raw jute + wastage",
    file: "incl-wastage",
  },
  raw: {
    button: "Excl. wastage",
    title: "raw jute only, wastage excluded",
    file: "excl-wastage",
  },
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-10-04" -> "04 Oct 2026". Parsed by hand: `new Date("2026-10-04")` is
 * UTC midnight and prints the previous day west of Greenwich. Anything that is
 * not YYYY-MM-DD is returned unchanged. */
export function formatReportDay(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${m[3]} ${month} ${m[1]}` : isoDate;
}

/** First day of `isoDate`'s month — the start of the month-to-date window,
 * same rule as the backend. */
export function monthStartIso(isoDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate)
    ? `${isoDate.slice(0, 8)}01`
    : isoDate;
}
