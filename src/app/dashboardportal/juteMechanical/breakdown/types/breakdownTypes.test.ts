import { describe, expect, it } from "vitest";
import {
	breakdownFormSchema,
	buildBreakdownPayload,
	buildDefaultFormValues,
	type BreakdownFormValues,
} from "./breakdownTypes";

// The operator-keyed Duration (min) is INDEPENDENT of stop/restart: it is stored
// exactly as typed, never derived from the datetimes and never feeding them back.
// These checks pin the two places that can silently break that — the Zod rule and
// the payload mapping.

function values(overrides: Partial<BreakdownFormValues> = {}): BreakdownFormValues {
	return {
		...buildDefaultFormValues("2026-08-26T10:00"),
		machine_id: "7",
		reason_id: "3",
		...overrides,
	};
}

function durationIssues(duration: string): string[] {
	const result = breakdownFormSchema.safeParse(values({ duration_min: duration }));
	if (result.success) return [];
	return result.error.issues
		.filter((issue) => issue.path[0] === "duration_min")
		.map((issue) => issue.message);
}

describe("duration_min", () => {
	it("accepts a blank field (backend computes restart − stop)", () => {
		expect(durationIssues("")).toEqual([]);
	});

	it("accepts a positive whole number", () => {
		expect(durationIssues("45")).toEqual([]);
	});

	it("rejects zero, negatives and fractions", () => {
		expect(durationIssues("0")).toEqual(["Duration must be at least 1 minute"]);
		expect(durationIssues("-5")).toEqual(["Duration must be at least 1 minute"]);
		expect(durationIssues("1.5")).toEqual(["Duration must be a whole number of minutes"]);
		expect(durationIssues("abc")).toEqual(["Duration must be a whole number of minutes"]);
	});

	it("is sent as typed, and as null when blank, with no restart time involved", () => {
		expect(buildBreakdownPayload(values({ duration_min: "90" }), 1, 2)).toMatchObject({
			duration_min: 90,
			restart_datetime: null,
		});
		expect(buildBreakdownPayload(values({ duration_min: "" }), 1, 2).duration_min).toBeNull();

		// A restart time never overrides what the operator keyed.
		expect(
			buildBreakdownPayload(
				values({ duration_min: "90", restart_datetime: "2026-08-26T10:10" }),
				1,
				2
			).duration_min
		).toBe(90);
	});
});
