/**
 * Pure state helpers for the Jute Gain/Loss Sheet entry page.
 *
 * The page keeps every numeric cell as a raw string (so partial input like
 * "-" or "1." never fights the user); these helpers hydrate drafts from the
 * backend payloads, compute totals, validate, and serialize back into the
 * GlSheetSavePayload contract from src/utils/juteGainLossService.ts.
 */

import type {
	GlDeptMst,
	GlFigureRowMst,
	GlProdStatement,
	GlQualityType,
	GlSheet,
	GlSheetSavePayload,
} from "@/utils/juteGainLossService";

// ---------------------------------------------------------------------------
// Draft (editable) row shapes — all numeric cells are strings
// ---------------------------------------------------------------------------

export interface FigureDraft {
	gl_row_id: number;
	hess: string;
	sack: string;
}

export interface ProdDraft {
	/** Client-only key for React lists / add-remove; never sent to the API. */
	uid: number;
	statement: GlProdStatement;
	quality_type: GlQualityType;
	quality_name: string;
	qty: string;
}

export interface StockDraft {
	gl_dept_id: number;
	opening_hess: string;
	opening_sack: string;
	closing_hess: string;
	closing_sack: string;
}

export interface SheetDrafts {
	figures: FigureDraft[];
	productions: ProdDraft[];
	processStock: StockDraft[];
	remarks: string;
}

/** Guard used by client validation — mirrors the backend's sanity bound. */
export const MAX_ABS_VALUE = 100000;

let uidSeq = 1;
export const nextUid = (): number => uidSeq++;

// ---------------------------------------------------------------------------
// Parsing / formatting
// ---------------------------------------------------------------------------

/** Empty / partially-typed cells count as 0; anything else via Number(). */
export const parseQty = (raw: string): number => {
	const t = raw.trim();
	if (t === "" || t === "-" || t === "." || t === "-.") return 0;
	return Number(t);
};

export const fmt3 = (n: number): string =>
	Number.isFinite(n) ? n.toFixed(3) : "0.000";

const numToInput = (n: number): string => String(n);

// ---------------------------------------------------------------------------
// Hydration — merge the saved sheet onto the master rows
// ---------------------------------------------------------------------------

export function buildFigureDrafts(
	figureRows: GlFigureRowMst[],
	sheet: GlSheet | null,
): FigureDraft[] {
	const saved = new Map(
		(sheet?.figures ?? []).map((f) => [f.gl_row_id, f] as const),
	);
	return [...figureRows]
		.sort((a, b) => a.display_order - b.display_order)
		.map((row) => {
			const f = saved.get(row.gl_row_id);
			return {
				gl_row_id: row.gl_row_id,
				hess: numToInput(f?.hess_qty ?? 0),
				sack: numToInput(f?.sack_qty ?? 0),
			};
		});
}

export function buildProdDrafts(sheet: GlSheet | null): ProdDraft[] {
	return [...(sheet?.productions ?? [])]
		.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
		.map((p) => ({
			uid: nextUid(),
			statement: p.statement,
			quality_type: p.quality_type,
			quality_name: p.quality_name,
			qty: numToInput(p.qty),
		}));
}

export function buildStockDrafts(
	departments: GlDeptMst[],
	sheet: GlSheet | null,
): StockDraft[] {
	const saved = new Map(
		(sheet?.process_stock ?? []).map((s) => [s.gl_dept_id, s] as const),
	);
	const prevClosing = new Map(
		(sheet?.prev_closing ?? []).map((c) => [c.gl_dept_id, c] as const),
	);
	const openingFromPrev = sheet?.prev_month_exists ?? false;
	return [...departments]
		.sort((a, b) => a.display_order - b.display_order)
		.map((dept) => {
			const s = saved.get(dept.gl_dept_id);
			const prev = prevClosing.get(dept.gl_dept_id);
			// When last month's sheet exists its closing IS this month's opening
			// (cells render read-only); otherwise the user types the opening.
			const openingHess = openingFromPrev
				? prev?.closing_hess ?? 0
				: s?.opening_hess ?? 0;
			const openingSack = openingFromPrev
				? prev?.closing_sack ?? 0
				: s?.opening_sack ?? 0;
			return {
				gl_dept_id: dept.gl_dept_id,
				opening_hess: numToInput(openingHess),
				opening_sack: numToInput(openingSack),
				closing_hess: numToInput(s?.closing_hess ?? 0),
				closing_sack: numToInput(s?.closing_sack ?? 0),
			};
		});
}

