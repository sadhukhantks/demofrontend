"use client";

/**
 * Wastage Report — the mill's "NEW WASTAGE FORMAT" sheet: one wide table with
 * a row per day of the selected month. The left band carries the production
 * context (looms, frames, weaving/spinning/breaker-feed kg, jute selection);
 * then one band per waste group from the tenant's jute_waste_report_map —
 * component columns, the group TOTAL and its % of the group's denominator.
 *
 * The column/group layout is DATA (WastageGroupColumn[]), not constants: the
 * bands are rendered entirely from `columns`, so a re-mapped tenant re-shapes
 * the sheet with no code change. Waste with no mapping row arrives in the
 * OTHER group, which is rendered last with a warning-toned band header so it
 * stays visible instead of silently vanishing.
 *
 * The TOTAL row's percentages use the monthly denominator, which can differ
 * from summing the day-level bases — that mirrors the Excel and is intended.
 *
 * Printing (TKT-000183): the sheet is far wider than a landscape page (35+
 * columns on sls), and a scrolling table simply gets clipped on paper — both
 * edges were cut off in "Save as PDF". On `beforeprint` the natural width of
 * the table is measured and the print root is scaled down to the printable
 * width of an A4 landscape page, so the whole sheet always lands on the page.
 *
 * TKT-000183 (owner 2026-10-05): a WINDING KG context column (the WINDING
 * base); a grand "Total Wastage" band at the far right — every group summed,
 * OTHER included — whose % is shown on the base picked in "Total % on"
 * (default Jute issue; the header names the base, so the printed sheet says
 * what it divides by); and a warning listing the waste items with no mapping
 * row, linking to the mapping master (hidden on print).
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { FileSpreadsheet, Printer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { resolveReportMenuId } from "@/utils/reportMenuService";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { BranchOption } from "@/components/reports/types";
import {
  fetchWastageReport,
  type WastageDayRow,
  type WastageDenomOption,
  type WastageGroupColumn,
  type WastageReport,
  type WastageTotalsRow,
  type WastageUnmappedItem,
} from "@/utils/wastageReportService";
import {
  DprTable,
  SectionCard,
  Td,
  Tr,
  fmt,
  totalRowSx,
} from "../dailyProductionReport/_components/DprPieces";
import {
  DEFAULT_TOTAL_BASE,
  PRODUCTION_HEADERS,
  TOTAL_WASTAGE_TITLE,
  exportWastageReportWorkbook,
  totalPctHeader,
} from "./wastageReportExcel";
import { PRINT_PAGE_MARGIN_MM, printScaleFor } from "./printScale";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTH_LONG = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

/** Previous calendar month as "YYYY-MM" — the sheet a mill reads is last month's. */
function prevMonthYm(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-07-01" → "01 Wed" — parsed via UTC so timezones can't shift the day. */
function dayLabel(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${m[3]} ${WEEKDAY_SHORT[dow]}`;
}

/** "2026-07" → "JULY 2026" for the print letterhead. */
function monthLongLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return ym;
  return `${MONTH_LONG[mm - 1]} ${m[1]}`;
}

/** Sticky first column: doubled `&&` beats the DprTable `& th`/`& td` rules. */
const stickyDateSx = {
  "&&": {
    position: "sticky",
    left: 0,
    zIndex: 1,
    bgcolor: "background.paper",
    whiteSpace: "nowrap",
  },
} as const;

/** Warning wash for the OTHER (unmapped waste) band header. */
const otherHeadSx = {
  "&&": { bgcolor: (t: Theme) => alpha(t.palette.warning.light, 0.3) },
} as const;

const OTHER_TOOLTIP = "Waste entries with no mapping row in jute_waste_report_map";

/** Mapping master the unmapped-items warning links to. */
const WASTE_REPORT_MAP_PATH = "/dashboardportal/juteProduction/masters/wasteReportMap";

/** Primary wash for the grand Total Wastage band header. */
const grandHeadSx = {
  "&&": { bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.12) },
} as const;

const EMPTY_DENOM_OPTIONS: readonly WastageDenomOption[] = Object.freeze([]);
const EMPTY_UNMAPPED: readonly WastageUnmappedItem[] = Object.freeze([]);


/** Right-aligned whole-kg cell; zeros stay visible but dimmed. */
function KgTd({ value, bold }: { value: number | null | undefined; bold?: boolean }) {
  const isZero = value === 0;
  return (
    <Td
      align="right"
      sx={{
        color: isZero && !bold ? "text.disabled" : undefined,
        fontWeight: bold ? 700 : undefined,
      }}
    >
      {fmt(value, 0)}
    </Td>
  );
}

/** Right-aligned percentage cell, 2 decimals, em-dash when no denominator. */
function PctTd({ value, bold }: { value: number | null | undefined; bold?: boolean }) {
  return (
    <Td align="right" sx={{ fontWeight: bold ? 700 : undefined }}>
      {fmt(value, 2)}
    </Td>
  );
}

/** Context (production) band + one cell per group component + TOTAL + % +
 * the grand Total Wastage KG / % on `totalBase` — one table row, shared by the
 * day rows and the monthly TOTAL row. */
function WastageCells({
  row,
  groups,
  totalBase,
  bold,
}: {
  row: WastageDayRow | WastageTotalsRow;
  groups: WastageGroupColumn[];
  totalBase: string;
  bold?: boolean;
}) {
  return (
    <>
      <KgTd value={row.hessian_looms} bold={bold} />
      <KgTd value={row.sacking_looms} bold={bold} />
      <KgTd value={row.frames_run} bold={bold} />
      <KgTd value={row.weaving_kg} bold={bold} />
      <KgTd value={row.spinning_kg} bold={bold} />
      <KgTd value={row.breaker_feed_kg} bold={bold} />
      <KgTd value={row.selection_wt} bold={bold} />
      <KgTd value={row.winding_kg ?? 0} bold={bold} />
      {groups.map((g) => {
        const gv = row.groups[g.group_code];
        return (
          <React.Fragment key={g.group_code}>
            {g.components.map((c) => (
              <KgTd key={c.key} value={row.cells[c.key] ?? 0} bold={bold} />
            ))}
            <KgTd value={gv?.total ?? 0} bold={bold} />
            <PctTd value={gv?.pct ?? null} bold={bold} />
          </React.Fragment>
        );
      })}
      <KgTd value={row.total_waste_kg ?? 0} bold={bold} />
      <PctTd value={row.total_pct_by_base?.[totalBase] ?? null} bold={bold} />
    </>
  );
}

/** "Dust — BATCHING(EJM): 29,580 kg" lines of the unmapped-items warning. */
function UnmappedWarning({ items }: { items: readonly WastageUnmappedItem[] }) {
  const n = items.length;
  return (
    <Alert
      severity="warning"
      sx={{ mb: 2, displayPrint: "none" }}
      action={
        <Button
          component={Link}
          href={WASTE_REPORT_MAP_PATH}
          color="inherit"
          size="small"
          variant="outlined"
          sx={{ whiteSpace: "nowrap" }}
        >
          Map waste items
        </Button>
      }
    >
      {n} waste item{n === 1 ? " is" : "s are"} not mapped to a report group, so their % cannot
      be computed:
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
        {items.map((u) => (
          <li key={`${u.item_id}:${u.dept_id}`}>
            {u.item_name ?? `Item ${u.item_id}`} — {u.dept_name ?? `Dept ${u.dept_id}`}:{" "}
            {fmt(u.waste_kg, 0)} kg
          </li>
        ))}
      </Box>
    </Alert>
  );
}

function Content() {
  const { branches, coId, companyName, initialBranchId } = useReportBranches();
  // Branch comes from the localStorage-backed sidebar context, so the server
  // HTML has an empty branch and the client the saved one — hold the controls
  // until mount to avoid a hydration mismatch (same gate as the other reports).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [month, setMonth] = useState<string>(prevMonthYm());
  const [data, setData] = useState<WastageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Base of the grand Total Wastage % — display only, no refetch.
  const [totalBaseCode, setTotalBaseCode] = useState<string>(DEFAULT_TOTAL_BASE);
  const pathname = usePathname();
  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);
  const printRootRef = useRef<HTMLDivElement | null>(null);

  // Fit-to-width on print: measure the table at its natural (nowrap) width
  // and shrink the print root so it spans exactly the printable page width.
  // The scale is reset to 1 first so a previous print's value cannot mask a
  // table that has since become narrower or wider.
  useEffect(() => {
    const fit = () => {
      const root = printRootRef.current;
      const table = root?.querySelector("table");
      if (!root || !table) return;
      root.style.setProperty("--wsr-print-scale", "1");
      void table.offsetWidth; // flush layout before measuring
      root.style.setProperty("--wsr-print-scale", String(printScaleFor(table.scrollWidth)));
    };
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, []);

  const runFetch = useCallback(
    async (bId: number | null, m: string) => {
      // branch_id is mandatory — waste and production entries are branch-keyed.
      if (coId == null || bId == null || !m) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWastageReport({ coId, branchId: bId, month: m });
        setData(res);
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load the report");
      } finally {
        setLoading(false);
      }
    },
    [coId],
  );

  // Seed the branch ONCE when the sidebar context resolves — after that the
  // user may change it freely.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded report and the selected branch belong
  // to the old company — drop both so nothing renders (or prints) mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  useEffect(() => {
    if (!fetchedOnce.current && coId != null && (branchId ?? initialBranchId) != null) {
      fetchedOnce.current = true;
      void runFetch(branchId ?? initialBranchId, month);
    }
  }, [coId, branchId, initialBranchId, month, runFetch]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;

  // Bands render in display_order, except OTHER (unmapped waste), which always
  // sits last so the mapped groups keep their familiar Excel positions.
  const orderedGroups: WastageGroupColumn[] = useMemo(() => {
    const cols = [...(data?.columns ?? [])].sort((a, b) => a.display_order - b.display_order);
    return [
      ...cols.filter((g) => g.group_code !== "OTHER"),
      ...cols.filter((g) => g.group_code === "OTHER"),
    ];
  }, [data?.columns]);

  const isEmpty = data != null && (data.days.length === 0 || orderedGroups.length === 0);
  const hasData = data != null && !isEmpty;

  const totalBaseOptions = data?.denom_options ?? EMPTY_DENOM_OPTIONS;
  const totalBase: WastageDenomOption = useMemo(
    () =>
      totalBaseOptions.find((o) => o.code === totalBaseCode) ?? {
        code: totalBaseCode,
        label: totalBaseCode,
      },
    [totalBaseOptions, totalBaseCode],
  );
  const unmapped = data?.unmapped ?? EMPTY_UNMAPPED;

  // Excel download of the sheet on screen (TKT-000176): same bands, same
  // day rows and TOTAL, under the standard report letterhead.
  const exportExcel = useCallback(() => {
    if (!data) return;
    void (async () => {
      setExporting(true);
      try {
        const header: ReportExportHeader = {
          companyName,
          branchName: selectedBranch?.branch_name ?? null,
          reportName: "Wastage Report",
          reportFor: monthLongLabel(data.month),
          reportNo: await resolveReportMenuId(pathname),
        };
        await exportWastageReportWorkbook(data, orderedGroups, header, dayLabel, totalBase);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to export the report");
      } finally {
        setExporting(false);
      }
    })();
  }, [data, orderedGroups, companyName, selectedBranch, pathname, totalBase]);

  return (
    <Box sx={{ p: 2 }}>
      {/* On print, show ONLY the report content: the portal shell (sidebar,
          hub back-button) and this page's controls all sit outside
          .wsr-print-root and get visibility-hidden. The sheet is a wide
          landscape document, hence the @page rule, and it is scaled to the
          printable width (--wsr-print-scale, set on beforeprint) because a
          scrolling table cannot scroll on paper — it was being clipped at
          both edges. The root is widened by the inverse of the scale so
          that, once scaled, it spans exactly the page width. */}
      <GlobalStyles
        styles={{
          "@media print": {
            // @page margin 0 suppresses the browser's own header/footer (date,
            // title, URL, page number). The paper margin (PRINT_PAGE_MARGIN_MM)
            // is applied as the print root's top/left offset and the width
            // below, so the printable width is identical to the old @page margin.
            "@page": { size: "A4 landscape", margin: 0 },
            "body *": { visibility: "hidden" },
            ".wsr-print-root, .wsr-print-root *": { visibility: "visible" },
            ".wsr-print-root": {
              position: "absolute",
              top: `${PRINT_PAGE_MARGIN_MM}mm`,
              left: `${PRINT_PAGE_MARGIN_MM}mm`,
              width: `calc((100% - ${2 * PRINT_PAGE_MARGIN_MM}mm) / var(--wsr-print-scale, 1))`,
              transform: "scale(var(--wsr-print-scale, 1))",
              transformOrigin: "top left",
            },
            // The table shell must not clip the sheet on paper.
            ".wsr-print-root .MuiTableContainer-root": { overflow: "visible" },
            // Compact cells: figures never wrap (a wrapped number is a
            // misread number); the scale above does the fitting.
            ".wsr-print-root table td, .wsr-print-root table th": {
              whiteSpace: "nowrap",
              padding: "1px 3px",
              fontSize: "8px",
              lineHeight: 1.25,
            },
          },
        }}
      />
      {mounted && (
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ md: "center" }}
          sx={{ mb: 2, displayPrint: "none" }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            Wastage Report
          </Typography>
          <Autocomplete
            size="small"
            sx={{ minWidth: 220 }}
            options={branches}
            value={selectedBranch}
            getOptionLabel={(o) => o.branch_name}
            isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
            onChange={(_, v) => setBranchId(v?.branch_id ?? null)}
            renderInput={(p) => <TextField {...p} label="Branch" />}
          />
          <TextField
            size="small"
            type="month"
            label="Month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            disabled={loading || coId == null || branchId == null}
            onClick={() => void runFetch(branchId, month)}
          >
            Submit
          </Button>
          <Button
            variant="outlined"
            startIcon={<Printer size={16} />}
            disabled={!hasData}
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileSpreadsheet size={16} />}
            disabled={!hasData || exporting}
            onClick={exportExcel}
          >
            Excel
          </Button>
        </Stack>
      )}

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : null}

      {!loading && isEmpty ? (
        <Alert severity="info">
          No waste entries or production found for this month.
        </Alert>
      ) : null}

      {!loading && hasData && data && unmapped.length > 0 ? (
        <UnmappedWarning items={unmapped} />
      ) : null}

      {!loading && hasData && data ? (
        <Box sx={{ mb: 1.5, width: { xs: "100%", sm: 300 }, displayPrint: "none" }}>
          <SearchableSelect<WastageDenomOption>
            variant="outlined"
            size="small"
            label="Total % on"
            options={totalBaseOptions}
            value={totalBaseOptions.length > 0 ? totalBase : null}
            onChange={(o) => {
              if (o) setTotalBaseCode(o.code);
            }}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            clearable={false}
            disabled={totalBaseOptions.length === 0}
          />
        </Box>
      ) : null}

      {!loading && hasData && data ? (
        <Box className="wsr-print-root" ref={printRootRef}>
          {/* Print letterhead */}
          <Box sx={{ display: "none", displayPrint: "block", mb: 1, textAlign: "center" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {companyName ?? ""} — Wastage Report
            </Typography>
            <Typography variant="caption">
              {selectedBranch?.branch_name ?? ""} · {monthLongLabel(data.month)}
            </Typography>
          </Box>
          <SectionCard
            title={`Daily Wastage — ${monthLongLabel(data.month)}`}
            subtitle="Waste kg per mapped group against the day's production; % on the group's denominator"
          >
            <DprTable
              head={
                <>
                  <Tr>
                    <Td rowSpan={2} sx={stickyDateSx}>
                      DATE
                    </Td>
                    <Td colSpan={PRODUCTION_HEADERS.length} align="center">
                      PRODUCTION
                    </Td>
                    {orderedGroups.map((g) =>
                      g.group_code === "OTHER" ? (
                        <Td
                          key={g.group_code}
                          colSpan={g.components.length + 2}
                          align="center"
                          sx={otherHeadSx}
                        >
                          <Tooltip title={OTHER_TOOLTIP}>
                            <span>{g.group_name}</span>
                          </Tooltip>
                          {/* The tooltip cannot be read on paper: say on the
                              printed sheet why this band has no %. */}
                          <Box
                            component="span"
                            sx={{ display: "none", displayPrint: "inline", fontWeight: 400 }}
                          >
                            {" "}
                            (no mapping row — % not computed)
                          </Box>
                        </Td>
                      ) : (
                        <Td key={g.group_code} colSpan={g.components.length + 2} align="center">
                          {g.group_name}
                        </Td>
                      ),
                    )}
                    <Td colSpan={2} align="center" sx={grandHeadSx}>
                      {TOTAL_WASTAGE_TITLE}
                    </Td>
                  </Tr>
                  <Tr>
                    {PRODUCTION_HEADERS.map((h) => (
                      <Td key={h} align="right">
                        {h}
                      </Td>
                    ))}
                    {orderedGroups.map((g) => (
                      <React.Fragment key={g.group_code}>
                        {g.components.map((c) => (
                          <Td
                            key={c.key}
                            align="right"
                            sx={g.group_code === "OTHER" ? otherHeadSx : undefined}
                          >
                            {c.label}
                          </Td>
                        ))}
                        <Td
                          align="right"
                          sx={g.group_code === "OTHER" ? otherHeadSx : undefined}
                        >
                          TOTAL
                        </Td>
                        <Td
                          align="right"
                          sx={g.group_code === "OTHER" ? otherHeadSx : undefined}
                        >
                          %
                        </Td>
                      </React.Fragment>
                    ))}
                    <Td align="right" sx={grandHeadSx}>
                      KG
                    </Td>
                    <Td align="right" sx={grandHeadSx}>
                      {totalPctHeader(totalBase)}
                    </Td>
                  </Tr>
                </>
              }
            >
              {data.days.map((day) => (
                <Tr key={day.date}>
                  <Td sx={stickyDateSx}>{dayLabel(day.date)}</Td>
                  <WastageCells row={day} groups={orderedGroups} totalBase={totalBase.code} />
                </Tr>
              ))}
              {data.totals ? (
                <Tr sx={totalRowSx()}>
                  <Td sx={stickyDateSx}>TOTAL</Td>
                  <WastageCells
                    row={data.totals}
                    groups={orderedGroups}
                    totalBase={totalBase.code}
                    bold
                  />
                </Tr>
              ) : null}
            </DprTable>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
              Daily % uses each group&apos;s day denominator; the TOTAL row&apos;s % uses the
              monthly denominator, so it can differ from an average of the day rows. Total
              Wastage adds up every group, Other / Unmapped included, and its % is on{" "}
              {totalBase.label}.
            </Typography>
          </SectionCard>
        </Box>
      ) : null}

      {!loading && data == null && !error ? (
        <Alert severity="info">
          Select a branch and month, then press Submit to build the report.
        </Alert>
      ) : null}
    </Box>
  );
}

export default function WastageReportPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      }
    >
      <Content />
    </Suspense>
  );
}
