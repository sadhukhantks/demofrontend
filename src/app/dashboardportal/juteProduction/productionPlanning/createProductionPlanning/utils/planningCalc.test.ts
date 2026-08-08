import { describe, expect, it } from "vitest";
import {
  applyAuto,
  autoField,
  buildDeptCascade,
  computeLoomTotals,
  computeSummary,
  computeWarnings,
  deriveYarnLines,
  manualField,
  recalcDocument,
  recalcLoomLine,
  recalcYarnLine,
  resetSectionAuto,
  round3,
  safeDiv,
  saleDailyCommitment,
} from "./planningCalc";
import {
  buildDefaultDeptLines,
  createBlankLoomLine,
  createBlankYarnLine,
  makeUid,
} from "./planningFactories";
import { STAGES } from "./planningConstants";
import type {
  DeptLineUI,
  LoomLineUI,
  PlanningDocUI,
  YarnLineUI,
} from "../types/productionPlanningTypes";

// ─── Builders ─────────────────────────────────────────────────────────────

function loomLine(p: Partial<LoomLineUI>): LoomLineUI {
  return { ...createBlankLoomLine("SACKING"), ...p };
}

function yarnLine(p: Partial<YarnLineUI>): YarnLineUI {
  const base = createBlankYarnLine((p.line_kind ?? "CLOTH") as YarnLineUI["line_kind"], "SACKING");
  return { ...base, pct_of_prod: null, order_mt: null, ...p };
}

function deptLines(): DeptLineUI[] {
  return buildDefaultDeptLines(
    STAGES.map((s) => ({
      stage_seq: s.stage_seq,
      stage_code: s.stage_code,
      stage_label: s.stage_label,
      machines_installed: null,
    })),
    () => null
  );
}

function emptyDoc(p: Partial<PlanningDocUI> = {}): PlanningDocUI {
  return {
    planning_id: null,
    plan_no: null,
    co_id: 1,
    branch_id: 2,
    plan_date: "2026-08-08",
    plan_name: "",
    remarks: "",
    loom_lines: [],
    yarn_lines: [],
    dept_lines: deptLines(),
    ...p,
  };
}

const recalcOpts = { makeUid };

// ─── Numeric helpers ──────────────────────────────────────────────────────

describe("numeric helpers", () => {
  it("round3 rounds to 3 decimals and guards NaN", () => {
    expect(round3(1.23456)).toBe(1.235);
    expect(round3(Number.NaN)).toBe(0);
  });

  it("safeDiv guards divide-by-zero to 0", () => {
    expect(safeDiv(10, 4)).toBe(2.5);
    expect(safeDiv(10, 0)).toBe(0);
  });

  it("applyAuto recomputes auto fields but preserves manual overrides", () => {
    expect(applyAuto(autoField(1), 9)).toEqual({ value: 9, auto: true });
    expect(applyAuto(manualField(5), 9)).toEqual({ value: 5, auto: false });
  });
});

// ─── Section 1: loom line ─────────────────────────────────────────────────

describe("recalcLoomLine", () => {
  it("computes kg_per_loom = round3(kg_per_loom_100 × eff/100) and prod_x = looms_x × kg_per_loom", () => {
    const out = recalcLoomLine(
      loomLine({ kg_per_loom_100: 100, eff_pct: 85, looms_a: 10, looms_b: 8, looms_c: 5 })
    );
    expect(out.kg_per_loom.value).toBe(85);
    expect(out.prod_a.value).toBe(850);
    expect(out.prod_b.value).toBe(680);
    expect(out.prod_c.value).toBe(425);
  });

  it("a manual kg_per_loom override wins and drives prod", () => {
    const out = recalcLoomLine(
      loomLine({
        kg_per_loom_100: 100,
        eff_pct: 85,
        looms_a: 10,
        kg_per_loom: manualField(90),
      })
    );
    expect(out.kg_per_loom).toEqual({ value: 90, auto: false });
    expect(out.prod_a.value).toBe(900);
  });
});

