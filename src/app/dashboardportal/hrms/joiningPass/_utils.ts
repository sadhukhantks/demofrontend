/**
 * Pure helpers of the Joining Pass page (no DOM, no React): tab parsing, the
 * criterion text and the print HTML of the pass letter (sample: EJM "JOINING
 * PASS FOR DEPARTMENT"). The letter text comes from the server (`letter`); this
 * only lays it out.
 */

import { escapeHtml } from "@/components/reports/printReport";
import type { JpCheck, JpLetter } from "@/utils/joiningPassService";

export type JpTab = "issue" | "absentees" | "register";

export const JP_TABS: ReadonlyArray<{ value: JpTab; label: string }> = Object.freeze([
  { value: "issue", label: "Check & issue" },
  { value: "absentees", label: "Absent > N days" },
  { value: "register", label: "Passes issued" },
]);

export function parseTab(v: string | null): JpTab {
  return v === "absentees" || v === "register" ? v : "issue";
}

/** Tab label with the company threshold ("Absent > 3 days"). */
export function tabLabel(tab: JpTab, minAbsentDays: number | null): string {
  if (tab === "absentees") return `Absent > ${minAbsentDays ?? 3} days`;
  return JP_TABS.find((t) => t.value === tab)?.label ?? tab;
}

/** DD-MM-YYYY for display; blank for null, the raw value if not a date. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const iso = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return value;
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export type JpVerdict = "PASS_REQUIRED" | "PASS_ISSUED" | "NOT_REQUIRED" | "NO_HISTORY" | "SEPARATED";

/** What the check means for the gate. */
export function verdictOf(c: Pick<JpCheck, "separated" | "last_seen_date" | "pass_required" | "existing_pass">): JpVerdict {
  if (c.separated) return "SEPARATED";
  if (c.last_seen_date == null) return "NO_HISTORY";
  if (c.existing_pass) return "PASS_ISSUED";
  return c.pass_required ? "PASS_REQUIRED" : "NOT_REQUIRED";
}

export function verdictText(c: JpCheck): string {
  const n = c.min_absent_days;
  switch (verdictOf(c)) {
    case "SEPARATED":
      return "This worker has left the roll (separated in HRMS) — no pass can be issued.";
    case "NO_HISTORY":
      return "No attendance or approved leave found before this date — no absence to cover.";
    case "PASS_ISSUED":
      return `Pass ${c.existing_pass?.pass_no ?? ""} already issued for this absence — reprint it from "Passes issued".`;
    case "PASS_REQUIRED":
      return `Absent ${c.absent_working_days} working days (more than ${n}) — a joining pass is required.`;
    default:
      return c.absent_working_days === 0
        ? "Not absent on any working day before this date — no pass needed."
        : `Absent ${c.absent_working_days} working day(s), not more than ${n} — no pass needed.`;
  }
}

/** Print CSS of the pass (black on white, Times like the sample). */
export const PASS_PRINT_CSS = `
  .jp-letter { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.5; max-width: 180mm; margin: 0 auto; }
  .jp-page-break { display: block; page-break-after: always; break-after: page; }
  .jp-co { text-align: center; font-size: 15pt; font-weight: 700; }
  .jp-addr { text-align: center; font-size: 10pt; }
  .jp-date { text-align: right; margin-top: 6px; }
  .jp-fields { margin: 18px 0 10px; border-collapse: collapse; width: auto !important; }
  .jp-fields td { padding: 1px 8px 1px 0; border: 0; }
  .jp-title { text-align: center; font-weight: 700; text-decoration: underline; margin: 22px 0 16px; }
  .jp-para { text-align: justify; margin: 0 0 14px; }
  .jp-sign { margin: 48px 0 0 50%; text-align: center; }
  .jp-sign-name { font-weight: 700; }
  .jp-auth { margin-top: 48px; }
  .jp-mgr { margin-top: 40px; }
  .jp-foot { margin-top: 4px; font-size: 10.5pt; }
`;

/** One pass letter, laid out like the sample. */
export function buildPassHtml(l: JpLetter): string {
  const e = (v: string | null | undefined) => escapeHtml(v ?? "");
  const field = (label: string, value: string | null) =>
    `<tr><td>${e(label)}</td><td>:</td><td>${e(value)}</td></tr>`;
  return (
    `<div class="jp-letter">` +
    `<div class="jp-co">${e(l.company_name)}</div>` +
    `<div class="jp-addr">${e(l.company_address)}</div>` +
    `<div class="jp-date">Date : ${e(l.date)}</div>` +
    `<table class="jp-fields">${field("EB No", l.eb_no)}${field("Name", l.name)}${field("Department", l.department)}</table>` +
    `<div class="jp-title">${e(l.title)}</div>` +
    l.paragraphs.map((p) => `<p class="jp-para">${e(p)}</p>`).join("") +
    `<div class="jp-sign"><div class="jp-sign-name">${e(l.name)}</div><div>${e(l.signature_label)}</div></div>` +
    `<div class="jp-auth">${e(l.authorised_label)}</div>` +
    `<div class="jp-mgr">${e(l.manager_label)}</div>` +
    `<div class="jp-foot">Pass Issued on ${e(l.issued_on)}${l.pass_no ? ` &nbsp;·&nbsp; Pass No ${e(l.pass_no)}` : ""}</div>` +
    `</div>`
  );
}

/** Several passes, each on its own page. */
export function buildPassesHtml(letters: ReadonlyArray<JpLetter>): string {
  return letters
    .map((l, i) =>
      i < letters.length - 1
        ? `<div class="jp-page-break" style="display:block;page-break-after:always;break-after:page">${buildPassHtml(l)}</div>`
        : buildPassHtml(l),
    )
    .join("");
}

/** The branch in use: the user's pick, else the initial one, else the only one in scope. */
export function resolveBranchId(
  choice: number | null,
  initial: number | null,
  branches: ReadonlyArray<{ branch_id: number }>,
): number | null {
  const inScope = (id: number | null) => id != null && branches.some((b) => b.branch_id === id);
  if (branches.length === 0) return choice ?? initial;
  if (inScope(choice)) return choice;
  if (inScope(initial)) return initial;
  return branches.length === 1 ? branches[0].branch_id : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 16-Jan-2026 — the letter's date style (the server's fmt_letter_date). */
export function fmtLetterDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value ?? "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** The day before an ISO date (Absent To = the day before joining). */
export function prevDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}
