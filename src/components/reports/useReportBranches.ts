"use client";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import type { BranchOption } from "./types";

/**
 * Shared branch options + the selected company id + the initial branch/date
 * seeded from the reports-hub query params (falling back to the sidebar branch).
 * Pages using this must wrap their content in a <Suspense> boundary (it reads
 * useSearchParams).
 */
export function useReportBranches(): {
  branches: BranchOption[];
  coId: number | null;
  companyName: string | null;
  initialBranchId: number | null;
  dateParam: string | null;
} {
  const searchParams = useSearchParams();
  const { selectedCompany, selectedBranches } = useSidebarContext();

  const branches: BranchOption[] = useMemo(() => {
    const all = (selectedCompany?.branches ?? []).map((b) => ({
      branch_id: b.branch_id,
      branch_name: b.branch_name,
    }));
    // Norm: report pages follow the sidebar's branch scope — when the user has
    // narrowed the sidebar to specific branches, only those are offered here.
    // Pages should render a branch picker only when branches.length > 1.
    const scoped = selectedBranches.length
      ? all.filter((b) => selectedBranches.includes(b.branch_id))
      : all;
    return scoped.length ? scoped : all;
  }, [selectedCompany?.branches, selectedBranches]);

  const urlBranch = searchParams.get("branch_id");
  const parsedUrlBranch = urlBranch ? Number(urlBranch) : null;
  const initialBranchId = Number.isFinite(parsedUrlBranch as number)
    ? (parsedUrlBranch as number)
    : (selectedBranches[0] ??
      (branches.length === 1 ? branches[0].branch_id : null));

  return {
    branches,
    coId: selectedCompany?.co_id ?? null,
    companyName: selectedCompany?.co_name ?? null,
    initialBranchId,
    dateParam: searchParams.get("date"),
  };
}