describe("computeLoomTotals", () => {
  it("totals per product group and grand cloth kg/day", () => {
    const lines = [
      loomLine({ product_group: "SACKING", prod_a: autoField(100), prod_b: autoField(50), prod_c: autoField(25) }),
      loomLine({ product_group: "SACKING", prod_a: autoField(10), prod_b: autoField(0), prod_c: autoField(0) }),
      loomLine({ product_group: "HESSIAN", prod_a: autoField(40), prod_b: autoField(40), prod_c: autoField(20) }),
    ];
    const totals = computeLoomTotals(lines);
    expect(totals.byGroup.SACKING).toEqual({ a: 110, b: 50, c: 25, day: 185 });
    expect(totals.byGroup.HESSIAN?.day).toBe(100);
    expect(totals.grand).toEqual({ a: 150, b: 90, c: 45, day: 285 });
  });
});

// ─── Section 2: deriveYarnLines ───────────────────────────────────────────

describe("deriveYarnLines", () => {
  const hessianQualityRow = () =>
    recalcLoomLine(
      loomLine({
        product_group: "HESSIAN",
        quality_item_id: 501,
        quality_desc: "Hessian 40x10",
        kg_per_loom_100: 100,
        eff_pct: 100,
        looms_a: 2,
        looms_b: 1,
        looms_c: 0,
        warp_yarn_item_id: 11,
        weft_yarn_item_id: 12,
        warp_pct: 60,
        weft_pct: 40,
      })
    );

  it("creates WP/WT rows aggregated by (section, yarn_item, warp_weft) with norm rates", () => {
    const out = deriveYarnLines({
      loomLines: [hessianQualityRow()],
      yarnLines: [],
      resolveRate: () => ({ kg_per_frame_100: 50, eff_pct: 80 }),
      resolveDesc: (id) => `Yarn-${id}`,
      makeUid,
    });
    expect(out).toHaveLength(2);
    const wp = out.find((l) => l.warp_weft === "WP")!;
    // prod_a=200, prod_b=100 → warp 60%: a=120, b=60
    expect(wp.yarn_item_id).toBe(11);
    expect(wp.section).toBe("HESSIAN");
    expect(wp.req_kg_a.value).toBe(120);
    expect(wp.req_kg_b.value).toBe(60);
    expect(wp.kg_per_frame_100).toBe(50);
    expect(wp.eff_pct).toBe(80);
    expect(wp.yarn_desc).toBe("Yarn-11");
    const wt = out.find((l) => l.warp_weft === "WT")!;
    expect(wt.req_kg_a.value).toBe(80);
  });

  it("aggregates two qualities sharing the same warp yarn into one row", () => {
    const second = recalcLoomLine(
      loomLine({
        product_group: "HESSIAN",
        quality_item_id: 502,
        kg_per_loom_100: 50,
        eff_pct: 100,
        looms_a: 2,
        warp_yarn_item_id: 11,
        warp_pct: 50,
      })
    );
    const out = deriveYarnLines({ loomLines: [hessianQualityRow(), second], yarnLines: [], makeUid });
    const wp = out.filter((l) => l.warp_weft === "WP" && l.yarn_item_id === 11);
    expect(wp).toHaveLength(1);
    // 200×0.6 + 100×0.5 = 170
    expect(wp[0].req_kg_a.value).toBe(170);
  });

  it("merges into an existing derived row, preserving user-edited rate/allocation cells", () => {
    const existing = yarnLine({
      line_kind: "CLOTH",
      section: "HESSIAN",
      yarn_item_id: 11,
      warp_weft: "WP",
      kg_per_frame_100: 42,
      frames_a: manualField(7),
      req_kg_a: autoField(999),
    });
    const out = deriveYarnLines({ loomLines: [hessianQualityRow()], yarnLines: [existing], makeUid });
    expect(out).toHaveLength(2); // merged WP + new WT
    const wp = out.find((l) => l.warp_weft === "WP")!;
    expect(wp.uid).toBe(existing.uid); // same row, not replaced
    expect(wp.req_kg_a.value).toBe(120); // auto req updated
    expect(wp.kg_per_frame_100).toBe(42); // user rate preserved
    expect(wp.frames_a).toEqual({ value: 7, auto: false }); // user allocation preserved
  });

  it("drops fully-auto derived rows whose source was removed, keeps hand-edited ones", () => {
    const autoRow = yarnLine({ line_kind: "CLOTH", section: "HESSIAN", yarn_item_id: 99, warp_weft: "WP" });
    const editedRow = yarnLine({
      line_kind: "CLOTH",
      section: "HESSIAN",
      yarn_item_id: 98,
      warp_weft: "WT",
      req_kg_a: manualField(55),
    });
    const passThrough = yarnLine({ line_kind: "SALE", section: "SALE", yarn_item_id: 97 });
    const out = deriveYarnLines({ loomLines: [], yarnLines: [autoRow, editedRow, passThrough], makeUid });
    expect(out.map((l) => l.uid)).toEqual([editedRow.uid, passThrough.uid]);
  });
});

