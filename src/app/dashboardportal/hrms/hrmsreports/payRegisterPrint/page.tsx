"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import {
  usePayrollPrint,
  groupByDept,
  printStyles,
  fmtDate,
  f2,
  f0,
  type DeptGroup,
} from "../_components/payrollPrint";
import type { PayRegisterPrintRow } from "@/utils/hrmsReportService";

/**
 * Pay Register print (legacy Data_entry payregisterprint, "Main Pay Roll"):
 * per department, three stacked lines per employee — identity + hours,
 * earnings, statutory + deductions — with department and grand totals.
 */

// One line's cells: [label, value-extractor] pairs. The three lines each keep
// their own column grid so values align down the page like the legacy register.
type Cell = [string, (r: PayRegisterPrintRow) => string];

const LINE1: Cell[] = [
  ["EB-NO", (r) => r.eb_no],
  ["T/P", (r) => r.time_piece],
  ["NAME", (r) => r.wname],
  ["OCC", (r) => r.desig],
  ["BAS-RATE", (r) => f2(r.basic_rate)],
  ["WRK-HRS", (r) => f2(r.working_hours)],
  ["NS-HRS", (r) => f2(r.ns_hrs)],
  ["HL-HRS", (r) => f2(r.hl_hrs)],
  ["LOF-HR", (r) => f2(r.ls_hrs)],
  ["STLD", (r) => f0(r.stl_d)],
  ["WRK-DAY", (r) => f0(r.wrk_days)],
  ["C-WRKDAY", (r) => f0(r.c_work_day)],
  ["C-BON-ERN", (r) => f2(r.c_bon_ern)],
  ["PF-GROSS", (r) => f2(r.pf_gross)],
];

const LINE2: Cell[] = [
  ["BASIC", (r) => f2(r.prod_basic)],
  ["FIX-BASIC", (r) => f2(r.fix_basic + r.time_rated_basic)],
  ["DA", (r) => f2(r.da)],
  ["NS-AMT", (r) => f2(r.ns_amount)],
  ["HOL-AMT", (r) => f2(r.hol_amt)],
  ["INCREMENT", (r) => f2(r.increment_amt)],
  ["LOFF-WG", (r) => f2(r.layoff_wgs)],
  ["INCENTIVE", (r) => f2(r.incentive_amount)],
  ["MISC-ERN", (r) => f2(r.misc_earn)],
  ["STL-WG", (r) => f2(r.stl_wgs)],
  ["GROSS-PAY", (r) => f2(r.gross_pay)],
  ["HRA", (r) => f2(r.hra)],
  ["B/F", (r) => f2(r.b_f)],
  ["TOT-EARN", (r) => f2(r.total_earn)],
];

const LINE3: Cell[] = [
  ["ESI-NO", (r) => r.esi_no],
  ["PF-NO", (r) => r.pf_no],
  ["C-PF-CONT", (r) => f2(r.c_pf_cont)],
  ["C-FPF-CONT", (r) => f2(r.c_fpf_cont)],
  ["ESI-GROSS", (r) => f2(r.esi_gross)],
  ["EPF", (r) => f0(r.epf)],
  ["PF-8.33", (r) => f0(r.epf_833)],
  ["PF-1.67", (r) => f0(r.epf_167)],
  ["ESI", (r) => f0(r.esic)],
  ["PTAX", (r) => f0(r.p_tax)],
  ["LWF", (r) => f0(r.lwf)],
  ["CO-LN", (r) => f0(r.co_loan)],
  ["PUJA-ADV", (r) => f0(r.puja_advance)],
  ["STL-ADV", (r) => f0(r.stl_advance)],
  ["TOT-DEDN", (r) => f2(r.total_deduction)],
  ["C/F", (r) => f2(r.c_f)],
  ["NET-PAY", (r) => f0(r.net_pay)],
];

// Name and occupation get wider tracks; everything else shares evenly.
const G1 = "7fr 3fr 16fr 9fr 6fr 6fr 5fr 5fr 5fr 4fr 5fr 6fr 7fr 7fr";
const G2 = "7fr 7fr 6fr 6fr 7fr 7fr 6fr 7fr 7fr 6fr 8fr 6fr 5fr 8fr";
const G3 = "9fr 7fr 6fr 6fr 7fr 4fr 5fr 5fr 4fr 4fr 4fr 4fr 5fr 5fr 7fr 5fr 6fr";

