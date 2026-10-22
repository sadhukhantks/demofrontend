import { describe, expect, it } from "vitest";
import { reportTotalLevel } from "@/components/reports/ReportGrid";
import type {
  BaleRegisterDay,
  BaleRegisterDespatchDetail,
  BaleRegisterGroup,
  BaleRegisterPeriod,
  BaleRegisterReport,
} from "@/utils/juteProductionReportService";
import {
  EXPORT_COLUMNS,
  GRAND_TOTAL_LABEL,
  MAX_RANGE_DAYS,
  SECTION_DESPATCH,
  SECTION_PERIOD,
  SECTION_REGISTER,
  TOTAL_LABEL,
  despatchGroupLabel,
  despatchRefLabel,
  flattenRegister,
  groupLabel,
  isIdleDay,
  isRegisterEmpty,
  qualityTypeLabel,
  qualityTypeParam,
  rangeDays,
  validateDateRange,
} from "./registerShape";

const day = (
  date: string,
  opening: number,
  pressed = 0,
  repacked = 0,
  despInv = 0,
  despChallan = 0,
): BaleRegisterDay => ({
  date,
  opening,
  pressed,
  repacked_out: repacked,
  despatched_invoice: despInv,
  despatched_no_invoice: despChallan,
  despatched: despInv + despChallan,
  closing: opening + pressed - repacked - despInv - despChallan,
});

const period = (over: Partial<BaleRegisterPeriod> = {}): BaleRegisterPeriod => ({
  opening: 0,
  opening_kg: 0,
  opening_mt: 0,
  pressed: 0,
  repacked_out: 0,
  despatched_invoice: 0,
  despatched_no_invoice: 0,
  despatched: 0,
  closing: 0,
  closing_kg: 0,
  closing_mt: 0,
  ...over,
});

const group = (over: Partial<BaleRegisterGroup> = {}): BaleRegisterGroup => ({
  key: "q:2",
  finishing_quality_id: 2,
  item_name: "SACKING B-TWILL",
  quality_type: 2,
  bale_series_id: null,
  series_name: null,
  days: [],
  period: period(),
  ...over,
});

const detail = (over: Partial<BaleRegisterDespatchDetail> = {}): BaleRegisterDespatchDetail => ({
  date: "2026-10-12",
  series_name: "PUNJAB",
  item_name: "SACKING B-TWILL",
  quality_type: 2,
  bale_nos: "606-607",
  count: 2,
  invoice_id: null,
  invoice_no: null,
  invoice_date: null,
  party_name: null,
  despatch_reason_label: "Delivery challan",
  despatch_ref: "CH-77",
  remarks: null,
  ...over,
});

const report = (over: Partial<BaleRegisterReport> = {}): BaleRegisterReport => ({
  date_from: "2026-10-06",
  date_to: "2026-10-07",
  group_by: "quality",
  co_name: "The Empire Jute Company Limited",
  branch_name: "Factory",
  groups: [],
  totals: { hessian: period(), sacking: period(), all: period() },
  despatch_detail: [],
  ...over,
});

const hessianGroup = group({
  key: "q:1",
  finishing_quality_id: 1,
  item_name: "HESSIAN CLOTH 40-6.5",
  quality_type: 1,
  days: [day("2026-10-06", 10, 3), day("2026-10-07", 13, 0, 0, 2)],
  period: period({ opening: 10, pressed: 3, despatched_invoice: 2, despatched: 2, closing: 11, closing_mt: 2.515 }),
});

const sackingGroup = group({
  days: [day("2026-10-06", 100, 13, 0, 2), day("2026-10-07", 111, 26, 2, 0, 2)],
  period: period({
    opening: 100,
    opening_mt: 29,
    pressed: 39,
    repacked_out: 2,
    despatched_invoice: 2,
    despatched_no_invoice: 2,
    despatched: 4,
    closing: 133,
    closing_kg: 38570,
    closing_mt: 38.57,
  }),
});

