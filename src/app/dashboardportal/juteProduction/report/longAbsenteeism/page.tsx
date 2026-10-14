"use client";

/**
 * Long Absenteeism follow-up (name struck off).
 *
 * The Personnel office keeps one tracked case per long-absent worker: ESI /
 * STL check and time keeper confirmation, three warning letters, a show cause
 * and a gate notice served on the unions — each letter's SENT date drives the
 * next — then a struck-off approval that marks the employee Terminated.
 *
 * One route, two views (kept on the same route so the menu permission matches
 * exactly; never a sub-route named /edit, /create or /print):
 *   - list: tabs ?tab=watchlist|dispatch|reports|templates|settings
 *     (Dispatch / Templates / Settings only with edit access),
 *   - case: ?case_id=N.
 * Backend: vowerp3be src/juteProduction/long_absenteeism.py (+ _letters.py).
 * Spec: vowerp3be docs/superpowers/specs/2026-10-11-long-absenteeism-followup.md
 */

import * as React from "react";
import { Suspense } from "react";
import { Alert, Box, Chip, CircularProgress, Stack, Tab, Tabs, Typography } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { localTodayISO } from "@/components/lowPerformerFollowup/schemas";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { tokens } from "@/styles/tokens";
import CaseView from "./_components/CaseView";
import WatchlistTab from "./_components/WatchlistTab";
import {
  DispatchTab,
  ReportsTab,
  SettingsTab,
  TemplatesTab,
  type LaNotifySeverity,
  type LaTabProps,
} from "./_components/tabs";
import { useIsMobile } from "./_hooks/useIsMobile";
import { useLaSetup } from "./_hooks/useLaSetup";
import {
  buildHref,
  parsePositiveId,
  parseTab,
  parseView,
  resolveBranchId,
  visibleTabs,
  type LaTab,
  type WatchView,
} from "./_utils";

const TITLE = "Long Absenteeism";

interface Banner {
  severity: LaNotifySeverity;
  text: string;
}

