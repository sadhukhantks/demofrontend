/**
 * Prop contracts of the Long Absenteeism tabs owned by FE-2 (Dispatch,
 * Reports, Templates, Settings) and of the watchlist's Excel export button.
 * page.tsx renders them through ./index.ts; FE-2 replaces each placeholder
 * file in place and keeps these props.
 */

import type { BranchOption } from "@/components/reports/types";
import type { LaListRow, LaSetup } from "@/utils/longAbsenteeismService";

export type LaNotifySeverity = "success" | "error" | "warning";

export interface LaTabProps {
  coId: number;
  /** The page's branch (null until one is picked when several are in scope). */
  branchId: number | null;
  /** Branches in the sidebar scope (the picker lives above the tabs). */
  branches: ReadonlyArray<BranchOption>;
  /** GET /setup of the branch: codes + labels, rule, departments, today, access level. */
  setup: LaSetup | null;
  /** Edit access on the menu for the branch (Dispatch / Templates / Settings are only shown with it). */
  canEdit: boolean;
  /** Page-level banner. */
  onNotify: (msg: string, severity: LaNotifySeverity) => void;
  /** Opens a case on the same route (?case_id=N); optional for tabs that link to cases. */
  onOpenCase?: (caseId: number, branchId?: number | null) => void;
  /** Re-reads /setup (Settings saved a new rule: waits, extra column labels). */
  onSetupChanged?: () => void;
}

export interface ExportWatchlistButtonProps {
  /** The watchlist rows currently shown (the view + filters applied). */
  rows: LaListRow[];
  setup: LaSetup | null;
  companyName: string;
  branchName: string;
  disabled?: boolean;
}
