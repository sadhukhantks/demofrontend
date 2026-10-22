"use client";

/**
 * Daily Bale Sheet — the printed sheet of every bale weighed at the bale press
 * on one date, one block per quality (spec §8.3). The Google Sheet laid the
 * blocks side by side; here they are a list, each with its own footer (PROD /
 * REPACK counts, Σ gross, Σ net, avg net, deviation % vs std) and a totals card
 * per type and overall at the end. REPACK rows are listed in their quality's
 * block, flagged, with the Original Bale No filled (D2).
 *
 * Filters: branch (sidebar scope), one date (default today), spell (optional,
 * from the bale entry_setup spells) and entry type (All / Production / Repack).
 * Print is landscape with each block kept on one page section; Excel export
 * flattens the blocks to rows with a Quality column and keeps the footers as
 * total rows.
 *
 * Contract: docs/bale-production-spec-sheet.md §6.3 (see ./types.ts).
 */

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  GlobalStyles,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Printer } from "lucide-react";
import { useReportBranches } from "@/components/reports/useReportBranches";
import PrintFrame from "@/components/reports/PrintFrame";
import { useMounted } from "@/components/reports/useMounted";
import { todayIso } from "@/components/reports/reportDates";
import { exportRowsToExcel } from "@/components/reports/exportExcel";
import type { BranchOption } from "@/components/reports/types";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { tokens } from "@/styles/tokens";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";
import {
  DprTable,
  SectionCard,
  Td,
  Tr,
  totalRowSx,
} from "../dailyProductionReport/_components/DprPieces";
import type {
  BaleDailySheet,
  BaleEntrySetupSpells,
  BaleSpellOption,
  EntryTypeFilter,
} from "./types";
import {
  DAILY_SHEET_EXPORT_COLUMNS,
  ENTRY_TYPE_OPTIONS,
  entryTypeParam,
  flattenDailySheetForExcel,
  fmtKg,
  qualityTypeLabel,
} from "./dailySheetUtils";
import BaleSheetBlock from "./_components/BaleSheetBlock";

// --------------------------------------------------------------- fetch ----

interface FetchParams {
  coId: number;
  branchId: number;
  tranDate: string;
  spellId: number | "";
  entryType: EntryTypeFilter;
}

