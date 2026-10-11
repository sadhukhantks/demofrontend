"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import type { BranchOption } from "@/components/reports/types";
import { resolveReportMenuId } from "@/utils/reportMenuService";

export interface ExportHeaderContext {
  /** Sidebar company name ("" until known). */
  companyName: string;
  /** The page's branch name ("" when none). */
  branchName: string;
  /** Excel header block: company, branch, report name + period, Report No (this page's menu id). */
  build: (reportName: string, reportFor: string | null) => Promise<ReportExportHeader>;
}

/** Company / branch / Report No for the Excel exports and print-outs of the FE-2 tabs. */
export function useExportHeader(branchId: number | null, branches: ReadonlyArray<BranchOption>): ExportHeaderContext {
  const pathname = usePathname();
  const { selectedCompany } = useSidebarContext();
  const companyName = selectedCompany?.co_name ?? "";
  const branchName = branches.find((b) => b.branch_id === branchId)?.branch_name ?? "";

  const build = React.useCallback(
    async (reportName: string, reportFor: string | null): Promise<ReportExportHeader> => ({
      companyName: companyName || null,
      branchName: branchName || null,
      reportName,
      reportFor,
      reportNo: await resolveReportMenuId(pathname),
    }),
    [companyName, branchName, pathname],
  );

  return { companyName, branchName, build };
}
