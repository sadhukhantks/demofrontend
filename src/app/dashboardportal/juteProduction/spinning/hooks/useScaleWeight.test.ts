import { describe, expect, it } from "vitest";
import { parseWeight } from "./useScaleWeight";

describe("parseWeight", () => {
	it("reads the shapes a scale bridge can answer with", () => {
		expect(parseWeight("12.34")).toBe(12.34);
		expect(parseWeight("12.34 kg")).toBe(12.34);
		expect(parseWeight('{"weight":12.34}')).toBe(12.34);
		expect(parseWeight('{"weight":"12.34 kg"}')).toBe(12.34);
		expect(parseWeight('{"status":0,"weight":12.34}')).toBe(12.34);
		expect(parseWeight('{"data":{"gross_weight":12.34}}')).toBe(12.34);
		expect(parseWeight("-0.5")).toBe(-0.5);
	});

	it("returns null when there is no reading to take", () => {
		expect(parseWeight("")).toBeNull();
		expect(parseWeight("ERR")).toBeNull();
		expect(parseWeight('{"status":"no data"}')).toBeNull();
	});
});
