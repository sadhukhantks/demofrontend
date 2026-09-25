/**
 * Doff entries on paper / as a file (TKT-000189): the department in-charge
 * asks for "machine-wise doff given", so the export is sorted by machine
 * (numeric-aware, SF-2 before SF-10) and ends with a Total line. Pure data
 * shaping — the grid component wires it to the shared Excel / PDF / print
 * helpers. Exports every loaded row of the day/spell, not the grid page.
 */
import type { GridColDef } from "@mui/x-data-grid";
import type { GridSection } from "@/components/reports/gridSections";
import type { DoffEntryRow } from "../types/spinningTypes";

export type DoffExportRow = DoffEntryRow & { id: number };

const numericAware = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Machine first, so the sheet reads like the in-charge's doff register. */
export const DOFF_EXPORT_COLUMNS: GridColDef<DoffExportRow>[] = [
	{ field: "mech_code", headerName: "Mc Code", width: 100 },
	{ field: "machine_name", headerName: "Machine", width: 170 },
	{ field: "doff_date", headerName: "Date", width: 110 },
	{ field: "spell_code", headerName: "Spell", width: 70 },
	{ field: "trolly_name", headerName: "Trolly", width: 130 },
	{ field: "item_code", headerName: "Yarn", width: 110 },
	{ field: "eb_name", headerName: "Operator", width: 150 },
	{ field: "item_source", headerName: "Yarn Source", width: 100 },
	{ field: "eb_source", headerName: "Operator Source", width: 120 },
	{ field: "gross_weight", headerName: "Gross", type: "number", width: 90 },
	{ field: "tare_weight", headerName: "Tare", type: "number", width: 90 },
	{ field: "net_weight", headerName: "Net", type: "number", width: 90 },
	{ field: "daily_doff_tbl_id", headerName: "Doff ID", width: 80 },
];

export function doffRowsMachineWise(rows: DoffEntryRow[]): DoffEntryRow[] {
	return [...rows].sort(
		(a, b) =>
			numericAware.compare(a.mech_code ?? "", b.mech_code ?? "") ||
			numericAware.compare(a.machine_name ?? "", b.machine_name ?? "") ||
			a.daily_doff_tbl_id - b.daily_doff_tbl_id
	);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Total line: doff count in the Machine column, weights summed. The lead cell
 * reads "Total" so buildReportSheet shades it like the grids' total rows. */
export function doffTotalRow(rows: DoffEntryRow[]): DoffExportRow {
	const sum = (pick: (r: DoffEntryRow) => number) =>
		round3(rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0));
	return {
		id: -1,
		daily_doff_tbl_id: 0,
		doff_date: "",
		spell_id: 0,
		spell_code: "",
		mc_id: 0,
		mech_code: "Total",
		machine_name: `${rows.length} doff(s)`,
		trolly_id: 0,
		trolly_name: "",
		item_id: null,
		item_source: "",
		item_code: "",
		item_name: "",
		eb_id: null,
		eb_source: "",
		eb_name: "",
		gross_weight: sum((r) => r.gross_weight),
		tare_weight: sum((r) => r.tare_weight),
		net_weight: sum((r) => r.net_weight),
	};
}

/** The one section every export format takes: machine-wise rows + Total. */
export function doffEntriesSection(rows: DoffEntryRow[], title = "Doff entries"): GridSection<DoffExportRow> {
	const sorted = doffRowsMachineWise(rows).map<DoffExportRow>((r) => ({ ...r, id: r.daily_doff_tbl_id }));
	const withTotal: DoffExportRow[] = sorted.length
		? [
				...sorted,
				{ ...doffTotalRow(rows), daily_doff_tbl_id: "" as unknown as number },
			]
		: [];
	return { title, columns: DOFF_EXPORT_COLUMNS, rows: withTotal };
}

/** "2026-09-23 (Spell A)" when a spell is selected, else just the date. */
export function doffPeriodLabel(date: string, rows: DoffEntryRow[], spellId: number | null): string {
	const spell = spellId == null ? null : (rows.find((r) => r.spell_id === spellId)?.spell_code ?? null);
	return spell ? `${date} (Spell ${spell})` : date;
}