// ─── Section 2: recalcYarnLine ────────────────────────────────────────────

describe("recalcYarnLine", () => {
  const totals = computeLoomTotals([
    recalcLoomLine(
      loomLine({ product_group: "SACKING", kg_per_loom_100: 10, eff_pct: 100, looms_a: 30, looms_b: 20, looms_c: 10 })
    ),
  ]); // SACKING a=300 b=200 c=100 day=600

  it("pct_of_prod rows pull req from the section's cloth production", () => {
    const out = recalcYarnLine(
      yarnLine({ section: "SACKING", pct_of_prod: 50, kg_per_frame_100: 100, eff_pct: 75 }),
      totals
    );
    expect(out.req_kg_a.value).toBe(150);
    expect(out.req_kg_b.value).toBe(100);
    expect(out.req_kg_c.value).toBe(50);
    expect(out.req_kg_day.value).toBe(300);
    expect(out.kg_per_frame.value).toBe(75);
    expect(out.frames_required.value).toBe(4); // 300/75
  });

  it("suggests frames_x = ceil(frames_required/3 × 10)/10", () => {
    const out = recalcYarnLine(
      yarnLine({ section: "SACKING", pct_of_prod: 50, kg_per_frame_100: 90, eff_pct: 100 }),
      totals
    );
    // req_day 300, kg_per_frame 90 → frames_required 3.33; /3 = 1.111 → ceil(11.11)/10 = 1.2
    expect(out.frames_required.value).toBe(3.33);
    expect(out.frames_a.value).toBe(1.2);
    expect(out.frames_b.value).toBe(1.2);
    expect(out.frames_c.value).toBe(1.2);
  });

  it("guards divide-by-zero rate to 0 frames_required", () => {
    const out = recalcYarnLine(
      yarnLine({ section: "SACKING", pct_of_prod: 50, kg_per_frame_100: 0, eff_pct: 0 }),
      totals
    );
    expect(out.frames_required.value).toBe(0);
  });

  it("SALE lines: commitment = frames × kg_per_frame; days_needed from order_mt", () => {
    const out = recalcYarnLine(
      yarnLine({
        line_kind: "SALE",
        section: "SALE",
        kg_per_frame_100: 100,
        eff_pct: 80,
        frames_a: autoField(2),
        frames_b: autoField(2),
        frames_c: autoField(1),
        order_mt: 40,
      }),
      totals
    );
    expect(out.kg_per_frame.value).toBe(80);
    expect(saleDailyCommitment(out)).toBe(400); // 5 frames × 80
    expect(out.req_kg_day.value).toBe(400);
    // days_needed = (40×1000/80) / 5 = 100
    expect(out.days_needed.value).toBe(100);
    // frames_x stay untouched inputs on SALE lines
    expect(out.frames_a.value).toBe(2);
  });
});