describe("flattenRegister — day rows", () => {
  const rows = flattenRegister(report({ groups: [sackingGroup] }));

  it("emits one REGISTER row per calendar day, zero-movement days included", () => {
    expect(rows[0]).toEqual({
      group: "SACKING B-TWILL",
      section: SECTION_REGISTER,
      date: "2026-10-06",
      opening: 100,
      pressed: 13,
      repacked_out: 0,
      despatched_invoice: 2,
      despatched_no_invoice: 0,
      closing: 111,
      closing_mt: null,
      bale_nos: "",
      count: null,
      reference: "",
      party: "",
    });
    expect(rows[1]).toMatchObject({
      date: "2026-10-07",
      opening: 111,
      pressed: 26,
      repacked_out: 2,
      despatched_no_invoice: 2,
      closing: 133,
    });
  });

  it("closes each group with a Total row carrying the period figures and closing MT", () => {
    expect(rows[2]).toMatchObject({
      group: "SACKING B-TWILL",
      section: SECTION_REGISTER,
      date: TOTAL_LABEL,
      opening: 100,
      pressed: 39,
      repacked_out: 2,
      despatched_invoice: 2,
      despatched_no_invoice: 2,
      closing: 133,
      closing_mt: 38.57,
    });
  });

  it("keeps the zero days of an idle group — a register lists every day", () => {
    const idle = flattenRegister(
      report({
        groups: [group({ days: [day("2026-10-06", 5), day("2026-10-07", 5)], period: period({ opening: 5, closing: 5 }) })],
      }),
    );
    expect(idle.filter((r) => r.section === SECTION_REGISTER && r.date !== TOTAL_LABEL)).toHaveLength(2);
    expect(idle[0]).toMatchObject({ pressed: 0, repacked_out: 0, despatched_invoice: 0, despatched_no_invoice: 0 });
  });
});

describe("flattenRegister — period summary", () => {
  const rows = flattenRegister(
    report({
      groups: [hessianGroup, sackingGroup],
      totals: {
        hessian: period({ opening: 10, pressed: 3, despatched_invoice: 2, despatched: 2, closing: 11, closing_mt: 2.515 }),
        sacking: period({ opening: 100, pressed: 39, repacked_out: 2, despatched_invoice: 2, despatched_no_invoice: 2, despatched: 4, closing: 133, closing_mt: 38.57 }),
        all: period({ opening: 110, pressed: 42, repacked_out: 2, despatched_invoice: 4, despatched_no_invoice: 2, despatched: 6, closing: 144, closing_mt: 41.085 }),
      },
    }),
  );
  const periodRows = rows.filter((r) => r.section === SECTION_PERIOD);

  it("follows every register block with one PERIOD row per group, in API order", () => {
    // 2 groups × (2 days + Total) = 6 register rows first.
    expect(rows.slice(0, 6).every((r) => r.section === SECTION_REGISTER)).toBe(true);
    expect(periodRows[0]).toMatchObject({
      group: "HESSIAN CLOTH 40-6.5",
      date: "",
      opening: 10,
      pressed: 3,
      closing: 11,
      closing_mt: 2.515,
    });
    expect(periodRows[1]).toMatchObject({ group: "SACKING B-TWILL", date: "", closing: 133, closing_mt: 38.57 });
  });

  it("then the Hessian / Sacking totals and the Grand Total", () => {
    expect(periodRows[2]).toMatchObject({ group: "Hessian", date: TOTAL_LABEL, closing: 11 });
    expect(periodRows[3]).toMatchObject({ group: "Sacking", date: TOTAL_LABEL, closing: 133 });
    expect(periodRows[4]).toMatchObject({
      group: GRAND_TOTAL_LABEL,
      date: TOTAL_LABEL,
      opening: 110,
      pressed: 42,
      repacked_out: 2,
      despatched_invoice: 4,
      despatched_no_invoice: 2,
      closing: 144,
      closing_mt: 41.085,
    });
    expect(periodRows).toHaveLength(5);
  });

  it("skips the type total of a quality type with no group", () => {
    const onlySacking = flattenRegister(report({ groups: [sackingGroup] })).filter(
      (r) => r.section === SECTION_PERIOD,
    );
    expect(onlySacking.map((r) => r.group)).toEqual(["SACKING B-TWILL", "Sacking", GRAND_TOTAL_LABEL]);
  });

  it("emits no period rows at all when there is no group", () => {
    expect(flattenRegister(report()).filter((r) => r.section === SECTION_PERIOD)).toEqual([]);
  });
});

