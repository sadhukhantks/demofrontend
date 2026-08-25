import { describe, expect, it } from "vitest";
import { FINISHING_PROCESS_CONFIG, machineLabel, syncSummary } from "./finishingConfig";

describe("machineLabel", () => {
	it("renders labelled and unlabelled rows", () => {
		expect(machineLabel({ mech_code: "M-2", machine_id: 9 })).toBe("M-2");
		expect(machineLabel({ mech_code: null, machine_id: 9 })).toBe("#9");
		expect(machineLabel({})).toBe("?");
	});
});

describe("syncSummary", () => {
	it("omits empty buckets", () => {
		expect(
			syncSummary({ stamped: 4, no_worker: [], ambiguous: [], collisions: [] })
		).toBe("Stamped 4.");
	});

	it("names every non-empty bucket", () => {
		expect(
			syncSummary({
				stamped: 2,
				no_worker: [{ mech_code: "M-1", machine_id: 1 }, { machine_id: 7 }],
				ambiguous: [{ mech_code: "M-3" }],
				collisions: [{ mech_code: "M-9", machine_id: 9 }],
			})
		).toBe(
			"Stamped 2. No worker: M-1, #7. Ambiguous: M-3 (pick EB via edit). Collisions: M-9."
		);
	});
});

describe("process config", () => {
	it("allows a worker on hemming/herackle only, leaving sacksewing labour-only", () => {
		const allows = Object.values(FINISHING_PROCESS_CONFIG)
			.filter((c) => c.allowsEmployee)
			.map((c) => c.process);
		expect(allows.sort()).toEqual(["hemming", "herackle"]);
		expect(FINISHING_PROCESS_CONFIG.sacksewing.allowsEmployee).toBeUndefined();
		expect(FINISHING_PROCESS_CONFIG.sacksewing.usesEmployee).toBe(true);
	});
});