function Workspace({ coId, companyName }: { coId: number; companyName: string }) {
  const { branches, initialBranchId } = useReportBranches();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { hasMenuAccess } = useSidebarContext();
  const isMobile = useIsMobile();
  const menuCreate = hasMenuAccess(pathname, "create");
  const menuEdit = hasMenuAccess(pathname, "edit");

  const caseId = parsePositiveId(searchParams.get("case_id"));
  const [branchChoice, setBranchChoice] = React.useState<number | null>(null);
  const branchId = resolveBranchId(branchChoice, initialBranchId, branches);

  // The case view loads the setup of the case's own branch.
  const { setup, error: setupError, reload: reloadSetup } = useLaSetup(coId, caseId == null ? branchId : null);
  const level = setup?.access_level ?? null;
  const canCreate = menuCreate && (level == null || level >= 3);
  const canEdit = menuEdit && (level == null || level >= 4);
  const viewOnly = !menuCreate && !menuEdit;

  const tab = parseTab(searchParams.get("tab"), canEdit);
  const view = parseView(searchParams.get("view"));
  const [localToday] = React.useState(() => localTodayISO());
  const today = setup?.today ?? localToday;
  const branchName = branches.find((b) => b.branch_id === branchId)?.branch_name ?? "";

  const [banner, setBanner] = React.useState<Banner | null>(null);
  const notify = React.useCallback((text: string, severity: LaNotifySeverity) => setBanner({ text, severity }), []);
  // Success notes fade; warnings and errors stay until closed.
  React.useEffect(() => {
    if (banner?.severity !== "success") return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const openCase = React.useCallback(
    (id: number, b?: number | null) => {
      router.push(buildHref(pathname, { case_id: id, branch_id: b ?? branchId }));
    },
    [router, pathname, branchId],
  );

  const backToList = (b: number | null) => {
    if (b != null) setBranchChoice(b);
    router.push(buildHref(pathname, { branch_id: b ?? branchId, view: view === "due" ? null : view }));
  };

  const setTab = (t: LaTab) => {
    router.replace(
      buildHref(pathname, {
        tab: t === "watchlist" ? null : t,
        view: t === "watchlist" && view !== "due" ? view : null,
        branch_id: branchId,
      }),
    );
  };

  const setView = (v: WatchView) => {
    router.replace(buildHref(pathname, { view: v === "due" ? null : v, branch_id: branchId }));
  };

  const branchOptions = React.useMemo(
    () => branches.map((b) => ({ value: b.branch_id, label: b.branch_name })),
    [branches],
  );

  const tabProps: LaTabProps = {
    coId,
    branchId,
    branches,
    setup,
    canEdit,
    onNotify: notify,
    onOpenCase: openCase,
    onSetupChanged: reloadSetup,
  };

  const bannerEl = banner ? (
    <Alert severity={banner.severity} onClose={() => setBanner(null)} sx={{ mb: 2 }}>
      {banner.text}
    </Alert>
  ) : null;

  if (caseId != null) {
    return (
      <>
        {viewOnly ? (
          <Stack direction="row" sx={{ mb: 1.5 }}>
            <Chip size="small" label="View only" variant="outlined" />
          </Stack>
        ) : null}
        {bannerEl}
        <CaseView
          key={caseId}
          coId={coId}
          caseId={caseId}
          branches={branches}
          menuCreate={menuCreate}
          menuEdit={menuEdit}
          isMobile={isMobile}
          onBack={backToList}
          onOpenCase={openCase}
          onNotify={notify}
        />
      </>
    );
  }

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "stretch", md: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
          gap: 1.5,
          mb: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Tabs
          value={tab}
          onChange={(_e, v: LaTab) => setTab(v)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Long absenteeism sections"
        >
          {visibleTabs(canEdit).map((t) => (
            <Tab key={t.value} value={t.value} label={t.label} sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ pb: { xs: 1, md: 0 } }}>
          {viewOnly ? <Chip size="small" label="View only" variant="outlined" /> : null}
          {branches.length > 1 ? (
            <SearchableOptionSelect<number>
              label="Branch"
              options={branchOptions}
              value={branchId ?? ""}
              onChange={(v) => setBranchChoice(v === "" ? null : v)}
              fullWidth
              sx={{ minWidth: { md: 220 } }}
            />
          ) : branchName ? (
            <Typography variant="body2" color="text.secondary">
              Branch: <strong>{branchName}</strong>
            </Typography>
          ) : null}
        </Stack>
      </Box>

      {bannerEl}
      {setupError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {setupError}
        </Alert>
      ) : null}

      {branchId == null ? (
        <Alert severity="info">Select a branch to see its long absentees.</Alert>
      ) : tab === "watchlist" ? (
        <WatchlistTab
          key={branchId}
          coId={coId}
          branchId={branchId}
          setup={setup}
          today={today}
          view={view}
          onViewChange={setView}
          canCreate={canCreate}
          canEdit={canEdit}
          isMobile={isMobile}
          companyName={companyName}
          branchName={branchName}
          onOpenCase={openCase}
          onNotify={notify}
        />
      ) : tab === "dispatch" ? (
        <DispatchTab {...tabProps} />
      ) : tab === "reports" ? (
        <ReportsTab {...tabProps} />
      ) : tab === "templates" ? (
        <TemplatesTab {...tabProps} />
      ) : (
        <SettingsTab {...tabProps} />
      )}
    </>
  );
}

function Content() {
  // The sidebar company / branch come from a localStorage-backed context, so
  // nothing that depends on them renders until mount (hydration mismatch).
  const mounted = useMounted();
  const { coId, companyName } = useReportBranches();

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Typography variant="h5" sx={{ color: tokens.report.header, fontWeight: "bold", mb: 0.5 }}>
        {TITLE}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Workers absent for a long time: verification, warning letters with their sent dates, show cause, gate notice to
        the unions and the struck-off approval.
      </Typography>
      {!mounted ? null : coId == null ? (
        <Alert severity="warning">Select a company in the sidebar to continue.</Alert>
      ) : (
        // Keyed by company: a sidebar company switch starts the page afresh.
        <Workspace key={coId} coId={coId} companyName={companyName ?? ""} />
      )}
    </Box>
  );
}

export default function LongAbsenteeismPage() {
  // useReportBranches() reads useSearchParams() — `next build` needs a
  // Suspense boundary above it.
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
