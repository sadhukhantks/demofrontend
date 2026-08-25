"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMechMastersSetup,
  type MechEnumOption,
  type MechMachineOption,
  type MechMachineTypeOption,
} from "@/utils/juteMechanicalService";
import { useReportBranches } from "@/components/reports/useReportBranches";
import { useMounted } from "@/components/reports/useMounted";
import { currentMonthRange } from "@/components/reports/reportDates";
import type { BranchOption } from "@/components/reports/types";

/**
 * Filter state + dropdown options shared by all twelve Jute Mechanical report
 * pages.
 *
 * Company and branch come from the sidebar selection via `useReportBranches`
 * (which reads `useSearchParams`, so every consumer must sit inside a
 * `<Suspense>` boundary). Machine / machine-type / discipline options come from
 * `/mechMaintMasters/masters_setup` — one call, cached per company+branch.
 */
export interface MechReportFilters {
  /** Branch list from the sidebar company. */
  branches: BranchOption[];
  coId: number | null;
  companyName: string | null;
  branch: BranchOption | null;
  branchId: number | null;
  setBranchId: (value: number | null) => void;

  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;

  machineId: number | null;
  setMachineId: (value: number | null) => void;
  machineTypeId: number | null;
  setMachineTypeId: (value: number | null) => void;
  discipline: string | null;
  setDiscipline: (value: string | null) => void;

  /** Machines narrowed to the chosen branch and machine type. */
  machines: MechMachineOption[];
  machineTypes: MechMachineTypeOption[];
  disciplines: MechEnumOption[];
  selectedMachine: MechMachineOption | null;
  selectedMachineType: MechMachineTypeOption | null;
  selectedDiscipline: MechEnumOption | null;

  setupError: string | null;
  /** False during SSR and the first client render (hydration guard). */
  mounted: boolean;
  /** True once a company and branch are known — the report may run. */
  ready: boolean;
  /** Params every report service call takes. */
  reportParams: {
    coId: number;
    branchId: number | null;
    dateFrom: string;
    dateTo: string;
    machineTypeId: number | null;
    machineId: number | null;
    discipline: string | null;
  } | null;
}

export function useMechReportFilters(): MechReportFilters {
  const { branches, coId, companyName, initialBranchId, dateParam } =
    useReportBranches();
  const mounted = useMounted();
  const { from, to } = currentMonthRange();

  const [branchId, setBranchId] = useState<number | null>(initialBranchId);
  const [dateFrom, setDateFrom] = useState<string>(from);
  const [dateTo, setDateTo] = useState<string>(dateParam || to);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [machineTypeId, setMachineTypeId] = useState<number | null>(null);
  const [discipline, setDiscipline] = useState<string | null>(null);

  const [allMachines, setAllMachines] = useState<MechMachineOption[]>([]);
  const [machineTypes, setMachineTypes] = useState<MechMachineTypeOption[]>([]);
  const [disciplines, setDisciplines] = useState<MechEnumOption[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);

  // The sidebar seeds the branch only after hydration; adopt it once.
  const seededBranch = useRef(false);
  useEffect(() => {
    if (seededBranch.current) return;
    if (initialBranchId == null) return;
    seededBranch.current = true;
    setBranchId(initialBranchId);
  }, [initialBranchId]);

  // Dropdowns: one masters_setup call per company + branch.
  useEffect(() => {
    if (coId == null) return;
    let alive = true;
    setSetupError(null);
    fetchMechMastersSetup({ coId, branchId })
      .then((setup) => {
        if (!alive) return;
        setAllMachines(setup.machines ?? []);
        setMachineTypes(setup.machine_types ?? []);
        setDisciplines(setup.disciplines ?? []);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // An empty picker still lets the report run unfiltered, so this is a
        // notice rather than a blocking error.
        setAllMachines([]);
        setMachineTypes([]);
        setDisciplines([]);
        setSetupError(
          err instanceof Error ? err.message : "Failed to load filter options",
        );
      });
    return () => {
      alive = false;
    };
  }, [coId, branchId]);

  // Machines narrowed to the branch (derived via dept_mst) and machine type.
  const machines = useMemo(
    () =>
      allMachines.filter((m) => {
        if (branchId != null && m.branch_id != null && m.branch_id !== branchId) {
          return false;
        }
        if (machineTypeId != null && m.machine_type_id !== machineTypeId) {
          return false;
        }
        return true;
      }),
    [allMachines, branchId, machineTypeId],
  );

  // Drop a machine selection that the narrowed list no longer contains.
  useEffect(() => {
    if (machineId == null) return;
    if (machines.some((m) => m.machine_id === machineId)) return;
    setMachineId(null);
  }, [machines, machineId]);

  const branch = useMemo(
    () => branches.find((b) => b.branch_id === branchId) ?? null,
    [branches, branchId],
  );
  const selectedMachine = useMemo(
    () => machines.find((m) => m.machine_id === machineId) ?? null,
    [machines, machineId],
  );
  const selectedMachineType = useMemo(
    () => machineTypes.find((t) => t.machine_type_id === machineTypeId) ?? null,
    [machineTypes, machineTypeId],
  );
  const selectedDiscipline = useMemo(
    () => disciplines.find((d) => d.code === discipline) ?? null,
    [disciplines, discipline],
  );

  const ready = coId != null && branchId != null;

  const reportParams = useMemo(
    () =>
      coId == null
        ? null
        : {
            coId,
            branchId,
            dateFrom,
            dateTo,
            machineTypeId,
            machineId,
            discipline,
          },
    [coId, branchId, dateFrom, dateTo, machineTypeId, machineId, discipline],
  );

  const handleSetMachineType = useCallback((value: number | null) => {
    setMachineTypeId(value);
  }, []);

  return {
    branches,
    coId,
    companyName,
    branch,
    branchId,
    setBranchId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    machineId,
    setMachineId,
    machineTypeId,
    setMachineTypeId: handleSetMachineType,
    discipline,
    setDiscipline,
    machines,
    machineTypes,
    disciplines,
    selectedMachine,
    selectedMachineType,
    selectedDiscipline,
    setupError,
    mounted,
    ready,
    reportParams,
  };
}

/**
 * Rows + loading/error state for one report, with the house "load once, then
 * only on Submit" behaviour (mirrors `ReportPanel`).
 *
 * The fetcher is held in a ref so a page can pass an inline closure without
 * re-firing the initial load on every render.
 */
export interface MechReportRun<T> {
  rows: T[];
  unattributed: number | null;
  loading: boolean;
  error: string | null;
  run: () => Promise<void>;
}

export function useMechReportRun<T>(
  fetcher: () => Promise<{ rows: T[]; unattributed?: number | null }>,
  ready: boolean,
): MechReportRun<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [unattributed, setUnattributed] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setRows(result.rows);
      setUnattributed(result.unattributed ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setRows([]);
      setUnattributed(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !ready) return;
    didInit.current = true;
    void run();
  }, [ready, run]);

  return { rows, unattributed, loading, error, run };
}
