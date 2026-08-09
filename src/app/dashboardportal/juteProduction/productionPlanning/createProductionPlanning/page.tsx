"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  MenuItem,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowLeft, Copy, Printer, Save } from "lucide-react";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { savePlanning } from "@/utils/juteProductionPlanningService";
import { openStyledPrintWindow } from "@/utils/printUtils";
import ProductionPlanningPreview from "../components/ProductionPlanningPreview";
import PlanningHeaderForm, { type BranchOption } from "./components/PlanningHeaderForm";
import LoomPlanSection from "./components/LoomPlanSection";
import YarnPlanSection from "./components/YarnPlanSection";
import DeptBreakupSection from "./components/DeptBreakupSection";
import PlanningSummaryBar from "./components/PlanningSummaryBar";
import { usePlanningSetup } from "./hooks/usePlanningSetup";
import { usePlanningDocState } from "./hooks/usePlanningDocState";
import { usePlanningCalc } from "./hooks/usePlanningCalc";
import { buildDefaultDoc } from "./utils/planningFactories";
import { uiToSaveRequest, validateSaveRequest } from "./utils/planningMappers";
import type { PlanningMode } from "./types/productionPlanningTypes";

const LIST_ROUTE = "/dashboardportal/juteProduction/productionPlanning";

function todayISO(): string {
  // Local date, not UTC — toISOString() would default plan_date to yesterday
  // before 05:30 IST and collide with the previous day's plan.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PageLoading() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

export default function CreateProductionPlanningPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CreateProductionPlanningInner />
    </Suspense>
  );
}

function CreateProductionPlanningInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const modeParam = (searchParams?.get("mode") || "create").toLowerCase();
  const mode: PlanningMode = modeParam === "edit" ? "edit" : modeParam === "view" ? "view" : "create";
  const requestedId = searchParams?.get("id") ?? null;
  const disabled = mode === "view";

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const { coId } = useSelectedCompanyCoId();
  const { selectedBranches, selectedCompany } = useSidebarContext();

  // Branch resolution: 1 sidebar branch → auto-use it; several → user picks.
  const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
  const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
  React.useEffect(() => {
    if (sidebarBranchIds.length === 1) {
      setPageBranchId(sidebarBranchIds[0]);
    } else if (sidebarBranchIds.length === 0) {
      setPageBranchId("");
    } else {
      setPageBranchId((prev) =>
        prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""
      );
    }
  }, [sidebarBranchIds]);
  const branchId = pageBranchId === "" ? null : (pageBranchId as number);
  const branchOptions = React.useMemo<BranchOption[]>(
    () =>
      (selectedCompany?.branches ?? [])
        .filter((b) => sidebarBranchIds.includes(Number(b.branch_id)))
        .map((b) => ({ branch_id: Number(b.branch_id), branch_name: b.branch_name })),
    [selectedCompany, sidebarBranchIds]
  );

  // ── Document state + setup ──────────────────────────────────────────────
  const docState = usePlanningDocState();
  const { doc, dirty, loading: docLoading, error: docError, setDoc, resetDoc, loadById, copyLatest, markSaved } = docState;

  const planDate = doc?.plan_date || todayISO();
  const setupHook = usePlanningSetup(coId || null, branchId, planDate);
  const {
    setup,
    loading: setupLoading,
    error: setupError,
    clothQualities,
    yarnItems,
    stages,
    resolveNorm,
    resolveYarnRate,
    resolveYarnDesc,
  } = setupHook;

  // Create mode: build the default doc once setup + scope are ready.
  React.useEffect(() => {
    if (mode !== "create" || doc || !coId || branchId == null || !setup) return;
    resetDoc(
      buildDefaultDoc({
        coId: Number(coId),
        branchId,
        planDate: todayISO(),
        stages,
        resolveNorm,
      })
    );
  }, [mode, doc, coId, branchId, setup, stages, resolveNorm, resetDoc]);

  // Edit/view mode: load once the company is known.
  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    if (mode === "create" || !requestedId || !coId || loadedRef.current) return;
    loadedRef.current = true;
    void loadById(requestedId, coId);
  }, [mode, requestedId, coId, loadById]);

  // ── Calc orchestration ──────────────────────────────────────────────────
  const calc = usePlanningCalc({ doc, setDoc, resolveNorm, resolveYarnRate, resolveYarnDesc });

  // Once a document exists, doc.branch_id is the single source of truth for
  // branch. The header form's Branch select patches the doc; this effect
  // mirrors it into pageBranchId so setup (norms, machine counts) always
  // resolves for the document's branch — including edit/view loads and later
  // "Working Branch" changes (the default-doc effect runs only once).
  const docBranchId = doc?.branch_id ?? null;
  React.useEffect(() => {
    if (!doc) return;
    const target: number | "" = docBranchId == null ? "" : docBranchId;
    setPageBranchId((prev) => (prev === target ? prev : target));
  }, [doc, docBranchId]);

  // ── Save / copy / print ─────────────────────────────────────────────────
  const [updateNorms, setUpdateNorms] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [snack, setSnack] = React.useState<string | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<readonly string[]>([]);
  const [printOpen, setPrintOpen] = React.useState(false);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const handleSave = React.useCallback(async () => {
    if (!doc || disabled) return;
    const payload = uiToSaveRequest(doc, updateNorms);
    const errors = validateSaveRequest(payload);
    if (errors.length > 0) {
      setValidationErrors(errors);
      setSnack("Please fix the validation errors before saving.");
      return;
    }
    setValidationErrors([]);
    setSaving(true);
    try {
      const result = await savePlanning(payload);
      markSaved(result.planning_id, result.plan_no);
      setSnack(`Saved ${result.plan_no ?? `plan #${result.planning_id}`}.`);
      if (mode === "create") {
        router.replace(`${LIST_ROUTE}/createProductionPlanning?mode=edit&id=${result.planning_id}`);
      }
    } catch (e) {
      setSnack(e instanceof Error ? e.message : "Failed to save the plan.");
    } finally {
      setSaving(false);
    }
  }, [doc, disabled, updateNorms, markSaved, mode, router]);

  const handleCopyLatest = React.useCallback(async () => {
    if (!coId || !doc) return;
    const copied = await copyLatest({ coId, branchId, planDate: doc.plan_date });
    if (!copied) {
      setSnack("No earlier plan found to copy.");
    } else {
      setSnack("Copied the latest plan — review and save.");
    }
  }, [coId, doc, branchId, copyLatest]);

  const handlePrint = React.useCallback(() => {
    const content = previewRef.current?.innerHTML || "";
    const win = openStyledPrintWindow(content, `Production Planning - ${doc?.plan_no ?? "Draft"}`);
    if (!win) return;
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 300);
  }, [doc]);

  // ── Guards ──────────────────────────────────────────────────────────────
  if (!mounted) return null;

  if (!coId) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Select a company to continue.
      </Alert>
    );
  }

  if (sidebarBranchIds.length === 0) {
    return (
      <Alert severity="warning" sx={{ m: 2 }}>
        Select at least one branch in the sidebar to continue.
      </Alert>
    );
  }

  const branchName = branchOptions.find((b) => b.branch_id === (doc?.branch_id ?? branchId))?.branch_name;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Title + actions */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Button size="small" startIcon={<ArrowLeft size={15} />} onClick={() => router.push(LIST_ROUTE)}>
          Back
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {mode === "create" ? "New Production Plan" : mode === "edit" ? "Edit Production Plan" : "View Production Plan"}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {mode === "create" ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Copy size={15} />}
            onClick={handleCopyLatest}
            disabled={docLoading || !doc}
          >
            Copy latest plan
          </Button>
        ) : null}
        <Button
          size="small"
          variant="outlined"
          startIcon={<Printer size={15} />}
          onClick={() => setPrintOpen(true)}
          disabled={!doc}
        >
          Print
        </Button>
        {!disabled ? (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={updateNorms}
                  onChange={(e) => setUpdateNorms(e.target.checked)}
                />
              }
              label={<Typography variant="caption">Update norms from this plan</Typography>}
            />
            <Button
              size="small"
              variant="contained"
              startIcon={<Save size={15} />}
              onClick={handleSave}
              disabled={saving || docLoading || !doc || !dirty}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        ) : null}
      </Box>

      {/* Branch picker when several sidebar branches (create only) */}
      {mode === "create" && sidebarBranchIds.length > 1 ? (
        <TextField
          select
          size="small"
          label="Working Branch"
          value={pageBranchId}
          onChange={(e) => {
            const v = e.target.value === "" ? "" : Number(e.target.value);
            setPageBranchId(v);
            // Keep the document in step — pageBranchId alone never flows back
            // into an already-created doc (the default-doc effect runs once).
            if (doc) calc.patchHeader({ branch_id: v === "" ? null : v });
          }}
          sx={{ maxWidth: 260 }}
        >
          {branchOptions.map((b) => (
            <MenuItem key={b.branch_id} value={b.branch_id}>
              {b.branch_name}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      {setupError ? <Alert severity="error">{setupError}</Alert> : null}
      {docError ? <Alert severity="error">{docError}</Alert> : null}
      {validationErrors.length > 0 ? (
        <Alert severity="error" onClose={() => setValidationErrors([])}>
          {validationErrors.slice(0, 8).map((err) => (
            <Typography key={err} variant="caption" component="div">
              • {err}
            </Typography>
          ))}
        </Alert>
      ) : null}

      {docLoading || setupLoading || !doc ? (
        <PageLoading />
      ) : (
        <>
          <PlanningSummaryBar summary={calc.summary} warnings={calc.warnings} />

          <PlanningHeaderForm
            doc={doc}
            branchOptions={branchOptions}
            disabled={disabled}
            onPatch={calc.patchHeader}
          />

          <LoomPlanSection
            lines={doc.loom_lines}
            totals={calc.loomTotals}
            clothQualities={clothQualities}
            yarnItems={yarnItems}
            disabled={disabled}
            warningUids={calc.warningUids}
            onAddLine={calc.addLoomLine}
            onRemoveLine={calc.removeLoomLine}
            onPatchLine={calc.patchLoomLine}
            onCalcCell={calc.setLoomCalcCell}
            onQualityChange={calc.setLoomQuality}
            onRecalculate={() => calc.recalcSection("loom")}
          />

          <YarnPlanSection
            lines={doc.yarn_lines}
            yarnItems={yarnItems}
            disabled={disabled}
            warningUids={calc.warningUids}
            onAddPctLine={calc.addPctYarnLine}
            onAddSaleLine={calc.addSaleYarnLine}
            onRemoveLine={calc.removeYarnLine}
            onPatchLine={calc.patchYarnLine}
            onCalcCell={calc.setYarnCalcCell}
            onYarnChange={calc.setYarnItem}
            onRecalculate={() => calc.recalcSection("yarn")}
          />

          <DeptBreakupSection
            lines={doc.dept_lines}
            disabled={disabled}
            warningUids={calc.warningUids}
            onPatchLine={calc.patchDeptLine}
            onCalcCell={calc.setDeptCalcCell}
            onRecalculate={() => calc.recalcSection("dept")}
          />
        </>
      )}

      {/* Print preview dialog */}
      <Dialog open={printOpen} onClose={() => setPrintOpen(false)} maxWidth="lg" fullWidth>
        <DialogContent>
          {doc ? (
            <ProductionPlanningPreview ref={previewRef} doc={doc} coId={coId} branchName={branchName} />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintOpen(false)}>Close</Button>
          <Button variant="contained" startIcon={<Printer size={15} />} onClick={handlePrint}>
            Print
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack != null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack ?? ""}
      />
    </Box>
  );
}
