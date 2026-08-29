import { describe, expect, it } from "vitest";
import { hourFromSpell, spellFromHour } from "./shift";

describe("hourFromSpell", () => {
	it("maps each spell to an hour inside its own bucket", () => {
		for (const s of ["A1", "B1", "A2", "B2", "C"]) {
			const h = hourFromSpell(s);
			expect(h).not.toBeNull();
			expect(spellFromHour(h as number)).toBe(s);
		}
	});

	it("returns null for unknown codes", () => {
		expect(hourFromSpell("X9")).toBeNull();
	});
});
