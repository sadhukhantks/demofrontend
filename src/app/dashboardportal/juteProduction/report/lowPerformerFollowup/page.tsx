"use client";

/**
 * Low Performer Follow-up — the mill marks a few workers (by EB No) whose
 * production / efficiency must be followed up, keeps a dated record of
 * remarks, warning notices and hour cuts against them, and sees what machine
 * and count they worked on and how they compare with others (same machine in
 * other shifts, same count in the department, own trend since marked).
 *
 * One route, two views: the list, and `?followup_id=N` for one person (kept on
 * the same route so the menu permission matches exactly). `?eb_no=&dept_code=`
 * opens the Add dialog prefilled — the Low Producer reports link here that way.
 * Backend: vowerp3be src/juteProduction/low_performer_followup.py.
 */

import * as React from "react";
import { Suspense } from "react";
import { Alert, Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import AddFollowupDialog from "@/components/lowPerformerFollowup/AddFollowupDialog";
import {
  DEFAULT_DEPT_LABELS,
  EMPTY_CODE_LABELS,
  deptOptions,
  isFollowupDeptCode,
} from "@/components/lowPerformerFollowup/constants";
import { useFollowupSetup } from "@/components/lowPerformerFollowup/useFollowupSetup";
import type { FollowupDeptCode, FollowupRow } from "@/utils/lowPerformerFollowupService";
import { tokens } from "@/styles/tokens";
import FollowupDetailView from "./_components/FollowupDetailView";
import FollowupListFilters, { type DeptFilter } from "./_components/FollowupListFilters";
import FollowupListGrid from "./_components/FollowupListGrid";
import { useFollowupList } from "./_hooks/useFollowupList";
import {
  buildHref,
  parsePositiveId,
  resolveBranchId,
  statusParam,
  type StatusFilter,
} from "./_utils";

const TITLE = "Low Performer Follow-up";

interface AddDialogState {
  open: boolean;
  ebNo?: string;
  deptCode?: FollowupDeptCode;
  /** Opened from ?eb_no= — the params are dropped from the URL on cancel. */
  fromUrl: boolean;
}

function Workspace({ coId }: { coId: number }) {
  const { branches, initialBranchId } = useReportBranches();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { hasMenuAccess } = useSidebarContext();
  const canCreate = hasMenuAccess(pathname, "create");
  const canEdit = hasMenuAccess(pathname, "edit");
  const viewOnly = !canCreate && !canEdit;

  const followupId = parsePositiveId(searchParams.get("followup_id"));

  const [branchChoice, setBranchChoice] = React.useState<number | null>(null);
  const branchId = resolveBranchId(branchChoice, initialBranchId, branches);

  // Prefill from ?eb_no=&dept_code= is read once, on mount.
  const [addState, setAddState] = React.useState<AddDialogState>(() => {
    const ebNo = searchParams.get("eb_no")?.trim();
    const dept = searchParams.get("dept_code");
    return ebNo
      ? { open: true, ebNo, deptCode: isFollowupDeptCode(dept) ? dept : undefined, fromUrl: true }
      : { open: false, fromUrl: false };
  });
  const [dept, setDept] = React.useState<DeptFilter>(() => {
    const d = searchParams.get("dept_code");
    return isFollowupDeptCode(d) ? d : "ALL";
  });
  const [status, setStatus] = React.useState<StatusFilter>("open");
  const created = React.useRef(false);

  const { setup } = useFollowupSetup(coId, branchId);
  const list = useFollowupList({
    coId,
    branchId,
    deptCode: dept === "ALL" ? null : dept,
    status: statusParam(status),
    enabled: followupId == null,
  });

  const depts = setup?.depts?.length ? setup.depts : DEFAULT_DEPT_LABELS;
  const deptChoices = React.useMemo(() => deptOptions(depts), [depts]);

  const openFollowup = React.useCallback(
    (row: Pick<FollowupRow, "followup_id" | "branch_id">) => {
      router.push(buildHref(pathname, { followup_id: row.followup_id, branch_id: row.branch_id }));
    },
    [router, pathname],
  );

  const closeAdd = () => {
    const fromUrl = addState.fromUrl;
    setAddState({ open: false, fromUrl: false });
    if (fromUrl && !created.current) router.replace(buildHref(pathname, { branch_id: branchId }));
    created.current = false;
  };

  const onCreated = (row: FollowupRow) => {
    created.current = true;
    openFollowup(row);
  };

  const emptyText =
    status === "open"
      ? `No one is being followed up${canCreate ? " — use Add person" : ""}`
      : "No follow-ups match the filters";

  return (
    <>
      {viewOnly ? (
        <Stack direction="row" sx={{ mb: 1.5 }}>
          <Chip size="small" label="View only" variant="outlined" />
        </Stack>
      ) : null}

      {followupId != null ? (
        <FollowupDetailView
          key={followupId}
          coId={coId}
          followupId={followupId}
          branches={branches}
          canCreate={canCreate}
          canEdit={canEdit}
          onBack={(b) => router.push(buildHref(pathname, { branch_id: b ?? branchId }))}
        />
      ) : (
        <>
          <FollowupListFilters
            branches={branches}
            branchId={branchId}
            onBranchChange={setBranchChoice}
            deptOptions={deptChoices}
            dept={dept}
            onDeptChange={setDept}
            status={status}
            onStatusChange={setStatus}
            canCreate={canCreate}
            onAdd={() => setAddState({ open: true, fromUrl: false })}
            onRefresh={() => void list.reload()}
            loading={list.loading}
          />
          {branchId == null ? (
            <Alert severity="info">Select a branch to see its follow-ups.</Alert>
          ) : (
            <FollowupListGrid
              rows={list.rows}
              loading={list.loading}
              error={list.error}
              depts={depts}
              noticeTypes={setup?.notice_types ?? EMPTY_CODE_LABELS}
              onOpen={openFollowup}
              emptyText={emptyText}
            />
          )}
        </>
      )}

      {canCreate && branchId != null ? (
        <AddFollowupDialog
          open={addState.open}
          onClose={closeAdd}
          onCreated={onCreated}
          coId={coId}
          branchId={branchId}
          initialEbNo={addState.ebNo}
          initialDeptCode={addState.deptCode}
        />
      ) : null}
    </>
  );
}

function Content() {
  // The sidebar company / branch come from a localStorage-backed context, so
  // nothing that depends on them renders until mount (hydration mismatch).
  const mounted = useMounted();
  const { coId } = useReportBranches();

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Typography variant="h5" sx={{ color: tokens.report.header, fontWeight: "bold", mb: 0.5 }}>
        {TITLE}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Workers marked for follow-up on production / efficiency: remarks, warning notices and hour cuts,
        and how they compare with others on the same machine and count.
      </Typography>
      {!mounted ? null : coId == null ? (
        <Alert severity="warning">Select a company in the sidebar to continue.</Alert>
      ) : (
        // Keyed by company: a sidebar company switch starts the page afresh.
        <Workspace key={coId} coId={coId} />
      )}
    </Box>
  );
}

export default function LowPerformerFollowupPage() {
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
