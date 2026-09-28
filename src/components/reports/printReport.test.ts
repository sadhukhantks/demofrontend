import { describe, expect, it } from "vitest";
import type { GridColDef } from "@mui/x-data-grid";
import { buildPrintHtml, escapeHtml, gridPrintSection } from "./printReport";

describe("escapeHtml", () => {
  it("escapes markup and blanks null", () => {
    expect(escapeHtml(`<b a="1">&'`)).toBe("&lt;b a=&quot;1&quot;&gt;&amp;&#39;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(12.5)).toBe("12.5");
  });
});

describe("buildPrintHtml", () => {
  it("writes the letterhead, one table per section and the page orientation", () => {
    const html = buildPrintHtml(
      { title: "Doff Analysis", headerLines: ["ACME Jute", "Mill (Branch)", ""], landscape: true },
      [
        {
          title: "Spell Totals",
          subtitle: "per spell",
          columns: [{ header: "Spell" }, { header: "Net Wt (kg)", align: "right" }],
          rows: [
            ["A", "12.50"],
            ["B", null],
          ],
        },
        { title: "Empty", columns: [{ header: "x" }], rows: [] },
      ],
    );
    expect(html).toContain("<title>Doff Analysis</title>");
    expect(html).toContain("<h1>Doff Analysis</h1>");
    expect(html).toContain('<p class="hl">ACME Jute</p>');
    expect(html).toContain('<p class="hl">Mill (Branch)</p>');
    expect(html).not.toContain('<p class="hl"></p>'); // blank lines dropped
    expect(html).toContain("@page { size: landscape;");
    expect(html).toContain("<h2>Spell Totals</h2>");
    expect(html).toContain('<p class="sub">per spell</p>');
    expect(html).toContain('<th class="r">Net Wt (kg)</th>');
    expect(html).toContain('<td class="">A</td><td class="r">12.50</td>');
    expect(html).toContain('<td class="">B</td><td class="r"></td>');
    expect(html).toContain('<p class="empty">No rows.</p>');
    expect(html.match(/<table>/g)).toHaveLength(1);
  });

  it("escapes cell content", () => {
    const html = buildPrintHtml({ title: "t" }, [
      { title: "s", columns: [{ header: "<h>" }], rows: [["<script>"]] },
    ]);
    expect(html).toContain("&lt;h&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("@page { size: portrait;");
  });
});

describe("gridPrintSection", () => {
  type Row = { id: number; frame: string; net_wt: number | null; bands: Record<string, number> };
  const cols: GridColDef<Row>[] = [
    { field: "actions", headerName: "" },
    { field: "frame", headerName: "Frame" },
    {
      field: "net_wt",
      headerName: "Net Wt",
      type: "number",
      valueFormatter: (v: unknown) => (v == null ? "" : Number(v).toFixed(2)),
    },
    {
      field: "spell_A",
      headerName: "A",
      type: "number",
      valueGetter: (_, row) => row.bands?.A ?? 0,
    },
  ];
  it("resolves getters/formatters, right-aligns numbers and drops widget columns", () => {
    const s = gridPrintSection("Doffs", cols, [
      { id: 1, frame: "F1", net_wt: 3.14159, bands: { A: 2 } },
      { id: 2, frame: "F2", net_wt: null, bands: {} },
    ]);
    expect(s.columns).toEqual([
      { header: "Frame", align: "left" },
      { header: "Net Wt", align: "right" },
      { header: "A", align: "right" },
    ]);
    expect(s.rows).toEqual([
      ["F1", "3.14", "2"],
      ["F2", "", "0"],
    ]);
  });
});
