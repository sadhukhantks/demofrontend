import { describe, expect, it } from "vitest";
import type { FollowupEvent, FollowupSpell } from "@/utils/lowPerformerFollowupService";
import { REASON_MAX } from "@/components/lowPerformerFollowup/schemas";
import {
  dateInWindowIssue,
  eventFormDefaults,
  eventFormIssues,
  eventPayloadFields,
  makeCloseFollowupSchema,
  makeEditFollowupSchema,
  makeEventSchema,
  parseHours,
  perfWindowSchema,
  type EventFormContext,
  type EventFormValues,
} from "./_schemas";

const TODAY = "2026-10-07";
const START = "2026-09-20";

const spells: FollowupSpell[] = [
  { spell_id: 1, spell_code: "A1", spell_name: null, working_hours: 5 },
  { spell_id: 2, spell_code: "B1", spell_name: null, working_hours: null },
];

const values = (v: Partial<EventFormValues>): EventFormValues => ({
  event_date: "2026-10-01",
  notice_type: "",
  issued_by: "",
  spell_id: null,
  hours_cut: "",
  remarks: "",
  file: null,
  ...v,
});

const ctx = (v: Partial<EventFormContext>): EventFormContext => ({
  eventType: "REMARK",
  startDate: START,
  today: TODAY,
  spells,
  events: [],
  editingId: null,
  ...v,
});

const cut = (id: number, hours: number): FollowupEvent => ({
  followup_event_id: id,
  followup_id: 1,
  event_type: "HOURS_CUT",
  event_date: "2026-10-01",
  notice_type: null,
  notice_type_label: null,
  issued_by: null,
  spell_id: 1,
  spell_code: "A1",
  hours_cut: hours,
  remarks: "late",
  attachment_id: null,
  attachment_filename: null,
  updated_by: null,
  updated_date_time: null,
});

const paths = (issues: { path: string }[]) => issues.map((i) => i.path).sort();

describe("dateInWindowIssue", () => {
  it("keeps dates between the start date and today", () => {
    expect(dateInWindowIssue("2026-10-01", START, TODAY, "Date")).toBeNull();
    expect(dateInWindowIssue(START, START, TODAY, "Date")).toBeNull();
    expect(dateInWindowIssue(TODAY, START, TODAY, "Date")).toBeNull();
    expect(dateInWindowIssue("", START, TODAY, "Date")).toMatch(/required/);
    expect(dateInWindowIssue("2026-10-08", START, TODAY, "Date")).toMatch(/future/);
    expect(dateInWindowIssue("2026-09-19", START, TODAY, "Date")).toMatch(/before the start/);
    expect(dateInWindowIssue("2026-02-30", START, TODAY, "Date")).toMatch(/valid/);
  });
});

describe("eventFormIssues", () => {
  it("needs remarks on a remark", () => {
    expect(paths(eventFormIssues(values({}), ctx({})))).toEqual(["remarks"]);
    expect(eventFormIssues(values({ remarks: "Talked to him" }), ctx({}))).toEqual([]);
  });

  it("needs a notice type on a notice, remarks optional", () => {
    expect(paths(eventFormIssues(values({}), ctx({ eventType: "NOTICE" })))).toEqual(["notice_type"]);
    expect(eventFormIssues(values({ notice_type: "SHOW_CAUSE" }), ctx({ eventType: "NOTICE" }))).toEqual([]);
  });

  it("rejects a notice scan of the wrong type", () => {
    const file = new File(["x"], "notice.txt", { type: "text/plain" });
    expect(
      paths(eventFormIssues(values({ notice_type: "OTHER", file }), ctx({ eventType: "NOTICE" }))),
    ).toEqual(["file"]);
    const pdf = new File(["x"], "notice.pdf", { type: "application/pdf" });
    expect(eventFormIssues(values({ notice_type: "OTHER", file: pdf }), ctx({ eventType: "NOTICE" }))).toEqual([]);
  });

  it("needs spell, hours > 0 within the spell, and a reason on an hour cut", () => {
    const c = ctx({ eventType: "HOURS_CUT" });
    expect(paths(eventFormIssues(values({}), c))).toEqual(["hours_cut", "remarks", "spell_id"]);
    expect(eventFormIssues(values({ spell_id: 1, hours_cut: "2", remarks: "late" }), c)).toEqual([]);
    expect(paths(eventFormIssues(values({ spell_id: 1, hours_cut: "0", remarks: "x" }), c))).toEqual(["hours_cut"]);
    expect(paths(eventFormIssues(values({ spell_id: 1, hours_cut: "6", remarks: "x" }), c))).toEqual(["hours_cut"]);
    expect(paths(eventFormIssues(values({ spell_id: 9, hours_cut: "1", remarks: "x" }), c))).toEqual(["spell_id"]);
    // Spell without working hours: no cap.
    expect(eventFormIssues(values({ spell_id: 2, hours_cut: "12", remarks: "x" }), c)).toEqual([]);
  });

  it("caps the total of the date + spell at the spell's hours", () => {
    const c = ctx({ eventType: "HOURS_CUT", events: [cut(10, 3)] });
    expect(eventFormIssues(values({ spell_id: 1, hours_cut: "2", remarks: "x" }), c)).toEqual([]);
    const over = eventFormIssues(values({ spell_id: 1, hours_cut: "2.5", remarks: "x" }), c);
    expect(paths(over)).toEqual(["hours_cut"]);
    expect(over[0].message).toMatch(/3 h already cut/);
    // Editing that same cut does not count against itself.
    expect(
      eventFormIssues(values({ spell_id: 1, hours_cut: "5", remarks: "x" }), { ...c, editingId: 10 }),
    ).toEqual([]);
  });
});