// ─── Section 3: dept cascade ──────────────────────────────────────────────

describe("buildDeptCascade", () => {
  function cascadeFixture() {
    const looms = [
      recalcLoomLine(
        loomLine({ product_group: "SACKING", kg_per_loom_100: 10, eff_pct: 100, looms_a: 20, looms_b: 20, looms_c: 10 })
      ),
      recalcLoomLine(
        loomLine({ product_group: "HESSIAN", kg_per_loom_100: 20, eff_pct: 100, looms_a: 10, looms_b: 0, looms_c: 0 })
      ),
    ];
    // grand cloth: 500 + 200 = 700; looms a=30 b=20 c=10 (60 total)
    const totals = computeLoomTotals(looms);
    const yarns = [
      recalcYarnLine(
        yarnLine({
          line_kind: "CLOTH",
          section: "HESSIAN",
          yarn_item_id: 11,
          warp_weft: "WP",
          req_kg_a: autoField(120),
          req_kg_b: autoField(0),
          req_kg_c: autoField(0),
          kg_per_frame_100: 60,
          eff_pct: 100,
        }),
        totals
      ), // req_day 120, frames_required 2
      recalcYarnLine(
        yarnLine({
          line_kind: "CLOTH",
          section: "HESSIAN",
          yarn_item_id: 12,
          warp_weft: "WT",
          req_kg_a: autoField(80),
          req_kg_b: autoField(0),
          req_kg_c: autoField(0),
          kg_per_frame_100: 40,
          eff_pct: 100,
        }),
        totals
      ), // req_day 80, frames_required 2
      recalcYarnLine(
        yarnLine({
          line_kind: "SALE",
          section: "SALE",
          kg_per_frame_100: 50,
          eff_pct: 100,
          frames_a: autoField(1),
          frames_b: autoField(1),
          frames_c: autoField(0),
        }),
        totals
      ), // commitment 100
    ];
    const depts = deptLines().map((d) =>
      d.stage_code === "BATCHING"
        ? { ...d, waste_pct: 10, kg_per_machine: autoField(500) }
        : d.stage_code === "CARDING"
          ? { ...d, waste_pct: 5 }
          : d.stage_code === "DRAWING"
            ? { ...d, waste_pct: 2 }
            : d.stage_code === "SPINNING"
              ? { ...d, waste_pct: 4, machines_installed: 10, machines_maint: 2 }
              : d
    );
    return { looms, totals, yarns, depts };
  }

  it("WEAVING takes output/machines from Section 1 with weighted-avg kg_per_machine", () => {
    const { looms, totals, yarns, depts } = cascadeFixture();
    const out = buildDeptCascade(depts, looms, yarns, totals);
    const weaving = out.find((d) => d.stage_code === "WEAVING")!;
    expect(weaving.output_kg_day.value).toBe(700);
    expect(weaving.machines_a.value).toBe(30);
    expect(weaving.machines_b.value).toBe(20);
    expect(weaving.machines_c.value).toBe(10);
    expect(weaving.machines_required.value).toBe(60);
    expect(weaving.kg_per_machine.value).toBe(round3(700 / 60));
  });

  it("SPINNING sums yarn frames; BEAMING=WP req; WINDING=WT req + SALE commitment", () => {
    const { looms, totals, yarns, depts } = cascadeFixture();
    const out = buildDeptCascade(depts, looms, yarns, totals);
    const spinning = out.find((d) => d.stage_code === "SPINNING")!;
    expect(spinning.output_kg_day.value).toBe(300); // 120+80 cloth + 100 sale
    expect(spinning.machines_a.value).toBe(2.4); // 0.7+0.7 suggested cloth frames + 1 sale frame
    expect(spinning.machines_required.value).toBe(6); // 2+2+2
    expect(spinning.machines_ready).toBe(8); // 10 installed − 2 maint
    expect(out.find((d) => d.stage_code === "BEAMING")!.output_kg_day.value).toBe(120);
    expect(out.find((d) => d.stage_code === "WINDING")!.output_kg_day.value).toBe(180); // 80 + 100
  });

  it("cascades backward with waste: input = output × (1+waste/100), upstream output = downstream input", () => {
    const { looms, totals, yarns, depts } = cascadeFixture();
    const out = buildDeptCascade(depts, looms, yarns, totals);
    const spinning = out.find((d) => d.stage_code === "SPINNING")!;
    const drawing = out.find((d) => d.stage_code === "DRAWING")!;
    const carding = out.find((d) => d.stage_code === "CARDING")!;
    const batching = out.find((d) => d.stage_code === "BATCHING")!;
    expect(spinning.input_kg_day.value).toBe(312); // 300 × 1.04
    expect(drawing.output_kg_day.value).toBe(312);
    expect(drawing.input_kg_day.value).toBe(round3(312 * 1.02)); // 318.24
    expect(carding.output_kg_day.value).toBe(318.24);
    expect(carding.input_kg_day.value).toBe(round3(318.24 * 1.05)); // 334.152
    expect(batching.output_kg_day.value).toBe(334.152);
    expect(batching.input_kg_day.value).toBe(round3(334.152 * 1.1)); // raw jute/day
    // machines_required from output/kg_per_machine for non-section stages
    expect(batching.machines_required.value).toBe(0.67); // round2(334.152 / 500)
  });

  it("a manual output override on a mid-chain stage propagates upstream", () => {
    const { looms, totals, yarns, depts } = cascadeFixture();
    const overridden = depts.map((d) =>
      d.stage_code === "DRAWING" ? { ...d, output_kg_day: manualField(1000), waste_pct: 0 } : d
    );
    const out = buildDeptCascade(overridden, looms, yarns, totals);
    const drawing = out.find((d) => d.stage_code === "DRAWING")!;
    expect(drawing.output_kg_day).toEqual({ value: 1000, auto: false });
    expect(drawing.input_kg_day.value).toBe(1000);
    expect(out.find((d) => d.stage_code === "CARDING")!.output_kg_day.value).toBe(1000);
  });
});

