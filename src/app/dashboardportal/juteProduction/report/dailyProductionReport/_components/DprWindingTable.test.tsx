/**
 * @vitest-environment jsdom
 *
 * TKT-000174 — twisting production sits in its own block AFTER the winding
 * Total, and is never part of that Total.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import type {
  DprWindingQualityRow,
  DprWindingSection,
} from "@/utils/juteProductionReportService";
import { DprWindingTable, splitWindingRows } from "./DprWindingTable";

function q(over: Partial<DprWindingQualityRow>): DprWindingQualityRow {
  return {
    item_id: 1,
    item_code: "X",
    item_name: "X",
    production_kg: 0,
    winders: 0,
    kg_per_winder: 0,
    mtd_production_kg: 0,
    mtd_kg_per_winder_shift: 0,
    is_twisted: 0,
    ...over,
  };
}

/** sls co 2 br 29, 18-09-2026 (two of the winding qualities + the ply yarn). */
const SLS: DprWindingSection = {
  qualities: [
    q({ item_id: 335563, item_name: "13-SKWP", production_kg: 8182, winders: 25, kg_per_winder: 327.3, mtd_production_kg: 137116 }),
    q({ item_id: 335869, item_name: "3PLY-YARN", production_kg: 642, winders: 1, kg_per_winder: 642, mtd_production_kg: 10809, mtd_kg_per_winder_shift: 635.8, is_twisted: 1 }),
    q({ item_id: 335564, item_name: "16-SKWP", production_kg: 12336, winders: 36, kg_per_winder: 342.7, mtd_production_kg: 205258.8 }),
  ],
  total: {
    production_kg: 20518,
    winders: 61,
    kg_per_winder: 336.4,
    mtd_production_kg: 342374.8,
    twisting_kg: 642,
    mtd_twisting_kg: 10809,
    gross_production_kg: 21160,
    mtd_gross_production_kg: 353183.8,
    twisting: { production_kg: 642, winders: 1, kg_per_winder: 642, mtd_production_kg: 10809 },
    gross: { production_kg: 21160, winders: 62, kg_per_winder: 341.3, mtd_production_kg: 353183.8 },
  },
  twisting_available: true,
};

const NO_TWIST: DprWindingSection = {
  ...SLS,
  qualities: SLS.qualities.filter((r) => r.is_twisted !== 1),
  total: {
    ...SLS.total,
    twisting_kg: 0,
    mtd_twisting_kg: 0,
    twisting: { production_kg: 0, winders: 0, kg_per_winder: 0, mtd_production_kg: 0 },
    gross: { production_kg: 20518, winders: 61, kg_per_winder: 336.4, mtd_production_kg: 342374.8 },
  },
};

function bodyRowLabels(): string[] {
  const rows = screen.getAllByRole("row").slice(1); // drop the header row
  return rows.map((r) => within(r).getAllByRole("cell")[0].textContent ?? "");
}

describe("splitWindingRows", () => {
  it("separates twisted qualities and keeps the order inside each block", () => {
    const out = splitWindingRows(SLS.qualities);
    expect(out.winding.map((r) => r.item_name)).toEqual(["13-SKWP", "16-SKWP"]);
    expect(out.twisting.map((r) => r.item_name)).toEqual(["3PLY-YARN"]);
  });
});

describe("DprWindingTable", () => {
  it("lists twisting in its own block after the winding Total", () => {
    render(<DprWindingTable winding={SLS} />);
    expect(bodyRowLabels()).toEqual([
      "13-SKWP",
      "16-SKWP",
      "Total Winding (excl. twisting)",
      "Twisting Production — ply yarn, not part of the winding total",
      "3PLY-YARN",
      "Total Twisting",
      "Gross winder output (winding + twisting)",
    ]);
  });

  it("keeps twisting OUT of the winding Total and adds it only on the gross line", () => {
    render(<DprWindingTable winding={SLS} />);
    const total = within(screen.getByTestId("dpr-winding-total"));
    expect(total.getByText("20,518")).toBeInTheDocument();
    expect(total.getByText("61")).toBeInTheDocument();
    expect(total.getByText("336.4")).toBeInTheDocument();
    expect(total.queryByText("21,160")).not.toBeInTheDocument();

    const twisting = within(screen.getByTestId("dpr-twisting-total"));
    expect(twisting.getByText("642")).toBeInTheDocument();
    expect(twisting.getByText("10,809")).toBeInTheDocument();

    const gross = within(screen.getByTestId("dpr-winding-gross"));
    expect(gross.getByText("21,160")).toBeInTheDocument();
    expect(gross.getByText("62")).toBeInTheDocument();
  });

  it("shows a plain Total and no twisting block when nothing was twisted", () => {
    render(<DprWindingTable winding={NO_TWIST} />);
    expect(bodyRowLabels()).toEqual(["13-SKWP", "16-SKWP", "Total"]);
    expect(screen.queryByTestId("dpr-twisting-band")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dpr-winding-gross")).not.toBeInTheDocument();
  });

  it("warns when the tenant cannot split twisting at all", () => {
    render(<DprWindingTable winding={{ ...NO_TWIST, twisting_available: false }} />);
    expect(screen.getByText(/Twisting is not split out on this tenant yet/)).toBeInTheDocument();
  });
});
