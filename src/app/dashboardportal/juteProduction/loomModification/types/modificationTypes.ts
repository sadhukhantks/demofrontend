/**
 * Every type the Loom Modification register uses, in ONE file (house rule: a single
 * type module per page, so nothing can form an import cycle). The Loom Groups
 * master imports the checklist types from here too, because the tick-list
 * component (`_components/LoomChecklist.tsx`) is shared between the two pages.
 *
 * The Zod schema is the single source of truth for the header form; select and
 * number fields are held as STRINGS because MUI inputs bind to strings, and become
 * numbers only in `buildModificationPayload`.
 *
 * Wire types (`ModificationRow`, `ModificationCreate`, ...) are NOT redeclared
 * here — they come from `@/utils/loomModificationService`, which owns the contract.
 */

import { z } from "zod";
import type {
	DataCheck,
	LoomGroupMember,
	LoomOption,
	ModificationCreate,
	ModificationDetail,
	ModificationMember,
	ModificationMemberInput,
	ModificationRow,
	ModEnumLike,
} from "@/utils/loomModificationService";

// =============================================================================
// Enum codes — mirror src/juteProduction/constants.py
// =============================================================================

export const MOD_KIND_INITIAL = "INITIAL";
export const MOD_KIND_FOLLOWUP = "FOLLOWUP";
export const MOD_KIND_RECTIFY = "RECTIFY";
export const MOD_KIND_REVERSAL = "REVERSAL";

export const MOD_CATEGORY_SPEED_CHANGE = "SPEED_CHANGE";

export const DONE_BY_INHOUSE = "INHOUSE";
export const DONE_BY_VENDOR = "VENDOR";

export const GROUP_PURPOSE_STUDY = "STUDY";
export const GROUP_PURPOSE_CONTROL = "CONTROL";

/** D4: settling-in days excluded after the work. */
export const DEFAULT_SETTLE_DAYS = 3;

/** Fallbacks used only if `/setup` returns an empty enum list. The server wins. */
export const FALLBACK_MOD_KINDS: ReadonlyArray<ModEnumLike> = Object.freeze([
	{ code: MOD_KIND_INITIAL, label: "Initial" },
	{ code: MOD_KIND_FOLLOWUP, label: "Follow-up" },
	{ code: MOD_KIND_RECTIFY, label: "Rectification" },
	{ code: MOD_KIND_REVERSAL, label: "Reversal" },
]);

export const FALLBACK_MOD_CATEGORIES: ReadonlyArray<ModEnumLike> = Object.freeze([
	{ code: "MECHANICAL", label: "Mechanical" },
	{ code: "ELECTRICAL", label: "Electrical" },
	{ code: MOD_CATEGORY_SPEED_CHANGE, label: "Speed change" },
	{ code: "ACCESSORY", label: "Accessory" },
	{ code: "SETTING", label: "Setting" },
	{ code: "OTHER", label: "Other" },
]);

export const FALLBACK_DONE_BY_OPTIONS: ReadonlyArray<ModEnumLike> = Object.freeze([
	{ code: DONE_BY_INHOUSE, label: "In-house" },
	{ code: DONE_BY_VENDOR, label: "Vendor" },
]);

/** Kinds the "old root" may become when an earlier stage is inserted (§5). */
export const OLD_ROOT_KIND_OPTIONS: ReadonlyArray<ModEnumLike> = Object.freeze([
	{ code: MOD_KIND_FOLLOWUP, label: "Follow-up" },
	{ code: MOD_KIND_RECTIFY, label: "Rectification" },
]);

// =============================================================================
// Date helpers (local, so this module stays a leaf)
// =============================================================================

