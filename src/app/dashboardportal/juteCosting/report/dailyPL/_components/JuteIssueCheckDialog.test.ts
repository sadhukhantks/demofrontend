import { describe, expect, it } from "vitest";
import type { JuteIssueCheckData } from "../_service";
import { checkNotesText } from "./JuteIssueCheckDialog";

const base: JuteIssueCheckData = {
  summary: { lines: 355, flagged: 93, by_flag: {}, issued_kg: 351276, cloth_t: 437.525, jute_kg_per_kg_cloth: 0.803, std: 1.06, ratio_flag: "LOW" },
  rows: [],
  day_flags: [],
  flag_labels: {},
};

describe("checkNotesText", () => {
  it("shows the backend's notes on one line", () => {
    expect(checkNotesText({ ...base, notes: ["85 waste-ledger lines (11.8 t, booked ₹0 by design) are outside this check"] })).toBe(
      "85 waste-ledger lines (11.8 t, booked ₹0 by design) are outside this check",
    );
    expect(checkNotesText({ ...base, notes: ["a", "b"] })).toBe("a · b");
  });
  it("builds the waste-ledger sentence from the summary when the backend sends no notes", () => {
    const s = { ...base.summary, waste_ledger_lines: 85, waste_ledger_kg: 11829 };
    expect(checkNotesText({ ...base, summary: s })).toBe("85 waste-ledger lines (11.829 t) are outside this check");
    expect(checkNotesText({ ...base, summary: { ...s, waste_ledger_lines: 1 } })).toContain("1 waste-ledger line (");
  });
  it("is empty when there is nothing to say", () => {
    expect(checkNotesText(base)).toBe("");
    expect(checkNotesText({ ...base, summary: { ...base.summary, waste_ledger_lines: 0 } })).toBe("");
  });
});
