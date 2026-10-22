/**
 * Spreader Production Report service.
 *
 * Backend: GET /api/juteProductionReports/spreader_production_datewise
 * (vowerp3be src/juteProduction/reports.py).
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** One pivot line: a machine × quality (Production) or a quality (Issue), in one unit. */
export interface SpreaderDatewiseRow {
  kind: "Production" | "Issue";
  machine_id: number | null;
  machine_name: string | null;
  /** "Total" on a machine subtotal, "Grand Total" on the block total. */
  quality_label: string | null;
  unit: "Rolls" | "Kg";
  /** ISO production date -> value. Days with nothing are absent. */
  days: Record<string, number>;
  total: number;
  /** total / days that have a value. */
  average: number;
}

export interface SpreaderDatewiseReport {
  /** Every date in the period, in order — one grid column each. */
  dates: string[];
  rows: SpreaderDatewiseRow[];
}

export interface SpreaderMachineOption {
  machine_id: number;
  machine_name: string;
  mech_code: string | null;
}

export interface SpreaderDatewiseFilters {
  coId: number;
  branchId: number;
  dateFrom: string;
  dateTo: string;
  machineId?: number | null;
}

export async function fetchSpreaderDatewise(
  f: SpreaderDatewiseFilters,
): Promise<SpreaderDatewiseReport> {
  const qs = new URLSearchParams({
    co_id: String(f.coId),
    branch_id: String(f.branchId),
    date_from: f.dateFrom,
    date_to: f.dateTo,
  });
  if (f.machineId != null) qs.set("machine_id", String(f.machineId));
  const res = await fetchWithCookie<{ data: SpreaderDatewiseReport }>(
    `${apiRoutesPortalMasters.JUTE_PROD_SPREADER_DATEWISE}?${qs.toString()}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the spreader production report");
  }
  return res.data.data;
}

/** Spreader machines of the branch — reuses the spreader entry setup endpoint. */
export async function fetchSpreaderMachines(
  coId: number,
  branchId: number,
): Promise<SpreaderMachineOption[]> {
  const res = await fetchWithCookie<{ data: { machines: SpreaderMachineOption[] } }>(
    `${apiRoutesPortalMasters.SPREADER_ENTRY_CREATE_SETUP}?co_id=${coId}&branch_id=${branchId}`,
  );
  if (res.error || !res.data) {
    throw new Error(res.error ?? "Failed to fetch the spreader machines");
  }
  return res.data.data.machines ?? [];
}
