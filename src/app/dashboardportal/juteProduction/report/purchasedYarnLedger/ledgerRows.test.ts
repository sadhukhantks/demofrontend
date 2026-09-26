import { describe, expect, it } from "vitest";
import type { LedgerException, LedgerRow } from "./_service";
import {
  daysInclusive,
  flaggedItemIds,
  floorCountEntries,
  groupExceptions,
  labelOf,
  monthFromDateParam,
  monthLabel,
  severityOf,
  sumTotals,
} from "./ledgerRows";

const row = (over: Partial<LedgerRow>): LedgerRow => ({
  item_id: 1,
  item_name: "13 LBS SKWP",
  item_code: "Y13",
  yarn_count: 13,
  godown_opening_kg: 0,
  purchases_kg: 0,
  issues_kg: 0,
  returns_kg: 0,
  godown_book_closing_kg: 0,
  godown_count_closing_kg: null,
  godown_diff_kg: null,
  floor_opening_kg: 0,
  floor_closing_kg: 0,
  consumption_kg: 0,
  days_of_stock: null,
  depts: [],
  ...over,
});

describe("exception severity mapping", () => {
  it("maps every backend code to the agreed colour", () => {
    expect(severityOf("GODOWN_BOOK_NEGATIVE")).toBe("error");
    expect(severityOf("GODOWN_DIFF")).toBe("error");
    expect(severityOf("DEPT_NO_FLOOR_COUNT")).toBe("warning");
    expect(severityOf("LEGACY_STORES_RECEIPTS")).toBe("warning");
    expect(severityOf("ITEM_WITHOUT_YARN_MASTER")).toBe("warning");
    expect(severityOf("FLOOR_DAYS_OVER")).toBe("info");
  });

  it("shows an unknown code as a warning under its raw code", () => {
    expect(severityOf("SOMETHING_NEW")).toBe("warning");
    expect(labelOf("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(labelOf("GODOWN_DIFF")).toBe("Godown count differs from book");
  });

  it("groups worst-first, keeps backend order inside a group, drops empty groups", () => {
    const ex: LedgerException[] = [
      { code: "FLOOR_DAYS_OVER", message: "a" },
      { code: "DEPT_NO_FLOOR_COUNT", message: "b", dept_id: 4 },
      { code: "GODOWN_DIFF", message: "c", item_id: 1, value: -12 },
      { code: "LEGACY_STORES_RECEIPTS", message: "d" },
      { code: "GODOWN_BOOK_NEGATIVE", message: "e", item_id: 2 },
    ];
    const groups = groupExceptions(ex);
    expect(groups.map((g) => g.severity)).toEqual(["error", "warning", "info"]);
    expect(groups[0].items.map((i) => i.message)).toEqual(["c", "e"]);
    expect(groups[1].items.map((i) => i.message)).toEqual(["b", "d"]);
    expect(groups[2].items.map((i) => i.message)).toEqual(["a"]);
    expect(groupExceptions([])).toEqual([]);
    expect(groupExceptions([{ code: "FLOOR_DAYS_OVER", message: "x" }]).map((g) => g.severity)).toEqual([
      "info",
    ]);
  });

  it("collects the item ids flagged with a code", () => {
    const ex: LedgerException[] = [
      { code: "GODOWN_DIFF", message: "", item_id: 7 },
      { code: "GODOWN_DIFF", message: "", item_id: 9 },
      { code: "GODOWN_BOOK_NEGATIVE", message: "", item_id: 11 },
      { code: "GODOWN_DIFF", message: "" },
    ];
    expect([...flaggedItemIds(ex, "GODOWN_DIFF")].sort()).toEqual([7, 9]);
    expect(flaggedItemIds(ex, "FLOOR_DAYS_OVER").size).toBe(0);
  });
});

describe("totals", () => {
  const rows: LedgerRow[] = [
    row({
      item_id: 1,
      godown_opening_kg: 1000,
      purchases_kg: 2500,
      issues_kg: 1800,
      returns_kg: 100,
      godown_book_closing_kg: 1800,
      godown_count_closing_kg: 1790.5,
      godown_diff_kg: -9.5,
      floor_opening_kg: 200,
      floor_closing_kg: 300,
      consumption_kg: 1600,
    }),
    row({
      item_id: 2,
      godown_opening_kg: 0,
      purchases_kg: 400,
      issues_kg: 400,
      returns_kg: 0,
      godown_book_closing_kg: 0,
      godown_count_closing_kg: null,
      godown_diff_kg: null,
      floor_opening_kg: 0,
      floor_closing_kg: 50.25,
      consumption_kg: 349.75,
    }),
  ];

  it("sums every kg column and derives book, count, difference", () => {
    const t = sumTotals(rows);
    expect(t.godown_opening_kg).toBe(1000);
    expect(t.purchases_kg).toBe(2900);
    expect(t.issues_kg).toBe(2200);
    expect(t.returns_kg).toBe(100);
    expect(t.godown_book_closing_kg).toBe(1800);
    // Item 2 has no count, so it adds 0 to the counted total; the count
    // still exists at branch level because item 1 was counted.
    expect(t.godown_count_closing_kg).toBe(1790.5);
    expect(t.godown_diff_kg).toBe(-9.5);
    expect(t.floor_opening_kg).toBe(200);
    expect(t.floor_closing_kg).toBe(350.25);
    expect(t.consumption_kg).toBe(1949.75);
    expect(t.days_of_stock).toBeNull();
  });

  it("gives days of stock only with a window and some consumption", () => {
    // 350.25 floor / (1949.75 / 30 per day) = 5.4 days
    expect(sumTotals(rows, 30).days_of_stock).toBe(5.4);
    expect(sumTotals([row({ floor_closing_kg: 10 })], 30).days_of_stock).toBeNull();
  });

  it("leaves count and difference null when nothing was counted", () => {
    const t = sumTotals([row({ godown_book_closing_kg: 5 }), row({ item_id: 2 })]);
    expect(t.godown_count_closing_kg).toBeNull();
    expect(t.godown_diff_kg).toBeNull();
    expect(t.godown_book_closing_kg).toBe(5);
  });

  it("is all zeros for no rows", () => {
    const t = sumTotals([]);
    expect(t.purchases_kg).toBe(0);
    expect(t.godown_count_closing_kg).toBeNull();
    expect(t.days_of_stock).toBeNull();
  });
});

describe("month helpers", () => {
  it("derives the month param from the hub's date and from today", () => {
    expect(monthFromDateParam("2026-09-18")).toBe("2026-09");
    expect(monthFromDateParam("2026-09")).toBe("2026-09");
    expect(monthFromDateParam("nonsense")).toBeNull();
    expect(monthFromDateParam(null)).toBeNull();
  });

  it("labels a month and counts window days inclusively", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(daysInclusive("2026-09-01", "2026-09-30")).toBe(30);
    expect(daysInclusive("2026-02-01", "2026-02-28")).toBe(28);
    expect(daysInclusive("2026-09-30", "2026-09-01")).toBeNull();
  });
});

describe("floor count dates", () => {
  it("resolves dept ids to names through the rows and keeps unknown ids", () => {
    const rows = [
      row({
        depts: [
          {
            dept_id: 4,
            dept_desc: "Weaving",
            floor_opening_kg: 0,
            issues_kg: 0,
            returns_kg: 0,
            floor_closing_kg: 0,
            consumption_kg: 0,
          },
        ],
      }),
    ];
    const entries = floorCountEntries(
      { floor_count_dates: { "4": "2026-09-30", "9": "2026-09-29" } },
      rows,
    );
    expect(entries).toEqual([
      { dept_id: "9", dept_desc: "9", date: "2026-09-29" },
      { dept_id: "4", dept_desc: "Weaving", date: "2026-09-30" },
    ]);
    expect(floorCountEntries({ floor_count_dates: {} }, rows)).toEqual([]);
  });

  it("falls back to the dept id when the breakdown carries no description", () => {
    const rows = [
      row({
        depts: [
          {
            dept_id: 4,
            dept_desc: null,
            floor_opening_kg: 0,
            issues_kg: 0,
            returns_kg: 0,
            floor_closing_kg: 0,
            consumption_kg: 0,
          },
        ],
      }),
    ];
    expect(floorCountEntries({ floor_count_dates: { "4": "2026-09-30" } }, rows)).toEqual([
      { dept_id: "4", dept_desc: "4", date: "2026-09-30" },
    ]);
  });
});
