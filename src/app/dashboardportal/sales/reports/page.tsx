"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Box, Paper, Typography } from "@mui/material";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import SalesOrderListReport from "./_components/SalesOrderListReport";
import InvoiceListReport from "./_components/InvoiceListReport";
import type { BranchOption, ReportKey } from "./types/reportTypes";

interface ReportOption {
  value: ReportKey;
  label: string;
}

/** Reports available on this hub, in display order. */
const REPORT_OPTIONS: ReadonlyArray<ReportOption> = Object.freeze([
  { value: "salesOrders", label: "List of Sales Orders" },
  { value: "invoices", label: "List of Invoices" },
]);

export default function SalesReportsPage() {
  // Hydration safety: defer rendering until mounted because useSidebarContext
  // resolves co_id from a context value that differs between SSR and client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { selectedCompany } = useSidebarContext();
  const [selectedReport, setSelectedReport] = useState<ReportKey>("salesOrders");

  const branchOptions: BranchOption[] = useMemo(
    () =>
      (selectedCompany?.branches ?? []).map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
      })),
    [selectedCompany?.branches],
  );

  const selectedReportOption = useMemo(
    () => REPORT_OPTIONS.find((option) => option.value === selectedReport) ?? null,
    [selectedReport],
  );

  const handleReportChange = useCallback((option: ReportOption | null) => {
    if (option) setSelectedReport(option.value);
  }, []);

  if (!mounted) return null;

  const coId = selectedCompany?.co_id ?? null;

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        sx={{ color: "text.primary", fontWeight: "bold", mb: 2 }}
      >
        Sales Reports
      </Typography>

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
          <Box sx={{ minWidth: 240 }}>
            <SearchableSelect<ReportOption>
              variant="outlined"
              label="Report"
              options={[...REPORT_OPTIONS]}
              value={selectedReportOption}
              onChange={handleReportChange}
              getOptionLabel={(option) => option.label}
              getOptionKey={(option) => option.value}
              isOptionEqualToValue={(option, selected) => option.value === selected.value}
              clearable={false}
            />
          </Box>
        </Box>
      </Paper>

      {selectedReport === "salesOrders" && (
        <SalesOrderListReport coId={coId} branches={branchOptions} />
      )}
      {selectedReport === "invoices" && (
        <InvoiceListReport coId={coId} branches={branchOptions} />
      )}
    </Box>
  );
}