// ─── Warnings + summary ───────────────────────────────────────────────────

describe("computeWarnings", () => {
  it("flags under-allocation, over-ready, pct sums and warp/weft sums", () => {
    const loom = recalcLoomLine(
      loomLine({
        product_group: "HESSIAN",
        quality_item_id: 1,
        quality_desc: "H1",
        kg_per_loom_100: 10,
        eff_pct: 100,
        looms_a: 10,
        warp_pct: 70,
        weft_pct: 40, // 110 ≠ 100
      })
    );
    const sackingLoom = recalcLoomLine(
      loomLine({ product_group: "SACKING", kg_per_loom_100: 10, eff_pct: 100, looms_a: 10 })
    );
    const yarn = yarnLine({
      section: "SACKING",
      yarn_desc: "Sack yarn",
      pct_of_prod: 60, // section pct sum 60 ≠ 100
      frames_required: manualField(5),
      frames_a: manualField(1), // 1 < 5 → under-alloc
    });
    const dept = deptLines().map((d) =>
      d.stage_code === "SPINNING"
        ? {
            ...d,
            machines_required: manualField(2),
            machines_a: manualField(9), // 9 > 4 ready × 1 shift
            machines_installed: 5,
            machines_maint: 1,
            machines_ready: 4,
          }
        : d
    );
    const doc = emptyDoc({ loom_lines: [loom, sackingLoom], yarn_lines: [yarn], dept_lines: dept });
    const warnings = computeWarnings(doc, computeLoomTotals(doc.loom_lines));
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("WARP_WEFT_SUM");
    expect(codes).toContain("PCT_SUM");
    expect(codes).toContain("UNDER_ALLOC");
    expect(codes).toContain("OVER_READY");
    expect(warnings.find((w) => w.code === "UNDER_ALLOC" && w.section === "yarn")?.uid).toBe(yarn.uid);
  });
});

