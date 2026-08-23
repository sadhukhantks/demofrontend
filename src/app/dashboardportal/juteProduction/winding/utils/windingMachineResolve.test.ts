import { describe, expect, it } from "vitest";
import { resolveMachinePick } from "./windingMachineResolve";
import type { WindingQualityRow } from "../types/windingTypes";

function row(p: Partial<WindingQualityRow>): WindingQualityRow {
	return {
		winding_daily_qlty_id: 1,
		co_id: 1,
		branch_id: 2,
		tran_date: "2026-08-23",
		spell_id: 97,
		spell_code: "A1",
		eb_id: 10,
		emp_code: "02413",
		worker_name: "LAXMI",
		item_id: 5,
		item_code: "Y-8LB",
		machine_id: 31,
		machine_name: "WINDER 1",
		mech_code: "W-01",
		no_of_spindle: 4,
		...p,
	};
}

const LABEL = "W-01 — WINDER 1";

describe("resolveMachinePick", () => {
	it("errors when no winder is mapped to the machine", () => {
		const out = resolveMachinePick([row({ machine_id: 32 })], 31, LABEL);
		expect(out).toEqual({
			kind: "error",
			message: `No winder mapped to machine ${LABEL} for this date and spell. Set the EB no and machine in the Quality tab.`,
		});
	});

	it("errors when the machine's winders carry no quality", () => {
		const out = resolveMachinePick([row({ item_id: null, item_code: null })], 31, LABEL);
		expect(out).toEqual({
			kind: "error",
			message: `Winder(s) on machine ${LABEL} have no yarn quality mapped. Set the quality in the Quality tab.`,
		});
	});

	it("errors when the machine's winders sit on different qualities", () => {
		const out = resolveMachinePick(
			[row({}), row({ winding_daily_qlty_id: 2, eb_id: 11, item_id: 6, item_code: "Y-10LB" })],
			31,
			LABEL,
		);
		expect(out).toEqual({
			kind: "error",
			message: `Machine ${LABEL} has winders on different qualities (Y-8LB, Y-10LB). Pick the quality manually.`,
		});
	});

	it("fills quality + the single winder with no warning", () => {
		const out = resolveMachinePick([row({}), row({ machine_id: 32, eb_id: 99 })], 31, LABEL);
		expect(out).toEqual({ kind: "ok", itemId: 5, ebIds: [10], warn: null });
	});

	it("fills quality only when several winders share the machine", () => {
		const out = resolveMachinePick(
			[row({}), row({ winding_daily_qlty_id: 2, eb_id: 11 }), row({ winding_daily_qlty_id: 3, eb_id: 11 })],
			31,
			LABEL,
		);
		expect(out).toEqual({
			kind: "ok",
			itemId: 5,
			ebIds: [],
			warn: `2 winders mapped to machine ${LABEL} — quality filled, pick the EB no.`,
		});
	});

	it("fills quality only when the machine's quality row carries no EB no", () => {
		const out = resolveMachinePick([row({ eb_id: null })], 31, LABEL);
		expect(out).toEqual({
			kind: "ok",
			itemId: 5,
			ebIds: [],
			warn: `No EB no on machine ${LABEL}'s quality row — quality filled, pick the EB no.`,
		});
	});
});