/** Today as an ISO date string (YYYY-MM-DD) in LOCAL time. */
export function todayISO(): string {
	const now = new Date();
	const tzOffset = now.getTimezoneOffset() * 60000;
	return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

/** True for a well-formed YYYY-MM-DD string. */
export function isISODate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

/** True when the ISO date is strictly after today (local). Blank or malformed = false. */
export function isFutureISODate(value: string): boolean {
	if (!isISODate(value)) return false;
	return value > todayISO();
}

/** True when `toDate` is earlier than `fromDate`; "" on either side is fine. */
export function isDateRangeInverted(fromDate: string, toDate: string): boolean {
	if (!fromDate || !toDate) return false;
	if (!isISODate(fromDate) || !isISODate(toDate)) return false;
	return toDate < fromDate;
}

/** Number from a possibly-empty typed string; non-numeric text reads as 0. */
export function toNumber(value: string | number | null | undefined): number {
	if (value === null || value === undefined || value === "") return 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

// =============================================================================
// Checklist rows and members (shared with the Loom Groups master)
// =============================================================================

/** Labels a tick-list row may carry (§5 membership rules). */
export type ChecklistTag = "not in previous stage" | "no longer in group" | "inactive";

/** One row of the loom tick-list. */
export interface ChecklistRow {
	machine_id: number;
	machine_name: string;
	mech_code: string | null;
	/**
	 * Legacy share code (`machine_mst.mech_shr_code`), only known for looms in the
	 * `/setup` list — snapshot and group rows do not carry it, so a retired loom
	 * reads null. Feeds `existingGroupings`.
	 */
	mech_shr_code: string | null;
	/** Always a string here: INT on dev3, VARCHAR on sls. */
	line_no: string | null;
	active: boolean;
	tag: ChecklistTag | null;
}

/** One ticked loom, with its optional per-loom dates (blank = inherit the event's). */
export interface ChecklistMember {
	machine_id: number;
	done_date: string;
	done_to_date: string;
}

/** Stable empty arrays, so memo dependencies do not churn on every render. */
export const EMPTY_MEMBERS: ReadonlyArray<ChecklistMember> = Object.freeze([]);
export const EMPTY_ROWS: ReadonlyArray<ChecklistRow> = Object.freeze([]);

function lineNoAsString(value: string | number | null | undefined): string | null {
	if (value === null || value === undefined || value === "") return null;
	return String(value);
}

/** Share code as a trimmed string; blank / null = no code (never groups). */
function shareCodeAsString(value: string | number | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const text = String(value).trim();
	return text === "" ? null : text;
}

function isActive(value: number | boolean | null | undefined): boolean {
	return value === true || value === 1;
}

/**
 * A `/setup` loom is active by definition — `get_looms_query` filters
 * `m.active = 1` and does NOT return an `active` column — so only an explicit
 * 0 / false (a caller that does carry the flag) marks it retired.
 */
export function loomOptionIsActive(loom: Pick<LoomOption, "active">): boolean {
	return loom.active === undefined || loom.active === null ? true : isActive(loom.active);
}

/**
 * Group members and snapshot rows carry the loom's flag as `machine_active`
 * (`m.active AS machine_active`); the service also copies it into `active`.
 * Read the wire key first, then the normalised one; neither present = active.
 */
export function memberIsActive(member: {
	machine_active?: number | boolean | null;
	active?: number | boolean | null;
}): boolean {
	if (member.machine_active !== undefined && member.machine_active !== null) {
		return isActive(member.machine_active);
	}
	if (member.active !== undefined && member.active !== null) return isActive(member.active);
	return true;
}

/** `mech_code — machine_name (line N)`, or whichever halves exist. */
export function loomLabel(row: {
	machine_name: string;
	mech_code: string | null;
	line_no: string | number | null;
}): string {
	const head = row.mech_code ? `${row.mech_code} — ${row.machine_name}` : row.machine_name;
	const line = lineNoAsString(row.line_no);
	return line ? `${head} (line ${line})` : head;
}

/** Plain rows from the setup's active loom list. */
export function toChecklistRows(looms: ReadonlyArray<LoomOption>): ChecklistRow[] {
	return looms.map((loom) => ({
		machine_id: loom.machine_id,
		machine_name: loom.machine_name,
		mech_code: loom.mech_code,
		mech_shr_code: shareCodeAsString(loom.mech_shr_code),
		line_no: lineNoAsString(loom.line_no),
		active: loomOptionIsActive(loom),
		tag: null,
	}));
}

/** Snapshot rows -> members with their recorded per-loom dates. */
export function toChecklistMembers(
	snapshot: ReadonlyArray<ModificationMember>,
	withDates = true,
): ChecklistMember[] {
	return snapshot.map((member) => ({
		machine_id: member.machine_id,
		done_date: withDates ? (member.done_date ?? "") : "",
		done_to_date: withDates ? (member.done_to_date ?? "") : "",
	}));
}

/** Group members -> members (a group never carries dates). */
export function groupMembersToChecklist(
	members: ReadonlyArray<LoomGroupMember>,
): ChecklistMember[] {
	return members.map((member) => ({
		machine_id: member.machine_id,
		done_date: "",
		done_to_date: "",
	}));
}

export interface ChecklistRowsInput {
	/** Active looms of the branch (`/setup`). */
	looms: ReadonlyArray<LoomOption>;
	/**
	 * Looms that must appear even when retired: the parent's snapshot (follow-up)
	 * or the event's own snapshot (edit). Null when creating a fresh initial.
	 */
	snapshot?: ReadonlyArray<ModificationMember> | null;
	/** Current members of the chosen group, or null when hand-picked. */
	groupMembers?: ReadonlyArray<LoomGroupMember> | null;
	/**
	 * True when `snapshot` is the PARENT's snapshot (follow-up mode): group members
	 * outside it are labelled "not in previous stage".
	 */
	snapshotIsParent?: boolean;
}

/**
 * Rows of the tick-list with their §5 labels:
 *  - "inactive"              loom retired since (kept, never blocks a save);
 *  - "no longer in group"    in the snapshot but not a current group member;
 *  - "not in previous stage" a group member the parent stage did not cover.
 * Order: snapshot looms first (as recorded), then the rest of the branch by name.
 */
export function buildChecklistRows(input: ChecklistRowsInput): ChecklistRow[] {
	const { looms, snapshot = null, groupMembers = null, snapshotIsParent = false } = input;
	const groupIds = groupMembers ? new Set(groupMembers.map((m) => m.machine_id)) : null;
	const byId = new Map<number, ChecklistRow>();

	for (const member of snapshot ?? []) {
		const active = memberIsActive(member);
		let tag: ChecklistTag | null = null;
		if (!active) tag = "inactive";
		else if (groupIds && !groupIds.has(member.machine_id)) tag = "no longer in group";
		byId.set(member.machine_id, {
			machine_id: member.machine_id,
			machine_name: member.machine_name,
			mech_code: member.mech_code,
			mech_shr_code: null,
			line_no: lineNoAsString(member.line_no),
			active,
			tag,
		});
	}

	for (const member of groupMembers ?? []) {
		if (byId.has(member.machine_id)) continue;
		const active = memberIsActive(member);
		let tag: ChecklistTag | null = null;
		if (!active) tag = "inactive";
		else if (snapshotIsParent && snapshot) tag = "not in previous stage";
		byId.set(member.machine_id, {
			machine_id: member.machine_id,
			machine_name: member.machine_name,
			mech_code: member.mech_code,
			mech_shr_code: null,
			line_no: lineNoAsString(member.line_no),
			active,
			tag,
		});
	}

	const rest: ChecklistRow[] = [];
	for (const loom of looms) {
		if (byId.has(loom.machine_id)) {
			// The setup list is the authority on `active` (and the only source of the
			// share code) for a loom we already hold.
			const held = byId.get(loom.machine_id);
			if (held) {
				held.mech_shr_code = shareCodeAsString(loom.mech_shr_code);
				if (!held.active && loomOptionIsActive(loom)) {
					held.active = true;
					if (held.tag === "inactive") held.tag = null;
				}
			}
			continue;
		}
		rest.push({
			machine_id: loom.machine_id,
			machine_name: loom.machine_name,
			mech_code: loom.mech_code,
			mech_shr_code: shareCodeAsString(loom.mech_shr_code),
			line_no: lineNoAsString(loom.line_no),
			active: loomOptionIsActive(loom),
			tag: null,
		});
	}
	rest.sort((a, b) => compareLoomNames(a.machine_name, b.machine_name));
	return [...byId.values(), ...rest];
}

/** Numeric tail of a loom name: "S101" -> 101, "LOOM 12" -> 12, "ABC" -> null. */
export function numericTail(name: string): number | null {
	const match = /(\d+)\s*$/.exec(name.trim());
	return match ? Number(match[1]) : null;
}

/** Natural order: by numeric tail when both have one, else by name. */
export function compareLoomNames(a: string, b: string): number {
	const ta = numericTail(a);
	const tb = numericTail(b);
	if (ta !== null && tb !== null && ta !== tb) return ta - tb;
	return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Looms whose name's numeric tail lies in [from, to]. Each bound may be typed as
 * "S101" or "101"; a non-numeric prefix, when typed, must match the loom name's
 * prefix (case-insensitive) so "S101..S112" does not also pick "T105".
 */
export function pickByNameRange(
	rows: ReadonlyArray<ChecklistRow>,
	fromText: string,
	toText: string,
): number[] {
	const from = parseRangeBound(fromText);
	const to = parseRangeBound(toText);
	if (!from || !to) return [];
	const lo = Math.min(from.tail, to.tail);
	const hi = Math.max(from.tail, to.tail);
	const prefix = (from.prefix || to.prefix).toLowerCase();
	return rows
		.filter((row) => {
			const tail = numericTail(row.machine_name);
			if (tail === null || tail < lo || tail > hi) return false;
			if (!prefix) return true;
			const rowPrefix = row.machine_name
				.trim()
				.replace(/\d+\s*$/, "")
				.trim()
				.toLowerCase();
			return rowPrefix === prefix;
		})
		.map((row) => row.machine_id);
}

function parseRangeBound(text: string): { prefix: string; tail: number } | null {
	const trimmed = text.trim();
	const match = /^(.*?)(\d+)$/.exec(trimmed);
	if (!match) return null;
	return { prefix: match[1].trim(), tail: Number(match[2]) };
}

/** Looms on the given line (compared as strings, see `line_no`). */
export function pickByLine(rows: ReadonlyArray<ChecklistRow>, line: string): number[] {
	const wanted = String(line).trim();
	if (!wanted) return [];
	return rows.filter((row) => row.line_no === wanted).map((row) => row.machine_id);
}

/** Add ids to the selection, keeping existing members (and their dates). */
export function addMembers(
	current: ReadonlyArray<ChecklistMember>,
	ids: ReadonlyArray<number>,
): ChecklistMember[] {
	const have = new Set(current.map((m) => m.machine_id));
	const added = ids
		.filter((id) => !have.has(id))
		.map((id) => ({ machine_id: id, done_date: "", done_to_date: "" }));
	return [...current, ...added];
}

// =============================================================================
// Existing groupings — bands of six and share codes (nothing to key in first)
// =============================================================================

/** Looms per band in the Weaving Low Producer report (`lowprod_weaving.py`). */
export const LOOM_BAND_SIZE = 6;

/** `<prefix><separators><digits>` — separators are spaces, dashes and '#'. */
const LOOM_NAME_RE = /^(.*?)[\s\-#]*(\d+)\s*$/;

/** "S4 LOOM 12" -> { prefix: "S4 LOOM", number: 12 }; no digit tail -> { name, null }. */
export function splitLoomName(name: string): { prefix: string; number: number | null } {
	const trimmed = name.trim();
	const match = LOOM_NAME_RE.exec(trimmed);
	if (!match) return { prefix: trimmed, number: null };
	return { prefix: match[1].trim(), number: Number(match[2]) };
}

/** The name minus its trailing digit run and trailing space / dash / '#': "LOOM-12" -> "LOOM". */
export function loomNamePrefix(name: string): string {
	return splitLoomName(name).prefix;
}

/** The trailing digit run as a number: "S293" -> 293, "ABC" -> null. */
export function loomNumber(name: string): number | null {
	return splitLoomName(name).number;
}

/** Band of six holding loom n (n >= 1): 1–6, 7–12, … — the low-producer report's rule. */
export function bandOf(n: number): { start: number; end: number } {
	const start = Math.floor((n - 1) / LOOM_BAND_SIZE) * LOOM_BAND_SIZE + 1;
	return { start, end: start + LOOM_BAND_SIZE - 1 };
}

export type AutoGroupKind = "band" | "share";

/** A grouping that already exists in the data, never saved in the Loom Groups master. */
export interface AutoGroup {
	/** `band:<prefix>:<start>` or `share:<code>` — a picker value, never sent to the API. */
	key: string;
	kind: AutoGroupKind;
	label: string;
	machine_ids: number[];
}

const AUTO_GROUP_KEY_RE = /^(band|share):/;

/** True for an `existingGroupings` key held in the form's `loom_group_id` field. */
export function isAutoGroupKey(value: string): boolean {
	return AUTO_GROUP_KEY_RE.test(value);
}

/** The saved group's numeric id from the form field; null for blank or an auto key. */
export function savedGroupId(value: string): number | null {
	if (value === "" || isAutoGroupKey(value)) return null;
	const id = Number(value);
	return Number.isFinite(id) ? id : null;
}

/** Numeric codes first in number order, then the rest alphabetically. */
function compareShareCodes(a: string, b: string): number {
	const na = /^\d+$/.test(a) ? Number(a) : null;
	const nb = /^\d+$/.test(b) ? Number(b) : null;
	if (na !== null && nb !== null) return na - nb || a.localeCompare(b);
	if (na !== null) return -1;
	if (nb !== null) return 1;
	return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function loomCountText(n: number): string {
	return `${n} loom${n === 1 ? "" : "s"}`;
}

type GroupableRow = Pick<ChecklistRow, "machine_id" | "machine_name" | "mech_shr_code" | "active">;

interface BandBucket {
	start: number;
	looms: { id: number; n: number; prefix: string }[];
}

/**
 * Groupings that already exist in the branch's data, so nobody re-keys them in
 * the Loom Groups master ("loom groups already exist"):
 *  - bands: active looms with a numeric tail, bucketed by (name prefix, band of
 *    six) exactly as the Weaving Low Producer report does — one weaver's set of
 *    six consecutive looms. The label shows the real lowest–highest numbers
 *    present; a band holding a single loom is skipped.
 *  - share codes: active looms sharing a non-empty `mech_shr_code` (the legacy
 *    sardar/helper code, e.g. a Hessian pair on EJM); codes on one loom are skipped.
 * Bands first (by prefix, then start), then share codes (numeric codes in number
 * order, then the rest). Pure and order-independent for a given set of rows.
 */
export function existingGroupings(rows: ReadonlyArray<GroupableRow>): AutoGroup[] {
	const active = rows.filter((row) => row.active);

	const bands = new Map<string, BandBucket>();
	for (const row of active) {
		const { prefix, number } = splitLoomName(row.machine_name);
		if (number === null || number < 1) continue;
		const { start } = bandOf(number);
		const key = `${prefix.toLowerCase()}|${start}`;
		const bucket = bands.get(key) ?? { start, looms: [] };
		bucket.looms.push({ id: row.machine_id, n: number, prefix });
		bands.set(key, bucket);
	}
	const bandGroups: AutoGroup[] = [...bands.values()]
		.filter((bucket) => bucket.looms.length > 1)
		.map((bucket) => {
			const looms = [...bucket.looms].sort((a, b) => a.n - b.n || a.id - b.id);
			// The lowest-numbered loom lends its casing to the label and key.
			const prefix = looms[0].prefix;
			const lo = looms[0].n;
			const hi = looms[looms.length - 1].n;
			return {
				key: `band:${prefix}:${bucket.start}`,
				kind: "band" as const,
				prefix,
				start: bucket.start,
				label: `${prefix === "" ? "Loom" : prefix} ${lo}–${hi} (${loomCountText(looms.length)})`,
				machine_ids: looms.map((loom) => loom.id),
			};
		})
		.sort(
			(a, b) =>
				a.prefix.localeCompare(b.prefix, undefined, { sensitivity: "base", numeric: true }) ||
				a.start - b.start,
		)
		.map(({ key, kind, label, machine_ids }) => ({ key, kind, label, machine_ids }));

	const shares = new Map<string, GroupableRow[]>();
	for (const row of active) {
		const code = shareCodeAsString(row.mech_shr_code);
		if (code === null) continue;
		const list = shares.get(code) ?? [];
		list.push(row);
		shares.set(code, list);
	}
	const shareGroups: AutoGroup[] = [...shares.entries()]
		.filter(([, looms]) => looms.length > 1)
		.sort(([a], [b]) => compareShareCodes(a, b))
		.map(([code, looms]) => {
			const sorted = [...looms].sort(
				(a, b) => compareLoomNames(a.machine_name, b.machine_name) || a.machine_id - b.machine_id,
			);
			const names = sorted.map((loom) => loom.machine_name).join(", ");
			return {
				key: `share:${code}`,
				kind: "share" as const,
				label: `Share ${code}: ${names} (${loomCountText(sorted.length)})`,
				machine_ids: sorted.map((loom) => loom.machine_id),
			};
		});

	return [...bandGroups, ...shareGroups];
}

/** The grouping's looms as a fresh tick-list (no per-loom dates), like a saved group's members. */
export function autoGroupMembers(group: Pick<AutoGroup, "machine_ids">): ChecklistMember[] {
	return addMembers(EMPTY_MEMBERS, group.machine_ids);
}

/**
 * Per-loom date rules of §5, checked before the payload is built so the user never
 * eats a 400: at least one loom; `done_date` / `done_to_date` inside
 * `[mod_date, mod_to_date ?? mod_date]`; `done_to_date >= done_date`; nothing in the
 * future. Returns the first problem, or null.
 */
export function validateMembers(
	members: ReadonlyArray<ChecklistMember>,
	modDate: string,
	modToDate: string,
	rows?: ReadonlyArray<ChecklistRow>,
): string | null {
	if (members.length === 0) return "Tick at least one loom";
	const eventEnd = modToDate || modDate;
	const labelOf = (id: number): string => {
		const row = rows?.find((r) => r.machine_id === id);
		return row ? loomLabel(row) : `loom #${id}`;
	};
	for (const member of members) {
		const { done_date, done_to_date } = member;
		if (done_date && !isISODate(done_date)) return `${labelOf(member.machine_id)}: bad done date`;
		if (done_to_date && !isISODate(done_to_date)) {
			return `${labelOf(member.machine_id)}: bad done-to date`;
		}
		if (done_date && isFutureISODate(done_date)) {
			return `${labelOf(member.machine_id)}: date done cannot be in the future`;
		}
		if (done_date && modDate && (done_date < modDate || (eventEnd && done_date > eventEnd))) {
			return `${labelOf(member.machine_id)}: done date must be inside the event's dates`;
		}
		if (done_to_date && !done_date) {
			return `${labelOf(member.machine_id)}: done-to date needs a done date`;
		}
		if (done_to_date && done_date && done_to_date < done_date) {
			return `${labelOf(member.machine_id)}: done-to date cannot precede the done date`;
		}
		if (done_to_date && eventEnd && done_to_date > eventEnd) {
			return `${labelOf(member.machine_id)}: done-to date must be inside the event's dates`;
		}
	}
	return null;
}

/** One ticked loom as the Add-looms dialog holds it. */
const checklistMemberSchema = z.object({
	machine_id: z.number().int().positive(),
	done_date: z.string(),
	done_to_date: z.string(),
});

/**
 * Zod schema of the "Add looms to this stage" dialog (house rule: zod for every
 * form). The per-loom date rules are the same §5 rules `validateMembers` applies
 * to the main entry form, so the dialog cannot drift from it.
 */
export function buildAddLoomsSchema(
	modDate: string,
	modToDate: string,
	rows?: ReadonlyArray<ChecklistRow>,
) {
	return z
		.object({
			members: z.array(checklistMemberSchema).min(1, "Tick at least one loom"),
		})
		.superRefine((values, ctx) => {
			const problem = validateMembers(values.members, modDate, modToDate, rows);
			if (problem) ctx.addIssue({ code: "custom", path: ["members"], message: problem });
		});
}

export type AddLoomsFormValues = z.infer<ReturnType<typeof buildAddLoomsSchema>>;

// =============================================================================
// Header form — Zod schema + inferred type
// =============================================================================

const MAX_TITLE = 200;
const MAX_TEXT = 2000;
const MAX_REMARKS = 500;

export const modificationFormSchema = z
	.object({
		mod_kind: z.string().min(1, "Kind is required"),
		/** "" when Kind = Initial; the id of the stage this one follows otherwise. */
		parent_modification_id: z.string(),
		/**
		 * "" = hand-picked looms; a saved group's id; or an `existingGroupings` key
		 * (`band:…` / `share:…`) that only pre-ticks looms and is sent as null.
		 */
		loom_group_id: z.string(),
		mod_date: z
			.string()
			.min(1, "Date done is required")
			.refine((value) => !isFutureISODate(value), {
				message: "date done cannot be in the future",
			}),
		mod_to_date: z.string(),
		settle_days: z.string().superRefine((value, ctx) => {
			if (value.trim() === "") {
				ctx.addIssue({ code: "custom", message: "Settling days is required" });
			} else if (!/^\d+$/.test(value.trim())) {
				ctx.addIssue({ code: "custom", message: "Settling days must be a whole number" });
			}
		}),
		mod_category: z.string().min(1, "Category is required"),
		title: z
			.string()
			.trim()
			.min(1, "Title is required")
			.max(MAX_TITLE, `Title cannot exceed ${MAX_TITLE} characters`),
		description: z.string().max(MAX_TEXT, `Cannot exceed ${MAX_TEXT} characters`),
		expected_effect: z.string().max(MAX_TEXT, `Cannot exceed ${MAX_TEXT} characters`),
		done_by: z.string().min(1, "Done by is required"),
		party_id: z.string(),
		total_cost: z
			.string()
			.refine((value) => value === "" || Number.isFinite(Number(value)), {
				message: "Cost must be a number",
			})
			.refine((value) => value === "" || Number(value) >= 0, {
				message: "Cost cannot be negative",
			}),
		remarks: z.string().max(MAX_REMARKS, `Remarks cannot exceed ${MAX_REMARKS} characters`),
		save_as_group: z.boolean(),
		group_code: z.string(),
		group_name: z.string(),
		/** Only read in "Insert earlier stage" mode: what the old root becomes. */
		old_root_kind: z.string(),
	})
	.superRefine((values, ctx) => {
		if (values.mod_kind !== MOD_KIND_INITIAL && values.parent_modification_id === "") {
			ctx.addIssue({
				code: "custom",
				path: ["parent_modification_id"],
				message: "Pick the stage this one follows",
			});
		}
		if (isDateRangeInverted(values.mod_date, values.mod_to_date)) {
			ctx.addIssue({
				code: "custom",
				path: ["mod_to_date"],
				message: "Completed on cannot be earlier than Date done",
			});
		}
		if (values.mod_to_date && isFutureISODate(values.mod_to_date)) {
			ctx.addIssue({
				code: "custom",
				path: ["mod_to_date"],
				message: "Completed on cannot be in the future",
			});
		}
		if (values.done_by === DONE_BY_VENDOR && values.party_id === "") {
			ctx.addIssue({
				code: "custom",
				path: ["party_id"],
				message: "Party is required when the work was done by a vendor",
			});
		}
		if (values.save_as_group) {
			if (values.group_code.trim() === "") {
				ctx.addIssue({ code: "custom", path: ["group_code"], message: "Group code is required" });
			}
			if (values.group_name.trim() === "") {
				ctx.addIssue({ code: "custom", path: ["group_name"], message: "Group name is required" });
			}
		}
	});

export type ModificationFormValues = z.infer<typeof modificationFormSchema>;

/** Blank header — today, Initial, in-house, 3 settle days. */
export function buildDefaultModificationFormValues(): ModificationFormValues {
	return {
		mod_kind: MOD_KIND_INITIAL,
		parent_modification_id: "",
		loom_group_id: "",
		mod_date: todayISO(),
		mod_to_date: "",
		settle_days: String(DEFAULT_SETTLE_DAYS),
		mod_category: "",
		title: "",
		description: "",
		expected_effect: "",
		done_by: DONE_BY_INHOUSE,
		party_id: "",
		total_cost: "",
		remarks: "",
		save_as_group: false,
		group_code: "",
		group_name: "",
		old_root_kind: MOD_KIND_FOLLOWUP,
	};
}

/** Lift a saved event into the form (edit mode). */
export function toModificationFormValues(detail: ModificationDetail): ModificationFormValues {
	return {
		...buildDefaultModificationFormValues(),
		mod_kind: detail.mod_kind ?? MOD_KIND_INITIAL,
		parent_modification_id:
			detail.parent_modification_id === null ? "" : String(detail.parent_modification_id),
		loom_group_id: detail.loom_group_id === null ? "" : String(detail.loom_group_id),
		mod_date: detail.mod_date ?? todayISO(),
		mod_to_date: detail.mod_to_date ?? "",
		settle_days: String(detail.settle_days ?? DEFAULT_SETTLE_DAYS),
		mod_category: detail.mod_category ?? "",
		title: detail.title ?? "",
		description: detail.description ?? "",
		expected_effect: detail.expected_effect ?? "",
		done_by: detail.done_by ?? DONE_BY_INHOUSE,
		party_id: detail.party_id === null ? "" : String(detail.party_id),
		total_cost: detail.total_cost === null ? "" : String(detail.total_cost),
		remarks: detail.remarks ?? "",
	};
}

/**
 * "Add follow-up" prefill: Follows = the parent, Kind = Follow-up, same group,
 * date = today. Members are supplied separately (parent snapshot, ticked).
 */
export function buildFollowUpFormValues(
	parent: Pick<ModificationDetail, "modification_id" | "loom_group_id" | "mod_category">,
): ModificationFormValues {
	return {
		...buildDefaultModificationFormValues(),
		mod_kind: MOD_KIND_FOLLOWUP,
		parent_modification_id: String(parent.modification_id),
		loom_group_id: parent.loom_group_id === null ? "" : String(parent.loom_group_id),
		mod_category: parent.mod_category ?? "",
		mod_date: todayISO(),
	};
}

/** "Insert earlier stage" prefill: a fresh INITIAL over the old root's looms. */
export function buildInsertEarlierFormValues(
	oldRoot: Pick<ModificationDetail, "loom_group_id" | "mod_category">,
): ModificationFormValues {
	return {
		...buildDefaultModificationFormValues(),
		mod_kind: MOD_KIND_INITIAL,
		loom_group_id: oldRoot.loom_group_id === null ? "" : String(oldRoot.loom_group_id),
		mod_category: oldRoot.mod_category ?? "",
		mod_date: "",
		old_root_kind: MOD_KIND_FOLLOWUP,
	};
}

// =============================================================================
// Payload builder
// =============================================================================

function blankToNull(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function toMemberInput(member: ChecklistMember): ModificationMemberInput {
	return {
		machine_id: member.machine_id,
		done_date: member.done_date === "" ? null : member.done_date,
		done_to_date: member.done_to_date === "" ? null : member.done_to_date,
	};
}

/**
 * Body for `POST /modification_create` and `PUT /modification_edit/{id}` — the
 * same shape. `root_modification_id` is stamped by the server.
 */
export function buildModificationPayload(
	values: ModificationFormValues,
	members: ReadonlyArray<ChecklistMember>,
	coId: number,
	branchId: number,
): ModificationCreate {
	const isInitial = values.mod_kind === MOD_KIND_INITIAL;
	const isVendor = values.done_by === DONE_BY_VENDOR;
	// An existing grouping (band / share code) is not a saved group: it only
	// pre-ticked the looms, so the server sees a hand-picked list.
	const groupId = savedGroupId(values.loom_group_id);
	return {
		co_id: coId,
		branch_id: branchId,
		loom_group_id: groupId,
		members: members.map(toMemberInput),
		mod_date: values.mod_date,
		mod_to_date: values.mod_to_date === "" ? null : values.mod_to_date,
		settle_days: Math.trunc(toNumber(values.settle_days)),
		mod_kind: values.mod_kind,
		parent_modification_id:
			isInitial || values.parent_modification_id === ""
				? null
				: Number(values.parent_modification_id),
		mod_category: values.mod_category,
		title: values.title.trim(),
		description: blankToNull(values.description),
		expected_effect: blankToNull(values.expected_effect),
		done_by: values.done_by,
		party_id: isVendor && values.party_id !== "" ? Number(values.party_id) : null,
		total_cost: values.total_cost === "" ? null : toNumber(values.total_cost),
		remarks: blankToNull(values.remarks),
		save_as_group:
			values.save_as_group && groupId === null
				? { group_code: values.group_code.trim(), group_name: values.group_name.trim() }
				: null,
	};
}

// =============================================================================
// Display helpers
// =============================================================================

/** "Group EJM-L4 — 12 looms" or "5 looms picked". */
export function scopeText(row: Pick<ModificationRow, "group_name" | "loom_count">): string {
	const n = row.loom_count ?? 0;
	const looms = `${n} loom${n === 1 ? "" : "s"}`;
	return row.group_name ? `Group ${row.group_name} — ${looms}` : `${looms} picked`;
}

/** "2 of 3" — from the wire's `stage_no` (`stage_seq` is the service's derived alias). */
export function stageText(
	row: Partial<Pick<ModificationRow, "stage_no" | "stage_seq" | "stage_count" | "stage_label">>,
): string {
	if (row.stage_label) return row.stage_label;
	return `${row.stage_no ?? row.stage_seq ?? 1} of ${row.stage_count ?? 1}`;
}

/** Active direct follow-ups of a stage — the wire's `children_count`. */
export function followUpCount(
	row: Partial<Pick<ModificationRow, "children_count" | "has_children">>,
): number {
	const n = Number(row.children_count ?? 0);
	if (Number.isFinite(n) && n > 0) return n;
	return row.has_children === true ? 1 : 0;
}

/** True when the stage has an active follow-up (delete refused, chain fields locked). */
export function rowHasChildren(
	row: Partial<Pick<ModificationRow, "children_count" | "has_children">>,
): boolean {
	return followUpCount(row) > 0;
}

/** True when the data check found no producing loom-day on at least one side. */
export function dataCheckIsRed(check: DataCheck | null | undefined): boolean {
	if (!check) return false;
	return check.before_days === 0 || check.after_days === 0;
}

/** Days each side the backend counts producing loom-days over. */
export const DATA_CHECK_DAYS = 90;

/**
 * Snackbar text after a save. Names the empty side so an entry dated inside a
 * data hole is visible at entry time (§6.2).
 */
export function formatSaveMessage(verb: string, check: DataCheck | null | undefined): string {
	if (!check) return verb;
	const before = check.before_days ?? 0;
	const after = check.after_days ?? 0;
	if (before === 0 && after === 0) {
		return `${verb} — 0 producing loom-days in the ${DATA_CHECK_DAYS} days before and after: the report will say NOT ENOUGH DATA`;
	}
	if (before === 0) {
		return `${verb} — 0 producing loom-days in the ${DATA_CHECK_DAYS} days before: the report will say NOT ENOUGH DATA`;
	}
	if (after === 0) {
		return `${verb} — 0 producing loom-days in the ${DATA_CHECK_DAYS} days after: the report will say NOT ENOUGH DATA`;
	}
	return `${verb} — ${before} producing loom-days before, ${after} after (${DATA_CHECK_DAYS} days each side)`;
}

/** Money for display — two decimals, grouped, no currency symbol. */
export function formatAmount(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return "—";
	return value.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

/** Label of an enum code from the setup list, falling back to the code. */
export function enumLabel(options: ReadonlyArray<ModEnumLike>, code: string): string {
	return options.find((option) => option.code === code)?.label ?? code;
}

/** Deep link of the impact report for any stage id (resolved to its chain server-side). */
export function impactReportHref(modificationId: number): string {
	return `/dashboardportal/juteProduction/report/loomModificationImpact?modification_id=${modificationId}`;
}