describe("computeSummary", () => {
  it("reports cloth/yarn totals, frame coverage, ready frames and raw jute", () => {
    const doc = recalcDocument(
      emptyDoc({
        loom_lines: [
          loomLine({ product_group: "SACKING", kg_per_loom_100: 10, eff_pct: 100, looms_a: 10 }),
        ],
        yarn_lines: [
          yarnLine({ section: "SACKING", pct_of_prod: 100, kg_per_frame_100: 50, eff_pct: 100 }),
        ],
        dept_lines: deptLines().map((d) =>
          d.stage_code === "SPINNING" ? { ...d, machines_installed: 6, machines_maint: 1 } : d
        ),
      }),
      recalcOpts
    );
    const summary = computeSummary(doc, computeLoomTotals(doc.loom_lines));
    expect(summary.totalClothKgDay).toBe(100);
    expect(summary.totalYarnKgDay).toBe(100);
    expect(summary.framesRequired).toBe(2); // 100/50
    expect(summary.framesAllocated).toBeCloseTo(2.1, 5); // 3 × 0.7 suggestion
    expect(summary.framesReady).toBe(5);
    // BATCHING input = 100 through a zero-waste chain
    expect(summary.rawJuteKgDay).toBe(100);
  });
});

// ─── Auto/manual model + full pipeline ────────────────────────────────────

describe("recalcDocument + resetSectionAuto", () => {
  it("keeps manual overrides across recalcs, and Recalculate resets a section to auto", () => {
    let doc = recalcDocument(
      emptyDoc({
        loom_lines: [loomLine({ kg_per_loom_100: 10, eff_pct: 100, looms_a: 10 })],
      }),
      recalcOpts
    );
    expect(doc.loom_lines[0].prod_a.value).toBe(100);

    // Manual override sticks through subsequent recalcs.
    doc = {
      ...doc,
      loom_lines: [{ ...doc.loom_lines[0], prod_a: manualField(75) }],
    };
    doc = recalcDocument(doc, recalcOpts);
    expect(doc.loom_lines[0].prod_a).toEqual({ value: 75, auto: false });

    // Section Recalculate: back to auto, formula value restored.
    doc = recalcDocument(resetSectionAuto(doc, "loom"), recalcOpts);
    expect(doc.loom_lines[0].prod_a).toEqual({ value: 100, auto: true });
  });

  it("runs the full pipeline: loom → derived yarn → dept cascade", () => {
    const doc = recalcDocument(
      emptyDoc({
        loom_lines: [
          loomLine({
            product_group: "HESSIAN",
            quality_item_id: 7,
            kg_per_loom_100: 20,
            eff_pct: 50,
            looms_a: 10, // kg_per_loom 10 → prod_a 100
            warp_yarn_item_id: 21,
            weft_yarn_item_id: 22,
            warp_pct: 60,
            weft_pct: 40,
          }),
        ],
      }),
      recalcOpts
    );
    expect(doc.yarn_lines).toHaveLength(2);
    const wp = doc.yarn_lines.find((l) => l.warp_weft === "WP")!;
    expect(wp.req_kg_day.value).toBe(60);
    const weaving = doc.dept_lines.find((d) => d.stage_code === "WEAVING")!;
    expect(weaving.output_kg_day.value).toBe(100);
    const spinning = doc.dept_lines.find((d) => d.stage_code === "SPINNING")!;
    expect(spinning.output_kg_day.value).toBe(100); // 60 + 40
    const batching = doc.dept_lines.find((d) => d.stage_code === "BATCHING")!;
    expect(batching.input_kg_day.value).toBe(100); // zero-waste defaults
  });
});
