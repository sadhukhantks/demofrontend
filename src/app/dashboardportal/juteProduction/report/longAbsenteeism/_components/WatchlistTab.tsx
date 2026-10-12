"use client";

/**
 * Watchlist tab: filter bar, view chips (Due today / Open / Parked / Closed /
 * Candidates), the department summary strip, the Due-today bands, the sheet-style grid (cards on a phone),
 * the candidates list and the list-level dialogs (open case, dismiss, batch
 * issue). Container: owns the list hook and the dialog state.
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { FolderPlus, RefreshCw, Search, Send } from "lucide-react";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import {
  updateLaCase,
  type LaBatchResult,
  type LaCandidate,
  type LaCase,
  type LaListRow,
  type LaSetup,
} from "@/utils/longAbsenteeismService";
import { useLaWatchlist } from "../_hooks/useLaWatchlist";
import {
  BANDS,
  NO_DEPARTMENT_LABEL,
  NO_DEPT_FILTER,
  WATCH_VIEWS,
  deptSummary,
  extraColumns,
  filterByDept,
  groupByBand,
  groupLettersDue,
  matchesQuery,
  type BandKey,
  type WatchView,
} from "../_utils";
import BatchIssueDialog from "./BatchIssueDialog";
import CandidatesList from "./CandidatesList";
import DeptSummary from "./DeptSummary";
import DismissDialog from "./DismissDialog";
import OpenCaseDialog from "./OpenCaseDialog";
import WatchlistCards from "./WatchlistCards";
import WatchlistGrid, { type EditableCellField } from "./WatchlistGrid";
import { ExportWatchlistButton, type LaNotifySeverity } from "./tabs";

const EMPTY_IDS: ReadonlySet<number> = new Set<number>();

export interface WatchlistTabProps {
  coId: number;
  branchId: number;
  setup: LaSetup | null;
  today: string;
  view: WatchView;
  onViewChange: (view: WatchView) => void;
  canCreate: boolean;
  canEdit: boolean;
  isMobile: boolean;
  companyName: string;
  branchName: string;
  onOpenCase: (caseId: number, branchId: number) => void;
  onNotify: (msg: string, severity: LaNotifySeverity) => void;
}

type OpenCaseTarget = { candidate: LaCandidate | null } | null;

export default function WatchlistTab({
  coId,
  branchId,
  setup,
  today,
  view,
  onViewChange,
  canCreate,
  canEdit,
  isMobile,
  companyName,
  branchName,
  onOpenCase,
  onNotify,
}: WatchlistTabProps) {
  const [deptId, setDeptId] = React.useState<number | null>(null);
  const [qInput, setQInput] = React.useState("");
  const [q, setQ] = React.useState("");
  const [showTable, setShowTable] = React.useState(false);
  const [selected, setSelected] = React.useState<ReadonlySet<number>>(EMPTY_IDS);
  const [openCase, setOpenCase] = React.useState<OpenCaseTarget>(null);
  const [dismiss, setDismiss] = React.useState<LaCandidate | null>(null);
  const [batchOpen, setBatchOpen] = React.useState(false);

  // Debounced server search.
  React.useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const list = useLaWatchlist({ coId, branchId, view, q, enabled: true });
  const { patchRow } = list;

  const extraCols = React.useMemo(() => extraColumns(setup?.rule), [setup]);
  const deptOptions = React.useMemo(
    () => [
      { value: 0, label: "All departments" },
      { value: NO_DEPT_FILTER, label: NO_DEPARTMENT_LABEL },
      ...(setup?.depts ?? []).map((d) => ({ value: d.dept_id, label: d.dept_desc })),
    ],
    [setup],
  );
  // The list and the candidates are loaded for every department (after the
  // search); the Department filter narrows them here, on the client, so the
  // summary strip keeps counting all departments.
  const allCandidates = React.useMemo(
    () => list.candidates.filter((c) => matchesQuery(c, q)),
    [list.candidates, q],
  );
  const candidates = React.useMemo(() => filterByDept(allCandidates, deptId), [allCandidates, deptId]);
  const visibleRows = React.useMemo(() => filterByDept(list.rows, deptId), [list.rows, deptId]);
  const bands = React.useMemo(() => groupByBand(visibleRows), [visibleRows]);
  const letterGroups = React.useMemo(() => groupLettersDue(bands.LETTER_DUE, setup), [bands, setup]);

  const asCards = isMobile && !showTable;
  const selectable = canEdit;

  const openRow = React.useCallback((row: LaListRow) => onOpenCase(row.case_id, row.branch_id), [onOpenCase]);

  const saveCell = React.useCallback(
    async (row: LaListRow, field: EditableCellField, value: string | null): Promise<LaListRow> => {
      const c = await updateLaCase({ co_id: coId, case_id: row.case_id, [field]: value });
      const merged: LaListRow = { ...row, ...c };
      patchRow(merged);
      return merged;
    },
    [coId, patchRow],
  );

  const onSelectionChange = React.useCallback((gridIds: number[], selectedInGrid: number[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of gridIds) next.delete(id);
      for (const id of selectedInGrid) next.add(id);
      return next;
    });
  }, []);

  const onToggle = React.useCallback((caseId: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(caseId);
      else next.delete(caseId);
      return next;
    });
  }, []);

  const onCellError = React.useCallback((msg: string) => onNotify(msg, "error"), [onNotify]);

  const caseRows = (rows: LaListRow[], emptyText: string, opts: { selectable: boolean }) =>
    asCards ? (
      <WatchlistCards
        rows={rows}
        today={today}
        onOpen={openRow}
        selectable={opts.selectable}
        selected={selected}
        onToggle={onToggle}
        emptyText={emptyText}
      />
    ) : (
      <WatchlistGrid
        rows={rows}
        loading={list.loading}
        extraCols={extraCols}
        canEditCells={canCreate}
        today={today}
        onOpen={openRow}
        onCellSave={saveCell}
        onCellError={onCellError}
        selectable={opts.selectable}
        selected={selected}
        onSelectionChange={onSelectionChange}
        emptyText={emptyText}
        hideFooter={view === "due" && rows.length <= 50}
      />
    );

  const candidateList = (rows: LaCandidate[], emptyText: string) => (
    <CandidatesList
      rows={rows}
      loading={list.candidatesLoading}
      asCards={asCards}
      canAct={canCreate}
      onOpenCase={(c) => setOpenCase({ candidate: c })}
      onDismiss={setDismiss}
      emptyText={emptyText}
      hideFooter={view === "due" && rows.length <= 50}
    />
  );

  // The department strip counts the rows the current view renders BEFORE the
  // Department filter (so every department stays visible while one is
  // selected): Due today = every banded row + the "New candidates" band,
  // Candidates = the candidate rows, the other views = the list rows.
  const summary = React.useMemo(
    () =>
      deptSummary(
        view === "due"
          ? [...Object.values(groupByBand(list.rows)).flat(), ...allCandidates]
          : view === "candidates"
            ? allCandidates
            : list.rows,
      ),
    [view, list.rows, allCandidates],
  );
  const viewLabel = WATCH_VIEWS.find((v) => v.value === view)?.label ?? "";

  const bandCount = (key: BandKey) => (key === "CANDIDATES" ? candidates.length : bands[key].length);
  const dueTotal = BANDS.reduce((n, b) => n + bandCount(b.key), 0);
  const selectedCount = selected.size;

  const onIssued = (res: LaBatchResult) => {
    setSelected(EMPTY_IDS);
    onNotify(
      `${res.issued.length} letter${res.issued.length === 1 ? "" : "s"} issued${
        res.skipped.length ? `, ${res.skipped.length} skipped` : ""
      }.`,
      res.issued.length ? "success" : "warning",
    );
    void list.reload();
  };

  const onOpened = (c: LaCase) => {
    setOpenCase(null);
    onNotify(`Case ${c.case_no ?? c.case_id} opened.`, "success");
    onOpenCase(c.case_id, c.branch_id);
  };

  return (
    <Box>
      <Paper elevation={1} sx={{ mb: 2, p: { xs: 1.5, md: 2 } }}>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            alignItems: "center",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "220px 260px 1fr" },
          }}
        >
          <SearchableOptionSelect<number>
            label="Department"
            options={deptOptions}
            value={deptId ?? 0}
            onChange={(v) => setDeptId(v === "" || v === 0 ? null : v)}
            clearable={false}
            fullWidth
          />
          <TextField
            size="small"
            label="Search EB No / name"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              },
            }}
            fullWidth
          />
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent={{ md: "flex-end" }}>
            <Button
              variant="outlined"
              startIcon={<RefreshCw size={16} />}
              onClick={() => void list.reload()}
              disabled={list.loading || list.candidatesLoading}
              sx={{ minHeight: 40 }}
            >
              Refresh
            </Button>
            {canCreate ? (
              <Button
                variant="outlined"
                startIcon={<FolderPlus size={16} />}
                onClick={() => setOpenCase({ candidate: null })}
                sx={{ minHeight: 40 }}
              >
                Open case
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant="contained"
                startIcon={<Send size={16} />}
                onClick={() => setBatchOpen(true)}
                sx={{ minHeight: 40 }}
              >
                {selectedCount ? `Issue letters for selected (${selectedCount})` : "Issue due letters"}
              </Button>
            ) : null}
            <ExportWatchlistButton
              rows={visibleRows}
              setup={setup}
              companyName={companyName}
              branchName={branchName}
              disabled={view === "candidates" || visibleRows.length === 0}
            />
          </Stack>
        </Box>

        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          alignItems="center"
          sx={{ mt: 1.5 }}
          role="tablist"
          aria-label="Watchlist view"
        >
          {WATCH_VIEWS.map((v) => (
            <Chip
              key={v.value}
              label={v.label}
              role="tab"
              aria-selected={view === v.value}
              color={view === v.value ? "primary" : "default"}
              variant={view === v.value ? "filled" : "outlined"}
              onClick={() => onViewChange(v.value)}
              sx={{ minHeight: { xs: 36, md: 32 } }}
            />
          ))}
          {isMobile ? (
            <FormControlLabel
              sx={{ ml: "auto" }}
              control={<Switch size="small" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} />}
              label="Show as table"
            />
          ) : null}
        </Stack>
      </Paper>

      <DeptSummary
        items={summary.items}
        total={summary.total}
        selectedDeptId={deptId}
        onSelectDept={setDeptId}
        viewLabel={viewLabel}
      />

      {list.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {list.error}
        </Alert>
      ) : null}

      {view === "due" ? (
        <Stack spacing={2.5}>
          {!list.loading && !list.candidatesLoading && dueTotal === 0 && !list.error && !list.candidatesError ? (
            <Alert severity="success">Nothing is due today in this branch.</Alert>
          ) : null}
          {BANDS.map((band) => {
            const count = bandCount(band.key);
            if (band.key === "CANDIDATES") {
              if (count === 0 && !list.candidatesError) return null;
              return (
                <Box key={band.key}>
                  <BandHeader title={band.title} hint={band.hint} count={count} />
                  {list.candidatesError ? (
                    <Alert severity="error" sx={{ mb: 1 }}>
                      {list.candidatesError}
                    </Alert>
                  ) : null}
                  {count ? candidateList(candidates, "No new candidates") : null}
                </Box>
              );
            }
            if (count === 0) return null;
            if (band.key === "LETTER_DUE") {
              return (
                <Box key={band.key}>
                  <BandHeader title={band.title} hint={band.hint} count={count} />
                  <Stack spacing={1.5}>
                    {letterGroups.map((g) => (
                      <Box key={g.code || "none"}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                          {g.label} <Chip size="small" label={g.rows.length} sx={{ ml: 0.5 }} />
                        </Typography>
                        {caseRows(g.rows, "None", { selectable })}
                      </Box>
                    ))}
                  </Stack>
                </Box>
              );
            }
            return (
              <Box key={band.key}>
                <BandHeader title={band.title} hint={band.hint} count={count} />
                {caseRows(bands[band.key], "None", { selectable: false })}
              </Box>
            );
          })}
        </Stack>
      ) : view === "candidates" ? (
        <Box>
          {list.candidatesError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {list.candidatesError}
            </Alert>
          ) : null}
          {candidateList(candidates, "No worker is absent past the limit without a case")}
        </Box>
      ) : (
        caseRows(
          visibleRows,
          view === "open" ? "No open cases" : view === "parked" ? "No parked cases" : "No closed cases",
          { selectable: selectable && view === "open" },
        )
      )}

      {!asCards && view !== "candidates" && canCreate ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Double-click a Remarks cell to edit it; double-click elsewhere on a row to open the case.
        </Typography>
      ) : null}

      {canCreate ? (
        <OpenCaseDialog
          open={openCase != null}
          coId={coId}
          branchId={branchId}
          candidate={openCase?.candidate ?? null}
          today={today}
          onClose={() => setOpenCase(null)}
          onOpened={onOpened}
        />
      ) : null}
      {canCreate ? (
        <DismissDialog
          coId={coId}
          branchId={branchId}
          candidate={dismiss}
          defaultSnooze={setup?.rule.dismiss_snooze_days ?? 30}
          onClose={() => setDismiss(null)}
          onDismissed={() => {
            setDismiss(null);
            onNotify("Candidate dismissed.", "success");
            void list.reload();
          }}
        />
      ) : null}
      {canEdit ? (
        <BatchIssueDialog
          open={batchOpen}
          coId={coId}
          branchId={branchId}
          preselected={[...selected]}
          dispatchModes={setup?.dispatch_modes ?? []}
          isMobile={isMobile}
          onClose={() => setBatchOpen(false)}
          onIssued={onIssued}
        />
      ) : null}
    </Box>
  );
}

function BandHeader({ title, hint, count }: { title: string; hint: string; count: number }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
          {title}
        </Typography>
        <Chip size="small" color="primary" label={count} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {hint}
      </Typography>
    </Box>
  );
}
