"use client";
import React, { Suspense } from "react";
import { Box, CircularProgress } from "@mui/material";
import {
  usePayrollPrint,
  groupByDept,
  printStyles,
  fmtDate,
  fmtMonth,
  f2,
  f0,
  type DeptGroup,
} from "../_components/payrollPrint";
import type { PayRegisterPrintRow } from "@/utils/hrmsReportService";
import PrintFrame from "@/components/reports/PrintFrame";

/**
 * Payslip print (legacy Data_entry payslipprint, "Main Pay Roll"): one slip
 * per employee — earnings left, deductions right, hours strip, net pay —
 * grouped by department, three slips per A4 page.
 *
 * The slip line-set is HARDCODED by decision (2026-08-21) — do not wire it to
 * tbl_payslip_print_component (that config only covers schemes 4 and 15).
 */

type Amount = [string, (r: PayRegisterPrintRow) => number];

const EARNINGS: Amount[] = [
  ["Basic (Prod)", (r) => r.prod_basic],
  ["Fix Basic", (r) => r.fix_basic + r.time_rated_basic],
  ["DA", (r) => r.da],
  ["Night Allowance", (r) => r.ns_amount],
  ["Festival / Holiday", (r) => r.hol_amt],
  ["Increment", (r) => r.increment_amt],
  ["Layoff Wages", (r) => r.layoff_wgs],
  ["Incentive", (r) => r.incentive_amount],
  ["Misc Earning", (r) => r.misc_earn],
  ["STL Wages", (r) => r.stl_wgs],
  ["HRA", (r) => r.hra],
  ["Arrear (+)", (r) => r.arrear_plus],
  ["B/F", (r) => r.b_f],
];

const DEDUCTIONS: Amount[] = [
  ["EPF", (r) => r.epf],
  ["ESI", (r) => r.esic],
  ["P.Tax", (r) => r.p_tax],
  ["LWF", (r) => r.lwf],
  ["Co. Loan", (r) => r.co_loan],
  ["Puja Advance", (r) => r.puja_advance],
  ["STL Advance", (r) => r.stl_advance],
  ["Advance", (r) => r.exadvance],
  ["Arrear (-)", (r) => r.arrear_minus],
];

function AmountRows({ items, row }: { items: Amount[]; row: PayRegisterPrintRow }) {
  // Zero lines are skipped so each slip only shows what applies (the legacy
  // slip relied on pre-printed stationery instead).
  return (
    <>
      {items
        .filter(([, get]) => get(row) !== 0)
        .map(([label, get]) => (
          <div key={label} className="slip-amt">
            <span>{label}</span>
            <span>{f2(get(row))}</span>
          </div>
        ))}
    </>
  );
}

function Slip({
  row,
  companyName,
  toDate,
  deptLabel,
}: {
  row: PayRegisterPrintRow;
  companyName: string;
  toDate: string | null;
  deptLabel: string;
}) {
  return (
    <div className="slip">
      <div className="slip-head">
        <span>{companyName}</span>
        <span>PAY SLIP FOR: {fmtMonth(toDate)} (F/E {fmtDate(toDate)})</span>
        <span>DEPT: {deptLabel}</span>
      </div>
      <div className="slip-id">
        <span><b>EB No:</b> {row.eb_no}</span>
        <span><b>Name:</b> {row.wname}</span>
        <span><b>Desig:</b> {row.desig}</span>
        <span><b>Shift:</b> {row.shift}</span>
        <span><b>T/P:</b> {row.time_piece}</span>
        <span><b>ESI No:</b> {row.esi_no}</span>
        <span><b>PF No:</b> {row.pf_no}</span>
        <span><b>UAN:</b> {row.pf_uan_no}</span>
      </div>
      <div className="slip-hours">
        <span>Wrk Hrs: {f2(row.working_hours)}</span>
        <span>NS Hrs: {f2(row.ns_hrs)}</span>
        <span>Hol Hrs: {f2(row.hl_hrs)}</span>
        <span>STL Days: {f0(row.stl_d)}</span>
        <span>Wrk Days: {f0(row.wrk_days)}</span>
        <span>Basic Rate: {f2(row.basic_rate)}</span>
      </div>
      <div className="slip-body">
        <div className="slip-col">
          <div className="slip-col-head">EARNINGS</div>
          <AmountRows items={EARNINGS} row={row} />
          <div className="slip-amt slip-sum">
            <span>Gross Pay</span>
            <span>{f2(row.gross_pay)}</span>
          </div>
          <div className="slip-amt slip-sum">
            <span>Total Earnings</span>
            <span>{f2(row.total_earn)}</span>
          </div>
        </div>
        <div className="slip-col">
          <div className="slip-col-head">DEDUCTIONS</div>
          <AmountRows items={DEDUCTIONS} row={row} />
          <div className="slip-amt slip-sum">
            <span>Total Deductions</span>
            <span>{f2(row.total_deduction)}</span>
          </div>
          {row.co_loan_bal !== 0 && (
            <div className="slip-amt">
              <span>Co. Loan Balance</span>
              <span>{f2(row.co_loan_bal)}</span>
            </div>
          )}
          {row.c_f !== 0 && (
            <div className="slip-amt">
              <span>C/F</span>
              <span>{f2(row.c_f)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="slip-foot">
        <span>Signature: ____________________</span>
        <span className="slip-net">NET PAY: {f0(row.net_pay)}</span>
      </div>
    </div>
  );
}

function Content() {
  const { companyName, period, rows, controls } = usePayrollPrint("Payslip Print");
  const groups: DeptGroup[] = groupByDept(rows);

  return (
    <>
      <style>{printStyles("portrait")}</style>
      <style>{`
.pay-print-area { font-family: "Courier New", monospace; font-size: 10px; color: #000; background: #fff; padding: 8px 16px; }
.slip { border: 1px solid #000; margin-bottom: 6mm; break-inside: avoid; }
.slip-head { display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #000; padding: 2px 6px; }
.slip-id { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 2px 6px; border-bottom: 1px dashed #888; }
.slip-hours { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 2px 6px; border-bottom: 1px dashed #888; }
.slip-body { display: flex; }
.slip-col { flex: 1; padding: 2px 6px; }
.slip-col + .slip-col { border-left: 1px solid #000; }
.slip-col-head { font-weight: bold; text-align: center; border-bottom: 1px solid #888; margin-bottom: 2px; }
.slip-amt { display: flex; justify-content: space-between; }
.slip-sum { font-weight: bold; border-top: 1px solid #888; margin-top: 2px; }
.slip-foot { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #000; padding: 3px 6px; }
.slip-net { font-weight: bold; font-size: 12px; }
`}</style>
      {controls}
      <Box className="pay-print-area">
        <PrintFrame marginMm={8}>
          {groups.map((g) => (
            <section key={g.deptCode} className="pay-dept-section">
              {g.rows.map((r) => (
                <Slip
                  key={r.id}
                  row={r}
                  companyName={companyName ?? ""}
                  toDate={period?.to_date ?? null}
                  deptLabel={`${g.deptCode} ${g.deptDesc}`}
                />
              ))}
            </section>
          ))}
        </PrintFrame>
      </Box>
    </>
  );
}

export default function PayslipPrintPage() {
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
