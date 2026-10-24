import { describe, expect, it } from "vitest";
import { jpIssueFormSchema, type JpCheck, type JpLetter } from "@/utils/joiningPassService";
import { buildPassHtml, buildPassesHtml, fmtLetterDate, parseTab, prevDay, resolveBranchId, tabLabel, verdictOf, verdictText } from "./_utils";

const LETTER: JpLetter = {
  company_name: "THE EMPIRE JUTE CO LTD.",
  company_address: "15, B.T. Road, Talpukur, Kolkata-700123",
  date: "16-Jan-2026",
  eb_no: "18084",
  name: "BISWAJIT <BERA>",
  department: "BEAMING",
  title: "JOINING PASS FOR DEPARTMENT",
  paragraphs: ["You have been absenting from your duty from 04-Jan-2026.", "Final chance."],
  signature_label: "Signature / L. thumb Impression",
  authorised_label: "Authorised by Welfare Officer",
  manager_label: "Personnel Manager",
  issued_on: "15-Jan-2026",
  pass_no: "JP/29/26/0001",
};

const base = {
  separated: false,
  last_seen_date: "2026-01-03",
  pass_required: true,
  existing_pass: null,
  absent_working_days: 10,
  min_absent_days: 3,
};

describe("joining pass utils", () => {
  it("parses tabs with issue as default", () => {
    expect(parseTab(null)).toBe("issue");
    expect(parseTab("register")).toBe("register");
    expect(parseTab("bogus")).toBe("issue");
    expect(tabLabel("absentees", 3)).toBe("Absent > 3 days");
  });

  it("formats letter dates and the day before joining", () => {
    expect(fmtLetterDate("2026-01-16")).toBe("16-Jan-2026");
    expect(prevDay("2026-01-16")).toBe("2026-01-15");
    expect(prevDay("2026-03-01")).toBe("2026-02-28");
  });

  it("derives the verdict", () => {
    expect(verdictOf(base)).toBe("PASS_REQUIRED");
    expect(verdictOf({ ...base, pass_required: false })).toBe("NOT_REQUIRED");
    expect(verdictOf({ ...base, last_seen_date: null })).toBe("NO_HISTORY");
    expect(verdictOf({ ...base, separated: true })).toBe("SEPARATED");
    expect(
      verdictOf({ ...base, existing_pass: { joining_pass_id: 1, pass_no: "JP/1", join_date: null, issue_date: null } }),
    ).toBe("PASS_ISSUED");
    expect(verdictText({ ...base, absent_calendar_days: 12 } as unknown as JpCheck)).toContain("more than 3");
  });

  it("builds the pass HTML with every value escaped", () => {
    const html = buildPassHtml(LETTER);
    expect(html).toContain("JOINING PASS FOR DEPARTMENT");
    expect(html).toContain("BISWAJIT &lt;BERA&gt;");
    expect(html).not.toContain("<BERA>");
    expect(html).toContain("Pass Issued on 15-Jan-2026");
    expect(html).toContain("Authorised by Welfare Officer");
  });

  it("puts each pass but the last on its own page", () => {
    const html = buildPassesHtml([LETTER, LETTER]);
    expect(html.match(/jp-page-break/g)?.length).toBe(1);
  });

  it("resolves the branch in scope", () => {
    expect(resolveBranchId(null, null, [{ branch_id: 29 }])).toBe(29);
    expect(resolveBranchId(5, 29, [{ branch_id: 29 }, { branch_id: 4 }])).toBe(29);
  });

  it("validates the issue form", () => {
    const ok = jpIssueFormSchema.safeParse({
      joinDate: "2026-01-16",
      issueDate: "2026-01-15",
      spellId: 110,
      authority: "Welfare Officer",
      remarks: "APPROVED BY PM",
    });
    expect(ok.success).toBe(true);
    const late = jpIssueFormSchema.safeParse({
      joinDate: "2026-01-16",
      issueDate: "2026-01-17",
      spellId: "",
      authority: "Welfare Officer",
      remarks: "",
    });
    expect(late.success).toBe(false);
    const noAuth = jpIssueFormSchema.safeParse({ joinDate: "2026-01-16", issueDate: "2026-01-16", spellId: "", authority: "", remarks: "" });
    expect(noAuth.success).toBe(false);
  });
});