describe("event payload + defaults", () => {
  it("nulls the fields of other event types", () => {
    expect(
      eventPayloadFields(
        values({ notice_type: "OTHER", issued_by: " HR ", spell_id: 1, hours_cut: "2", remarks: " ok " }),
        "NOTICE",
      ),
    ).toEqual({
      event_date: "2026-10-01",
      notice_type: "OTHER",
      issued_by: "HR",
      spell_id: null,
      hours_cut: null,
      remarks: "ok",
    });
    expect(eventPayloadFields(values({ spell_id: 1, hours_cut: "1.5", remarks: "late" }), "HOURS_CUT")).toEqual({
      event_date: "2026-10-01",
      notice_type: null,
      issued_by: null,
      spell_id: 1,
      hours_cut: 1.5,
      remarks: "late",
    });
  });

  it("parses hours", () => {
    expect(parseHours("")).toBeNull();
    expect(parseHours("abc")).toBeNull();
    expect(parseHours(" 2.5 ")).toBe(2.5);
  });

  it("starts a new entry today and an edit from the event", () => {
    expect(eventFormDefaults(null, TODAY).event_date).toBe(TODAY);
    const d = eventFormDefaults(cut(3, 2.5), TODAY);
    expect(d).toMatchObject({ event_date: "2026-10-01", spell_id: 1, hours_cut: "2.5", remarks: "late" });
  });

  it("validates through the zod schema", () => {
    const schema = makeEventSchema(ctx({ eventType: "REMARK" }));
    expect(schema.safeParse(values({ remarks: "ok" })).success).toBe(true);
    expect(schema.safeParse(values({})).success).toBe(false);
  });
});

describe("edit / close schemas", () => {
  it("keeps the start date on or before the first entry", () => {
    const schema = makeEditFollowupSchema(TODAY, "2026-09-25");
    expect(schema.safeParse({ reason: "", start_date: "2026-09-25", review_date: "" }).success).toBe(true);
    expect(schema.safeParse({ reason: "", start_date: "2026-09-26", review_date: "" }).success).toBe(false);
    expect(schema.safeParse({ reason: "", start_date: "2026-09-20", review_date: "2026-09-19" }).success).toBe(
      false,
    );
  });

  it("closes between the start date and today with a reason", () => {
    const schema = makeCloseFollowupSchema(START, TODAY);
    expect(schema.safeParse({ closed_date: TODAY, close_reason: "IMPROVED", close_remarks: "" }).success).toBe(true);
    expect(schema.safeParse({ closed_date: TODAY, close_reason: "", close_remarks: "" }).success).toBe(false);
    expect(
      schema.safeParse({ closed_date: "2026-09-01", close_reason: "LEFT", close_remarks: "" }).success,
    ).toBe(false);
  });

  it("refuses a closed date before the last timeline entry", () => {
    const schema = makeCloseFollowupSchema(START, TODAY, "2026-09-27");
    const at = (d: string) => schema.safeParse({ closed_date: d, close_reason: "IMPROVED", close_remarks: "" });
    expect(at("2026-09-27").success).toBe(true);
    const before = at("2026-09-26");
    expect(before.success).toBe(false);
    expect(before.error?.issues[0]?.message).toBe("Closed date cannot be before the last entry (27-09-2026)");
    // the start / future rules still come first
    expect(at("2026-09-01").error?.issues[0]?.message).toMatch(/before the start date/);
  });

  it("caps close remarks at the column's 500 characters (not the 1000 of timeline remarks)", () => {
    const schema = makeCloseFollowupSchema(START, TODAY);
    const at = (n: number) => ({ closed_date: TODAY, close_reason: "LEFT", close_remarks: "x".repeat(n) });
    expect(schema.safeParse(at(REASON_MAX)).success).toBe(true);
    expect(schema.safeParse(at(REASON_MAX + 1)).success).toBe(false);
  });
});

describe("perfWindowSchema", () => {
  it("wants both dates or neither, in order", () => {
    expect(perfWindowSchema.safeParse({ from: "", to: "" }).success).toBe(true);
    expect(perfWindowSchema.safeParse({ from: "2026-09-01", to: "2026-09-30" }).success).toBe(true);
    expect(perfWindowSchema.safeParse({ from: "2026-09-01", to: "" }).success).toBe(false);
    expect(perfWindowSchema.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success).toBe(false);
  });
});
