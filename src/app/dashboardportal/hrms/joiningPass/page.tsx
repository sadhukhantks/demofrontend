"use client";

/**
 * Joining Pass (HRMS, owner request 2026-10-24).
 *
 * A worker absent for MORE than the company's threshold (default 3 working
 * days; holidays and non-working days are skipped, approved leave counts as
 * present) needs a joining pass from the Personnel office before rejoining. The
 * pass is the EJM "JOINING PASS FOR DEPARTMENT" letter: absent from, last
 * fortnight's efficiency and days present out of working days (filled from
 * data, a blank line when there is none), join w.e.f., the final-chance warning.
 *
 * Tabs: Check & issue (EB No + joining date → criterion, preview, issue +
 * print), Absent > N days (who would need a pass today), Passes issued
 * (register, reprint, cancel). Refusing attendance without a pass is done by
 * the separate attendance app, which can read the same /check criterion.
 *
 * Backend: vowerp3be src/hrms/joiningPass.py (/api/joiningPass).
 */

import * as React from "react";
import { Suspense } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Tab, Tabs, Typography } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { tokens } from "@/styles/tokens";
import { fetchJpSetup, type JpSetup } from "@/utils/joiningPassService";
import AbsenteesPanel from "./_components/AbsenteesPanel";
import IssuePanel, { type IssuePrefill } from "./_components/IssuePanel";
import RegisterPanel from "./_components/RegisterPanel";
import RuleDialog from "./_components/RuleDialog";
import { JP_TABS, parseTab, resolveBranchId, tabLabel, type JpTab } from "./_utils";

type Severity = "success" | "info" | "warning" | "error";

function Workspace({ coId }: { coId: number }) {
  const { branches, initialBranchId } = useReportBranches();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { hasMenuAccess } = useSidebarContext();
  const menuCreate = hasMenuAccess(pathname, "create");
  const menuEdit = hasMenuAccess(pathname, "edit");

  const [branchChoice, setBranchChoice] = React.useState<number | null>(null);
  const branchId = resolveBranchId(branchChoice, initialBranchId, branches);
  const branchName = branches.find((b) => b.branch_id === branchId)?.branch_name ?? "";
  const tab = parseTab(searchParams.get("tab"));

  const [setup, setSetup] = React.useState<JpSetup | null>(null);
  const [setupError, setSetupError] = React.useState<string | null>(null);
  const [banner, setBanner] = React.useState<{ text: string; severity: Severity } | null>(null);
  const [prefill, setPrefill] = React.useState<IssuePrefill | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [ruleOpen, setRuleOpen] = React.useState(false);

  React.useEffect(() => {
    if (branchId == null) return;
    let alive = true;
    setSetup(null);
    setSetupError(null);
    fetchJpSetup(coId, branchId)
      .then((s) => {
        if (alive) setSetup(s);
      })
      .catch((e: unknown) => {
        if (alive) setSetupError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [coId, branchId]);

  React.useEffect(() => {
    if (banner?.severity !== "success") return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  const notify = React.useCallback((text: string, severity: Severity) => setBanner({ text, severity }), []);
  const level = setup?.access_level ?? 0;
  const canCreate = menuCreate && level >= 3;
  const canEdit = menuEdit && level >= 4;

  const setTab = (t: JpTab) => {
    const p = new URLSearchParams(searchParams.toString());
    if (t === "issue") p.delete("tab");
    else p.set("tab", t);
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ""}`);
  };

  const openCheck = (empCode: string, joinDate: string) => {
    setPrefill((prev) => ({ empCode, joinDate, seq: (prev?.seq ?? 0) + 1 }));
    setTab("issue");
  };

  const branchOptions = React.useMemo(
    () => branches.map((b) => ({ value: b.branch_id, label: b.branch_name })),
    [branches],
  );

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
        <Tabs value={tab} onChange={(_e, v: JpTab) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          {JP_TABS.map((t) => (
            <Tab key={t.value} value={t.value} label={tabLabel(t.value, setup?.rule.min_absent_days ?? null)} sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ pb: { xs: 1, md: 0 } }}>
          {!menuCreate && !menuEdit ? <Chip size="small" label="View only" variant="outlined" /> : null}
          {canEdit && setup ? (
            <Button size="small" variant="outlined" onClick={() => setRuleOpen(true)}>
              Rule: &gt; {setup.rule.min_absent_days} days
            </Button>
          ) : null}
          {branches.length > 1 ? (
            <SearchableOptionSelect<number>
              label="Branch"
              options={branchOptions}
              value={branchId ?? ""}
              onChange={(v) => setBranchChoice(v === "" ? null : v)}
              clearable={false}
              size="small"
              sx={{ minWidth: { md: 220 } }}
            />
          ) : branchName ? (
            <Typography variant="body2" color="text.secondary">
              Branch: <strong>{branchName}</strong>
            </Typography>
          ) : null}
        </Stack>
      </Box>

      {banner ? (
        <Alert severity={banner.severity} onClose={() => setBanner(null)} sx={{ mb: 2 }}>
          {banner.text}
        </Alert>
      ) : null}
      {setupError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {setupError}
        </Alert>
      ) : null}

      {branchId == null ? (
        <Alert severity="info">Select a branch.</Alert>
      ) : !setup ? (
        setupError ? null : (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )
      ) : (
        <>
          {/* The issue panel stays mounted so a check survives a tab switch. */}
          <Box sx={{ display: tab === "issue" ? "block" : "none" }}>
            <IssuePanel
              key={branchId}
              coId={coId}
              branchId={branchId}
              today={setup.today}
              setup={setup}
              canCreate={canCreate}
              prefill={prefill}
              onNotify={notify}
              onIssued={() => setRefreshKey((k) => k + 1)}
            />
          </Box>
          {tab === "absentees" ? <AbsenteesPanel key={branchId} coId={coId} branchId={branchId} setup={setup} onCheck={openCheck} /> : null}
          {tab === "register" ? (
            <RegisterPanel
              key={branchId}
              coId={coId}
              branchId={branchId}
              today={setup.today}
              canEdit={canEdit}
              companyName={setup.letterhead.co_name ?? ""}
              branchName={branchName}
              refreshKey={refreshKey}
              onNotify={notify}
            />
          ) : null}
          <RuleDialog
            open={ruleOpen}
            coId={coId}
            branchId={branchId}
            setup={setup}
            onClose={() => setRuleOpen(false)}
            onSaved={(rule) => {
              setSetup({ ...setup, rule });
              setRuleOpen(false);
            }}
            onNotify={notify}
          />
        </>
      )}
    </>
  );
}

function Content() {
  const mounted = useMounted();
  const { coId } = useReportBranches();
  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Typography variant="h5" sx={{ color: tokens.report.header, fontWeight: "bold", mb: 0.5 }}>
        Joining Pass
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Gate pass letter for a worker rejoining after an absence of more than the allowed working days.
      </Typography>
      {!mounted ? null : coId == null ? (
        <Alert severity="warning">Select a company in the sidebar to continue.</Alert>
      ) : (
        <Workspace key={coId} coId={coId} />
      )}
    </Box>
  );
}

export default function JoiningPassPage() {
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