async function fetchBaleDailySheet(p: FetchParams): Promise<BaleDailySheet> {
  const qs = new URLSearchParams({
    co_id: String(p.coId),
    branch_id: String(p.branchId),
    tran_date: p.tranDate,
  });
  if (p.spellId !== "") qs.set("spell_id", String(p.spellId));
  const et = entryTypeParam(p.entryType);
  if (et) qs.set("entry_type", et);
  const res = await fetchWithCookie<{ data: BaleDailySheet }>(
    `${apiRoutesPortalMasters.BALE_REPORT_DAILY_SHEET}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the Daily Bale Sheet");
  }
  return res.data.data;
}

/** Spell options come from the bale entry page's setup endpoint — the same
 * list the operator picked from when weighing. A failed load just leaves the
 * (optional) filter empty; the sheet itself still runs. */
async function fetchBaleSpells(coId: number, branchId: number): Promise<BaleSpellOption[]> {
  const qs = new URLSearchParams({ co_id: String(coId), branch_id: String(branchId) });
  const res = await fetchWithCookie<{ data: BaleEntrySetupSpells }>(
    `${apiRoutesPortalMasters.BALE_PROD_ENTRY_SETUP}?${qs.toString()}`,
  );
  if (res.error || !res.data) return [];
  return res.data.data?.spells ?? [];
}

// ---------------------------------------------------------------- page ----

function Content() {
  const { branches, coId, companyName, initialBranchId, dateParam } =
    useReportBranches();
  const mounted = useMounted();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [tranDate, setTranDate] = useState<string>(dateParam ?? todayIso());
  const [spellId, setSpellId] = useState<number | "">("");
  const [entryType, setEntryType] = useState<EntryTypeFilter>("ALL");
  const [spells, setSpells] = useState<BaleSpellOption[]>([]);

  const [data, setData] = useState<BaleDailySheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedOnce = useRef(false);
  const branchSeeded = useRef(false);
  const lastCoId = useRef<number | null>(null);

  const runFetch = useCallback(
    async (bId: number | null) => {
      if (coId == null || bId == null || !tranDate) return;
      setLoading(true);
      setError(null);
      try {
        setData(
          await fetchBaleDailySheet({ coId, branchId: bId, tranDate, spellId, entryType }),
        );
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Failed to load the report");
      } finally {
        setLoading(false);
      }
    },
    [coId, tranDate, spellId, entryType],
  );

  // Seed the branch ONCE when the sidebar context resolves.
  useEffect(() => {
    if (!branchSeeded.current && initialBranchId != null) {
      branchSeeded.current = true;
      setBranchId(initialBranchId);
    }
  }, [initialBranchId]);

  // Sidebar company switch: the loaded sheet, the branch and the spell list
  // belong to the old company — drop them so nothing renders mislabeled.
  useEffect(() => {
    if (coId == null) return;
    if (lastCoId.current != null && lastCoId.current !== coId) {
      setData(null);
      setBranchId(null);
      setSpells([]);
      setSpellId("");
      branchSeeded.current = false;
      fetchedOnce.current = false;
    }
    lastCoId.current = coId;
  }, [coId]);

  // One automatic load once a branch is available; afterwards only on Submit.
  useEffect(() => {
    const b = branchId ?? initialBranchId;
    if (!fetchedOnce.current && coId != null && b != null) {
      fetchedOnce.current = true;
      void runFetch(b);
    }
  }, [coId, branchId, initialBranchId, runFetch]);

  // Spell options follow the company + branch; a branch change clears the
  // chosen spell (its id belongs to the previous branch's shift set).
  useEffect(() => {
    const b = branchId ?? initialBranchId;
    if (coId == null || b == null) return;
    let alive = true;
    setSpellId("");
    void fetchBaleSpells(coId, b).then((list) => {
      if (alive) setSpells(list);
    });
    return () => {
      alive = false;
    };
  }, [coId, branchId, initialBranchId]);

  const selectedBranch: BranchOption | null =
    branches.find((b) => b.branch_id === branchId) ?? null;
  const spellOptions = useMemo(
    () =>
      spells.map((s) => ({
        value: s.spell_id,
        label: s.spell_name && s.spell_name !== s.spell_code
          ? `${s.spell_code} — ${s.spell_name}`
          : s.spell_code,
      })),
    [spells],
  );
  const selectedSpell = spells.find((s) => s.spell_id === spellId) ?? null;
  const entryTypeLabelText =
    ENTRY_TYPE_OPTIONS.find((o) => o.value === entryType)?.label ?? "All";

  const isEmpty = data != null && data.blocks.length === 0;
  const hasData = data != null && !isEmpty;

  const handleExport = useCallback(async () => {
    if (!data) return;
    const filterBits = [
      selectedSpell ? `Spell ${selectedSpell.spell_code}` : null,
      entryType !== "ALL" ? entryTypeLabelText : null,
    ].filter(Boolean);
    await exportRowsToExcel(
      DAILY_SHEET_EXPORT_COLUMNS,
      flattenDailySheetForExcel(data),
      "bale-daily-sheet",
      {
        companyName,
        branchName: selectedBranch?.branch_name ?? data.branch_name,
        reportName: filterBits.length
          ? `Daily Bale Sheet (${filterBits.join(", ")})`
          : "Daily Bale Sheet",
        reportFor: data.tran_date,
      },
    );
  }, [data, companyName, selectedBranch?.branch_name, selectedSpell, entryType, entryTypeLabelText]);

  return (
    <Box sx={{ p: 3 }}>
      {/* Print: only the sheet is visible — the portal shell, the hub's back
          button and the filter bar sit outside .bds-print-root. Landscape, and
          every block is `breakInside: avoid` so a quality never splits. */}
      <GlobalStyles
        styles={{
          "@media print": {
            // @page margin 0 suppresses the browser's own header/footer (date,
            // title, URL, page number). The paper margin (10mm ~ the old
            // browser-default margin) is the print root's side padding plus the
            // <PrintFrame> top/bottom spacers, which repeat on every page.
            "@page": { size: "landscape", margin: 0 },
            "body *": { visibility: "hidden" },
            ".bds-print-root, .bds-print-root *": { visibility: "visible" },
            ".bds-print-root": {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              boxSizing: "border-box",
              padding: "0 10mm",
            },
          },
        }}
      />
      <Typography
        variant="h5"
        sx={{ color: tokens.report.header, fontWeight: "bold", mb: 2 }}
      >
        Daily Bale Sheet
      </Typography>

      {mounted && (
        <>
          <Paper elevation={1} sx={{ mb: 2, p: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
            >
              {branches.length > 1 ? (
                <Box sx={{ minWidth: 240 }}>
                  <SearchableSelect<BranchOption>
                    variant="outlined"
                    size="small"
                    label="Branch"
                    options={branches}
                    value={selectedBranch}
                    onChange={(opt) => setBranchId(opt?.branch_id ?? null)}
                    getOptionLabel={(o) => o.branch_name}
                    getOptionKey={(o) => o.branch_id}
                    isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
                    clearable={false}
                  />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ minWidth: 160 }}>
                  <strong>Branch:</strong> {selectedBranch?.branch_name ?? "—"}
                </Typography>
              )}
              <TextField
                type="date"
                label="Date"
                value={tranDate}
                onChange={(e) => setTranDate(e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 180 }}
              />
              <Box sx={{ minWidth: 170 }}>
                <SearchableOptionSelect<number>
                  label="Spell"
                  placeholder="All spells"
                  options={spellOptions}
                  value={spellId}
                  onChange={(v) => setSpellId(v === "" ? "" : Number(v))}
                  fullWidth
                  noOptionsText={
                    spells.length === 0 ? "No spells for this branch" : "No match"
                  }
                />
              </Box>
              <Box sx={{ minWidth: 160 }}>
                <SearchableOptionSelect<EntryTypeFilter>
                  label="Entry Type"
                  options={ENTRY_TYPE_OPTIONS}
                  value={entryType}
                  onChange={(v) => setEntryType(v === "" ? "ALL" : v)}
                  clearable={false}
                  fullWidth
                />
              </Box>
              <Button
                variant="contained"
                disabled={branchId == null || loading}
                onClick={() => void runFetch(branchId)}
                sx={{
                  backgroundColor: tokens.report.header,
                  "&:hover": { backgroundColor: tokens.report.headerHover },
                  textTransform: "none",
                }}
              >
                Submit
              </Button>
              <Button
                variant="outlined"
                disabled={!hasData}
                onClick={() => void handleExport()}
                sx={{ textTransform: "none" }}
              >
                Export to Excel
              </Button>
              <Button
                variant="outlined"
                startIcon={<Printer size={16} />}
                disabled={!hasData}
                onClick={() => window.print()}
                sx={{ textTransform: "none" }}
              >
                Print
              </Button>
            </Box>
          </Paper>

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

          {!loading && branchId == null ? (
            <Alert severity="info">Select a branch to view the sheet.</Alert>
          ) : null}

          {!loading && isEmpty && data ? (
            <Alert severity="info">
              No {entryType === "ALL" ? "" : `${entryTypeLabelText.toLowerCase()} `}
              bales were weighed on {data.tran_date}
              {selectedSpell ? ` in spell ${selectedSpell.spell_code}` : ""} for this
              branch.
            </Alert>
          ) : null}

          {!loading && hasData && data ? (
            <Box className="bds-print-root">
              <PrintFrame marginMm={10}>
                {/* Print letterhead */}
                <Box sx={{ display: "none", displayPrint: "block", mb: 1, textAlign: "center" }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {companyName ?? ""} — Daily Bale Sheet
                  </Typography>
                  <Typography variant="caption">
                    {selectedBranch?.branch_name ?? data.branch_name ?? ""} · {data.tran_date}
                    {selectedSpell ? ` · Spell ${selectedSpell.spell_code}` : ""}
                    {entryType !== "ALL" ? ` · ${entryTypeLabelText} only` : ""}
                  </Typography>
                </Box>

                <Stack spacing={2}>
                  {data.blocks.map((b) => (
                    <BaleSheetBlock key={b.finishing_quality_id} block={b} />
                  ))}

                  <SectionCard
                    title="Totals"
                    subtitle="Bale counts and weights by quality type; REPACK bales are listed separately and not counted as production"
                  >
                    <DprTable
                      head={
                        <Tr>
                          <Td>Type</Td>
                          <Td align="right">PROD Bales</Td>
                          <Td align="right">REPACK Bales</Td>
                          <Td align="right">Σ Gross (kg)</Td>
                          <Td align="right">Σ Net (kg)</Td>
                        </Tr>
                      }
                    >
                      {data.totals.by_type.map((t) => (
                        <Tr key={t.quality_type}>
                          <Td>{qualityTypeLabel(t.quality_type).toUpperCase() || `Type ${t.quality_type}`}</Td>
                          <Td align="right">{t.prod_bales}</Td>
                          <Td align="right">{t.repack_bales}</Td>
                          <Td align="right">{fmtKg(t.total_gross)}</Td>
                          <Td align="right">{fmtKg(t.total_net)}</Td>
                        </Tr>
                      ))}
                      <Tr sx={totalRowSx()}>
                        <Td>OVERALL</Td>
                        <Td align="right">{data.totals.overall.prod_bales}</Td>
                        <Td align="right">{data.totals.overall.repack_bales}</Td>
                        <Td align="right">{fmtKg(data.totals.overall.total_gross)}</Td>
                        <Td align="right">{fmtKg(data.totals.overall.total_net)}</Td>
                      </Tr>
                    </DprTable>
                  </SectionCard>
                </Stack>
              </PrintFrame>
            </Box>
          ) : null}
        </>
      )}
    </Box>
  );
}

export default function BaleDailySheetPage() {
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