function Line({
  cells,
  grid,
  leftCount = 0,
  row,
  header,
}: {
  cells: Cell[];
  grid: string;
  /** How many leading cells are text (left-aligned); the rest are numeric. */
  leftCount?: number;
  row?: PayRegisterPrintRow;
  header?: boolean;
}) {
  return (
    <div className={`reg-line${header ? " reg-head" : ""}`} style={{ gridTemplateColumns: grid }}>
      {cells.map(([label, get], i) => (
        <span key={label} className={i < leftCount ? "lt" : "rt"}>
          {header ? label : get(row as PayRegisterPrintRow)}
        </span>
      ))}
    </div>
  );
}

function totals(rows: PayRegisterPrintRow[]) {
  return rows.reduce(
    (t, r) => ({
      earn: t.earn + r.total_earn,
      ded: t.ded + r.total_deduction,
      net: t.net + r.net_pay,
    }),
    { earn: 0, ded: 0, net: 0 },
  );
}

function TotalsLine({ label, rows }: { label: string; rows: PayRegisterPrintRow[] }) {
  const t = totals(rows);
  return (
    <div className="reg-total">
      <span>{label} — Hands: {rows.length}</span>
      <span>TOT-EARN: {f2(t.earn)}</span>
      <span>TOT-DEDN: {f2(t.ded)}</span>
      <span>NET-PAY: {f2(t.net)}</span>
    </div>
  );
}

function Content() {
  const { companyName, scheme, period, rows, controls } = usePayrollPrint(
    "Pay Register Print",
  );
  const groups: DeptGroup[] = groupByDept(rows);

  return (
    <>
      <style>{printStyles("landscape")}</style>
      <style>{`
.pay-print-area { font-family: "Courier New", monospace; font-size: 10px; color: #000; background: #fff; padding: 8px 16px; }
.reg-line { display: grid; column-gap: 4px; padding: 0 2px; }
.reg-line .rt { text-align: right; white-space: nowrap; overflow: hidden; }
.reg-line .lt { text-align: left; white-space: nowrap; overflow: hidden; }
.reg-head { font-weight: bold; border-top: 1px solid #000; }
.reg-head:first-of-type { border-top: none; }
.reg-emp { border-bottom: 1px dashed #888; padding: 1px 0; break-inside: avoid; }
.reg-caption { display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; padding: 2px; border-bottom: 1px solid #000; }
.reg-headblock { border-bottom: 1px solid #000; margin-bottom: 2px; }
.reg-total { display: flex; gap: 24px; justify-content: flex-end; font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px; margin: 2px 0 8px; }
`}</style>
      {controls}
      <Box className="pay-print-area">
        {groups.map((g) => (
          <section key={g.deptCode} className="pay-dept-section">
            <div className="reg-caption">
              <span>{companyName ?? ""}</span>
              <span>{scheme?.payscheme_name ?? ""} — PAY REGISTER</span>
              <span>
                F/E: {fmtDate(period?.to_date ?? null)} DEPT: {g.deptCode} {g.deptDesc}
              </span>
            </div>
            <div className="reg-headblock">
              <Line cells={LINE1} grid={G1} leftCount={4} header />
              <Line cells={LINE2} grid={G2} header />
              <Line cells={LINE3} grid={G3} leftCount={2} header />
            </div>
            {g.rows.map((r) => (
              <div key={r.id} className="reg-emp">
                <Line cells={LINE1} grid={G1} leftCount={4} row={r} />
                <Line cells={LINE2} grid={G2} row={r} />
                <Line cells={LINE3} grid={G3} leftCount={2} row={r} />
              </div>
            ))}
            <TotalsLine label={`DEPT TOTAL ${g.deptCode}`} rows={g.rows} />
          </section>
        ))}
        {rows.length > 0 && <TotalsLine label="GRAND TOTAL" rows={rows} />}
      </Box>
    </>
  );
}

export default function PayRegisterPrintPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
