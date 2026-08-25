"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Paper, TextField, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import {
  fetchReportMenuTree,
  type ReportMenuNode,
} from "@/utils/reportMenuService";
import { currentMonthRange } from "@/components/reports/reportDates";
import { useMounted } from "@/components/reports/useMounted";
import type { BranchOption } from "@/components/reports/types";
import { tokens } from "@/styles/tokens";

/**
 * Module-level cache of the report list, so the picker is populated instantly
 * on every mount (including a Back navigation) instead of only the first load.
 * Cleared on a full page reload.
 */
let cachedReportNodes: ReportMenuNode[] | null = null;

/**
 * Jute Mechanical & Maintenance reports hub.
 *
 * The report list is DB-driven: `menu_mst` rows flagged `report = 1` that are
 * direct children of this page's menu, fetched through `fetchReportMenuTree`.
 * Choosing a report navigates to it carrying the branch and date so the report
 * page opens already filtered.
 */
export default function JuteMechanicalReportsPage() {
  const router = useRouter();
  const { selectedCompany, selectedBranches } = useSidebarContext();
  const mounted = useMounted();
  const { to } = currentMonthRange();

  const [selectedReport, setSelectedReport] = useState<ReportMenuNode | null>(
    null,
  );
  const [selectedBranch, setSelectedBranch] = useState<BranchOption | null>(
    null,
  );
  const [reportDate, setReportDate] = useState<string>(to);
  const [dbReports, setDbReports] = useState<ReportMenuNode[]>(
    cachedReportNodes ?? [],
  );

  useEffect(() => {
    let alive = true;
    fetchReportMenuTree("juteMechanical/reports")
      .then((res) => {
        if (!alive) return;
        // Flat list — direct report children of this page's menu only.
        const list = res.data.filter(
          (n) => n.menu_parent_id === res.root_menu_id,
        );
        cachedReportNodes = list;
        setDbReports(list);
      })
      .catch(() => {
        // Keep the cached list on a transient failure rather than blanking it.
      });
    return () => {
      alive = false;
    };
  }, []);

  const branchOptions: BranchOption[] = useMemo(
    () =>
      (selectedCompany?.branches ?? []).map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
      })),
    [selectedCompany?.branches],
  );

  // Default the Branch filter to the sidebar branch; only fills when empty so
  // changing it here still works.
  useEffect(() => {
    if (selectedBranch) return;
    const sidebarId = selectedBranches[0];
    if (sidebarId == null) return;
    const match = branchOptions.find((b) => b.branch_id === sidebarId);
    if (match) setSelectedBranch(match);
  }, [selectedBranch, selectedBranches, branchOptions]);

  const handleReportChange = useCallback(
    (node: ReportMenuNode | null) => {
      setSelectedReport(node);
      if (!node?.menu_path) return;
      const params = new URLSearchParams();
      if (selectedBranch) {
        params.set("branch_id", String(selectedBranch.branch_id));
      }
      if (reportDate) params.set("date", reportDate);
      router.push(`/dashboardportal/${node.menu_path}?${params.toString()}`);
    },
    [router, selectedBranch, reportDate],
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        sx={{ color: tokens.report.header, fontWeight: "bold", mb: 2 }}
      >
        Jute Mechanical &amp; Maintenance Reports
      </Typography>

      {mounted && (
        <Paper elevation={1} sx={{ mb: 3 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              p: 2,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ minWidth: 300 }}>
              <SearchableSelect<ReportMenuNode>
                variant="outlined"
                label="Report"
                size="small"
                options={dbReports}
                value={selectedReport}
                onChange={handleReportChange}
                getOptionLabel={(option) => option.menu_name}
                getOptionKey={(option) => option.menu_id}
                isOptionEqualToValue={(option, value) =>
                  option.menu_id === value.menu_id
                }
              />
            </Box>

            <Box sx={{ minWidth: 240 }}>
              <SearchableSelect<BranchOption>
                variant="outlined"
                label="Branch"
                size="small"
                required
                options={branchOptions}
                value={selectedBranch}
                onChange={(option) => setSelectedBranch(option)}
                getOptionLabel={(option) => option.branch_name}
                getOptionKey={(option) => option.branch_id}
                isOptionEqualToValue={(option, value) =>
                  option.branch_id === value.branch_id
                }
              />
            </Box>

            <TextField
              type="date"
              label="Report Date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 180 }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
}