// ---------------------------------------------------------------------------
// Validation + payload
// ---------------------------------------------------------------------------

const checkValue = (raw: string, label: string, errors: string[]): number => {
	const n = parseQty(raw);
	if (!Number.isFinite(n)) {
		errors.push(`${label}: "${raw}" is not a valid number`);
		return 0;
	}
	if (Math.abs(n) > MAX_ABS_VALUE) {
		errors.push(`${label}: value must be within ±${MAX_ABS_VALUE} MT`);
	}
	return n;
};

export interface BuildPayloadResult {
	errors: string[];
	payload: GlSheetSavePayload | null;
}

/**
 * Validate the drafts and serialize them into the save payload.
 * Returns errors (payload null) when anything fails validation.
 */
export function buildSavePayload(args: {
	coId: number;
	branchId: number;
	month: string; // YYYY-MM
	drafts: SheetDrafts;
	figureRows: GlFigureRowMst[];
}): BuildPayloadResult {
	const { coId, branchId, month, drafts, figureRows } = args;
	const errors: string[] = [];
	const rowName = new Map(
		figureRows.map((r) => [r.gl_row_id, r.row_name] as const),
	);

	const figures = drafts.figures.map((f) => {
		const label = rowName.get(f.gl_row_id) ?? `Row #${f.gl_row_id}`;
		return {
			gl_row_id: f.gl_row_id,
			hess_qty: checkValue(f.hess, `${label} (Hessian)`, errors),
			sack_qty: checkValue(f.sack, `${label} (Sacking)`, errors),
		};
	});

	const productions: GlSheetSavePayload["productions"] = [];
	const orderCounter: Record<string, number> = {};
	for (const p of drafts.productions) {
		const name = p.quality_name.trim();
		const groupLabel = `${p.statement} ${p.quality_type === 1 ? "Hessian" : "Sacking"}`;
		const qty = checkValue(p.qty, `${groupLabel} "${name || "(blank)"}"`, errors);
		if (name === "" && qty === 0) continue; // skip untouched blank rows
		if (name === "") {
			errors.push(`${groupLabel}: a quality row with quantity needs a name`);
			continue;
		}
		if (qty === 0) continue; // skip all-zero quality rows
		const key = `${p.statement}-${p.quality_type}`;
		const order = (orderCounter[key] = (orderCounter[key] ?? 0) + 1);
		productions.push({
			statement: p.statement,
			quality_type: p.quality_type,
			quality_name: name,
			qty,
			display_order: order,
		});
	}

	const process_stock = drafts.processStock.map((s) => ({
		gl_dept_id: s.gl_dept_id,
		opening_hess: checkValue(s.opening_hess, `Process stock #${s.gl_dept_id} opening (Hess)`, errors),
		opening_sack: checkValue(s.opening_sack, `Process stock #${s.gl_dept_id} opening (Sack)`, errors),
		closing_hess: checkValue(s.closing_hess, `Process stock #${s.gl_dept_id} closing (Hess)`, errors),
		closing_sack: checkValue(s.closing_sack, `Process stock #${s.gl_dept_id} closing (Sack)`, errors),
	}));

	const remarks = drafts.remarks.trim();
	if (remarks.length > 1000) {
		errors.push("Remarks must be 1000 characters or fewer");
	}

	if (errors.length > 0) return { errors, payload: null };
	return {
		errors: [],
		payload: {
			co_id: coId,
			branch_id: branchId,
			month,
			remarks: remarks === "" ? null : remarks,
			figures,
			productions,
			process_stock,
		},
	};
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Previous calendar month as "YYYY-MM" — the default sheet month. */
export function previousMonthISO(now: Date = new Date()): string {
	const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "Feeds: FNG, WDG" tooltip text for a figure row's statement flags. */
export function statementFlagsLabel(row: GlFigureRowMst): string {
	const flags: string[] = [];
	if (row.in_fng) flags.push("FNG");
	if (row.in_wvg) flags.push("WVG");
	if (row.in_wdg) flags.push("WDG");
	return flags.length > 0 ? `Feeds statements: ${flags.join(", ")}` : "Feeds no statement";
}
