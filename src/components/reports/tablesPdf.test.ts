import { describe, expect, it } from "vitest";
import { buildTablesPdf, pdfFileSlug, pdfSafeText } from "./tablesPdf";

describe("pdfSafeText", () => {
  it("maps the screen's typographic characters to what Helvetica can print", () => {
    expect(pdfSafeText("— not comparable")).toBe("- not comparable");
    expect(pdfSafeText("opening + winding − weaving")).toBe("opening + winding - weaving");
    expect(pdfSafeText("₹1,200.00")).toBe("Rs. 1,200.00");
    expect(pdfSafeText("it’s “ok”…")).toBe("it's \"ok\"...");
    expect(pdfSafeText("Weight × Rate · 12")).toBe("Weight × Rate · 12");
    expect(pdfSafeText("日本")).toBe("??");
  });

  it("prints non-string API values instead of throwing", () => {
    expect(pdfSafeText(7)).toBe("7");
    expect(pdfSafeText(null)).toBe("");
    expect(pdfSafeText(undefined)).toBe("");
  });
});

describe("pdfFileSlug", () => {
  it("turns document numbers with slashes into a safe file name", () => {
    expect(pdfFileSlug("Jute-Bill-Pass-BP/26-27/0012")).toBe("Jute-Bill-Pass-BP-26-27-0012");
  });
});

describe("buildTablesPdf", () => {
  it("lays out a multi-section spec with struck, muted and total cells", async () => {
    const doc = await buildTablesPdf({
      fileName: "t",
      companyName: "SLS",
      title: "Test",
      subtitleLines: ["Branch: FACTORY"],
      preface: [{ text: "warn — here", tone: "warning" }],
      sections: [
        {
          title: "A",
          head: ["Metric", "Today"],
          body: [["x", "1.000"], ["Difference", "— not comparable"]],
          aligns: ["left", "right"],
          totalRows: [1],
          struckCells: [[0, 1]],
          mutedCells: [[1, 1]],
          notes: ["caption"],
        },
        { title: "B", body: [["Label", "Value", "L2", "V2"]], boldCols: [0, 2] },
      ],
      closingLines: ["Grand Total: 1"],
      footNote: "note",
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