describe("flattenRegister — grouped by series", () => {
  it("labels the rows '<series> · <quality>'", () => {
    const rows = flattenRegister(
      report({
        group_by: "series",
        groups: [
          group({
            key: "s:2:2",
            bale_series_id: 2,
            series_name: "PUNJAB",
            days: [day("2026-10-06", 1)],
            period: period({ opening: 1, closing: 1 }),
          }),
        ],
      }),
    );
    expect(rows[0].group).toBe("PUNJAB · SACKING B-TWILL");
    expect(rows.find((r) => r.section === SECTION_PERIOD)?.group).toBe("PUNJAB · SACKING B-TWILL");
  });
});

describe("flattenRegister — despatch detail", () => {
  it("appends one DESPATCH row per detail line, after the period rows", () => {
    const rows = flattenRegister(
      report({
        groups: [sackingGroup],
        despatch_detail: [
          detail(),
          detail({
            date: "2026-10-06",
            series_name: null,
            item_name: "HESSIAN CLOTH 40-6.5",
            quality_type: 1,
            bale_nos: "601, 603-604",
            count: 3,
            invoice_id: 55,
            invoice_no: "SI/26-27/0012",
            invoice_date: "2026-10-06",
            party_name: "ACME TRADERS",
            despatch_reason_label: null,
            despatch_ref: null,
          }),
        ],
      }),
    );
    const desp = rows.filter((r) => r.section === SECTION_DESPATCH);
    expect(rows.indexOf(desp[0])).toBeGreaterThan(rows.findIndex((r) => r.group === GRAND_TOTAL_LABEL));
    expect(desp[0]).toEqual({
      group: "PUNJAB · SACKING B-TWILL",
      section: SECTION_DESPATCH,
      date: "2026-10-12",
      opening: null,
      pressed: null,
      repacked_out: null,
      despatched_invoice: null,
      despatched_no_invoice: 2,
      closing: null,
      closing_mt: null,
      bale_nos: "606-607",
      count: 2,
      reference: "Delivery challan · CH-77",
      party: "",
    });
    expect(desp[1]).toMatchObject({
      group: "HESSIAN CLOTH 40-6.5",
      date: "2026-10-06",
      despatched_invoice: 3,
      despatched_no_invoice: null,
      bale_nos: "601, 603-604",
      count: 3,
      reference: "#SI/26-27/0012 · 2026-10-06",
      party: "ACME TRADERS",
    });
  });

  it("lists despatch lines even when no group survived (nothing else to print)", () => {
    const rows = flattenRegister(report({ despatch_detail: [detail()] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].section).toBe(SECTION_DESPATCH);
  });
});

describe("labels", () => {
  it("groupLabel: quality name, or series · quality when grouped by series", () => {
    expect(groupLabel({ item_name: "S1", series_name: null }, "quality")).toBe("S1");
    expect(groupLabel({ item_name: "S1", series_name: "BIHAR" }, "quality")).toBe("S1");
    expect(groupLabel({ item_name: "S1", series_name: "BIHAR" }, "series")).toBe("BIHAR · S1");
    expect(groupLabel({ item_name: null, series_name: null }, "series")).toBe("— · —");
  });

  it("despatchGroupLabel: series · quality when the line has a series", () => {
    expect(despatchGroupLabel({ item_name: "S1", series_name: "BIHAR" })).toBe("BIHAR · S1");
    expect(despatchGroupLabel({ item_name: "H1", series_name: null })).toBe("H1");
    expect(despatchGroupLabel({ item_name: null, series_name: null })).toBe("—");
  });

  it("despatchRefLabel: invoice '#no · date', else reason · ref", () => {
    expect(
      despatchRefLabel({ invoice_no: "SI/1", invoice_date: "2026-10-06", despatch_reason_label: null, despatch_ref: null }),
    ).toBe("#SI/1 · 2026-10-06");
    expect(
      despatchRefLabel({ invoice_no: "SI/1", invoice_date: null, despatch_reason_label: null, despatch_ref: null }),
    ).toBe("#SI/1");
    expect(
      despatchRefLabel({ invoice_no: null, invoice_date: null, despatch_reason_label: "Transfer", despatch_ref: "T-9" }),
    ).toBe("Transfer · T-9");
    expect(
      despatchRefLabel({ invoice_no: null, invoice_date: null, despatch_reason_label: "Sample", despatch_ref: null }),
    ).toBe("Sample");
    expect(
      despatchRefLabel({ invoice_no: null, invoice_date: null, despatch_reason_label: null, despatch_ref: null }),
    ).toBe("No invoice");
  });

  it("qualityTypeLabel / qualityTypeParam", () => {
    expect(qualityTypeLabel(1)).toBe("Hessian");
    expect(qualityTypeLabel(2)).toBe("Sacking");
    expect(qualityTypeLabel(null)).toBe("");
    expect(qualityTypeParam("ALL")).toBeUndefined();
    expect(qualityTypeParam("HESSIAN")).toBe(1);
    expect(qualityTypeParam("SACKING")).toBe(2);
  });

  it("isIdleDay: true only when nothing moved", () => {
    expect(isIdleDay(day("2026-10-06", 5))).toBe(true);
    expect(isIdleDay(day("2026-10-06", 5, 1))).toBe(false);
    expect(isIdleDay(day("2026-10-06", 5, 0, 1))).toBe(false);
    expect(isIdleDay(day("2026-10-06", 5, 0, 0, 0, 1))).toBe(false);
  });

  it("isRegisterEmpty: no group and no despatch line", () => {
    expect(isRegisterEmpty(report())).toBe(true);
    expect(isRegisterEmpty(report({ groups: [sackingGroup] }))).toBe(false);
    expect(isRegisterEmpty(report({ despatch_detail: [detail()] }))).toBe(false);
  });
});

describe("validateDateRange", () => {
  const today = "2026-10-12";

  it("accepts an in-order range ending today or earlier", () => {
    expect(validateDateRange("2026-10-06", "2026-10-12", today)).toBeNull();
    expect(validateDateRange("2026-10-12", "2026-10-12", today)).toBeNull();
  });

  it("refuses a missing date, from after to, to after today, and over 92 days", () => {
    expect(validateDateRange("", "2026-10-12", today)).toBe("Enter both dates");
    expect(validateDateRange("2026-10-13", "2026-10-12", today)).toMatch(/From date/);
    expect(validateDateRange("2026-10-06", "2026-10-13", today)).toMatch(/after today/);
    expect(validateDateRange("2026-07-01", "2026-10-12", today)).toBe(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
    // Exactly 92 days is allowed.
    expect(rangeDays("2026-07-13", "2026-10-12")).toBe(92);
    expect(validateDateRange("2026-07-13", "2026-10-12", today)).toBeNull();
  });

  it("rangeDays is inclusive of both ends", () => {
    expect(rangeDays("2026-10-06", "2026-10-12")).toBe(7);
    expect(rangeDays("2026-10-12", "2026-10-12")).toBe(1);
    expect(rangeDays("bad", "2026-10-12")).toBeNaN();
  });
});

describe("EXPORT_COLUMNS", () => {
  const rows = flattenRegister(
    report({
      groups: [hessianGroup, sackingGroup],
      despatch_detail: [detail()],
    }),
  );
  const lead = String(EXPORT_COLUMNS[0].field);

  it("leads with the group column so the exporter reads the total level off it", () => {
    expect(lead).toBe("group");
  });

  it("shades day and despatch rows as nothing, group totals as group, the Grand Total as grand", () => {
    expect(reportTotalLevel(rows[0], lead)).toBeNull();
    expect(reportTotalLevel(rows[2], lead)).toBe("group"); // hessian group Total
    const periodGroupRow = rows.find((r) => r.section === SECTION_PERIOD && r.date === "");
    expect(periodGroupRow && reportTotalLevel(periodGroupRow, lead)).toBeNull();
    expect(reportTotalLevel(rows.find((r) => r.group === "Hessian")!, lead)).toBe("group");
    expect(reportTotalLevel(rows.find((r) => r.group === GRAND_TOTAL_LABEL)!, lead)).toBe("grand");
    expect(reportTotalLevel(rows[rows.length - 1], lead)).toBeNull();
  });

  it("covers every FlatRow field, so nothing is dropped from the sheet", () => {
    expect(EXPORT_COLUMNS.map((c) => c.field).sort()).toEqual(Object.keys(rows[0]).sort());
  });
});
