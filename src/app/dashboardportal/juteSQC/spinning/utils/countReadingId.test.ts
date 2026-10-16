import { describe, expect, it } from "vitest";
import { countReadingServerId } from "./countReadingId";
import type { SqcCountReadingRow } from "../types/sqcSpinningTypes";

const base: SqcCountReadingRow = { entry_date: "2026-10-12", item_id: 7, observed_count: 8.1 };

describe("countReadingServerId (TKT-000225)", () => {
	it("reads the key the backend actually sends (spinning_sqc_count_id)", () => {
		expect(countReadingServerId({ ...base, spinning_sqc_count_id: 50 })).toBe(50);
	});

	it("still accepts the older aliases", () => {
		expect(countReadingServerId({ ...base, jute_sqc_spinning_count_id: 1 })).toBe(1);
		expect(countReadingServerId({ ...base, sqc_spinning_count_id: 2 })).toBe(2);
		expect(countReadingServerId({ ...base, id: 3 })).toBe(3);
	});

	it("prefers the backend key over an alias", () => {
		expect(countReadingServerId({ ...base, spinning_sqc_count_id: 50, id: 3 })).toBe(50);
	});

	it("is null for an unsaved row", () => {
		expect(countReadingServerId(base)).toBeNull();
	});
});
