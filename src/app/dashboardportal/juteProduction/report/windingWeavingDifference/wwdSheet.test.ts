import { describe, expect, it } from "vitest";
import type {
  WindingWeavingDifference,
  WwdReconciliation,
} from "@/utils/juteProductionReportService";
import { buildWwdPdfSpec, wwdWarningTexts } from "./wwdSheet";

const RECON: WwdReconciliation = {
  opening_mt: 0.5,
  spinning_mt: 20.138,
  winding_mt: 1.2,
  twisting_mt: 0,
  weaving_mt: 0,
  purchase_mt: 0,
  sale_mt: 0,
  should_be_closing_mt: 1.7,
  actual_closing_mt: 1.581,
  difference_mt: -0.119,
  difference_pct: -9.92,
  jute_issue_mt: 19.274,
};

const row = (bucket: string, pkg: string, stock: number) => ({
  bucket,
  item_code: null,
  item_name: "13 LBS SKWP",
  quality_name: "SKWP",
  yarn_count: null,
  package_label: pkg,
  area_name: "Winding Floor",
  no_of_samples: 100,
  wt_per_sample: 10,
  prvs_stock_mt: 0.527,
  stock_mt: stock,
});

const DATA: WindingWeavingDifference = {
  report_date: "2026-09-18",
  date_from: "2026-09-01",
  stock: {
    MILL_USE: { rows: [row("MILL_USE", "SKG", 1.0), row("MILL_USE", "PW SPOOL", 0.567)], subtotal_mt: 1.567 },
    PURCHASE: { rows: [], subtotal_mt: 0 },
    SALE_YARN: { rows: [], subtotal_mt: 0 },
    BALL: { rows: [row("BALL", "bleach ball", 0.014)], subtotal_mt: 0.014 },
    WASTE: { rows: [], subtotal_mt: 0 },
    grand_total_mt: 1.581,
  },
  stock_summary: {
    bucket: "MILL_USE",
    rows: [
      {
        item_id: 1,
        item_code: null,
        item_name: "13 LBS SKWP",
        quality_name: "SKWP",
        yarn_count: null,
        total_mt: 1.567,
        prvs_stock_mt: 0.527,
        line_count: 2,
      },
    ],
    total_mt: 1.567,
    prvs_total_mt: 0.527,
  },
  production: { day: RECON, mtd: RECON },
  cloth_split: { day: { HESSIAN: 1, SACKING: 0, OTHER: 0 }, mtd: { HESSIAN: 2, SACKING: 0, OTHER: 0 } },
  chain: { ok: true, prev_entry_date: "2026-09-17", month_opening_date: "2026-08-31" },
  warnings: { purchase_unknown_uoms: [], weaving_unresolved_day: 0, weaving_unresolved_mtd: 0 },
  note: "Book stock note",
};

const titles = (d: WindingWeavingDifference) =>
  buildWwdPdfSpec(d, { companyName: "SLS", branchName: "FACTORY" }).sections.map((s) => s.title);

describe("buildWwdPdfSpec", () => {
  it("carries the letterhead: company, title, branch and report date", () => {
    const spec = buildWwdPdfSpec(DATA, { companyName: "SLS", branchName: "FACTORY" });
    expect(spec.companyName).toBe("SLS");
    expect(spec.title).toBe("Winding & Weaving Difference");
    expect(spec.subtitleLines?.[0]).toContain("Branch: FACTORY");
    expect(spec.subtitleLines?.[0]).toContain("2026-09-18 (MTD from 2026-09-01)");
    expect(spec.fileName).toBe("Winding-Weaving-Difference-FACTORY-2026-09-18");
    expect(spec.closingLines).toEqual(["Grand Total Stock: 1.581 MT"]);
    expect(spec.footNote).toBe("Book stock note");
  });

  it("keeps the screen's block order and skips empty stock blocks", () => {
    expect(titles(DATA)).toEqual([
      "Production Reconciliation",
      "Weaving Cloth Split (MT)",
      "Yarn for Mill Use — Consolidated Position (Yarn Quality wise)",
      "Yarn for Mill Use — Details",
      "Ball Stock",
    ]);
  });

  it("prints the reconciliation with the Difference (MT) row as the shaded total", () => {
    const recon = buildWwdPdfSpec(DATA, {}).sections[0];
    const spinning = recon.body.findIndex((r) => r[0] === "Spinning Production (MT)");
    expect(recon.body[spinning + 1][0]).toBe("Winding Production (MT)");
    const last = recon.body[recon.body.length - 1];
    expect(last).toEqual(["Difference (MT)", "-0.119", "-0.119"]);
    expect(recon.totalRows).toEqual([recon.body.length - 1]);
    expect(recon.struckCells).toEqual([]);
  });

  it("strikes the Today column and blanks its difference when the chain is broken", () => {
    const broken = { ...DATA, chain: { ...DATA.chain, ok: false, prev_entry_date: "2026-09-15" } };
    const spec = buildWwdPdfSpec(broken, {});
    const recon = spec.sections[0];
    expect(recon.head?.[1]).toBe("Today (not comparable)");
    expect(recon.struckCells).toContainEqual([0, 1]);
    expect(recon.struckCells?.some(([, c]) => c === 2)).toBe(false);
    expect(recon.body[recon.body.length - 1][1]).toBe("— not comparable");
    expect(spec.preface?.[0].text).toContain("Today Difference %: not comparable");
    expect(spec.preface?.some((p) => p.tone === "warning" && p.text.includes("2026-09-15"))).toBe(true);
  });

  it("always includes the subtotal and mill-use total rows", () => {
    const sections = buildWwdPdfSpec(DATA, {}).sections;
    const consolidated = sections[2];
    expect(consolidated.body[consolidated.body.length - 1]).toEqual(["Total (Mill Use)", "", "", "0.527", "1.567"]);
    const details = sections[3];
    expect(details.body).toHaveLength(3);
    expect(details.body[2][6]).toBe("1.567");
  });

  it("adds the purchase documents with a kg total and flags a mismatch", () => {
    const withDocs: WindingWeavingDifference = {
      ...DATA,
      production: { day: RECON, mtd: { ...RECON, purchase_mt: 3.4 } },
      purchase_detail: [
        { yarn_purchase_id: 7, purchase_no: "YP/26-27/0007", tran_date: "2026-09-03", item_id: 1, item_name: "X", yarn_count: 8, kg: 1250 },
        { yarn_purchase_id: 9, purchase_no: "YP/26-27/0009", tran_date: null, item_id: 1, item_name: "X", yarn_count: 8, kg: 3401 },
      ],
    };
    const docs = buildWwdPdfSpec(withDocs, {}).sections[1];
    expect(docs.title).toBe("Purchase yarn (documents)");
    expect(docs.body[2]).toEqual(["Total (4.651 MT)", "", "", "", "4,651.000"]);
    expect(docs.notes?.[0]).toMatch(/were not built from the same documents/);
  });
});

describe("wwdWarningTexts", () => {
  it("is empty for a clean report and carries the legacy MT figure when set", () => {
    expect(wwdWarningTexts(DATA)).toEqual([]);
    const legacy = {
      ...DATA,
      warnings: { ...DATA.warnings, legacy_stores_yarn_mt: 0.42, legacy_stores_yarn_warning: "Legacy receipts exist." },
    };
    expect(wwdWarningTexts(legacy)).toEqual([
      "Legacy receipts exist. Stores receipts of the legacy yarn item this month: 0.420 MT — not included in Purchase Yarn (MT).",
    ]);
  });
});
