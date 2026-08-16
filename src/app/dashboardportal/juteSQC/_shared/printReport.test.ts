import { describe, expect, it } from "vitest";
import { readingCells, readingColumns } from "./printReport";

// The SQC printouts used to show only the derived calc_* averages; these two
// helpers are what put the operator's raw recorded readings back on the page,
// so they are the piece worth pinning down.

describe("readingColumns", () => {
	it("builds one 1-based column per reading", () => {
		expect(readingColumns("wt", "Wt", 3)).toEqual([
			{ key: "wt1", label: "Wt 1", align: "right" },
			{ key: "wt2", label: "Wt 2", align: "right" },
			{ key: "wt3", label: "Wt 3", align: "right" },
		]);
	});

	it("returns nothing for a report with no readings", () => {
		expect(readingColumns("wt", "Wt", 0)).toEqual([]);
	});
});

describe("readingCells", () => {
	it("keys cells to match readingColumns and formats to the given precision", () => {
		const cols = readingColumns("mr", "MR%", 2);
		const cells = readingCells("mr", [14.156, 14], 2, 2);
		expect(cells).toEqual({ mr1: "14.16", mr2: "14.00" });
		expect(cols.every((c) => c.key in cells)).toBe(true);
	});

	it("emits a blank cell for short, null and non-numeric readings", () => {
		// A ragged array (spreader sliver wt captures 1-12) must still fill the
		// full column set, otherwise the row silently shifts left.
		expect(readingCells("wt", [1.5, null, undefined, Number.NaN], 5, 1)).toEqual({
			wt1: "1.5",
			wt2: "",
			wt3: "",
			wt4: "",
			wt5: "",
		});
	});

	it("survives a missing readings array", () => {
		expect(readingCells("wt", undefined, 2)).toEqual({ wt1: "", wt2: "" });
	});

	it("keeps integer readings integral at 0 decimals", () => {
		// Morrah weights are whole grams.
		expect(readingCells("w", [1234, 1301], 2, 0)).toEqual({ w1: "1234", w2: "1301" });
	});
});
