"use client";

import * as React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { reportConfig, ReportKey, reportOrder } from "./_components/reportConfig";

interface ReportOption {
  value: ReportKey;
  label: string;
}

export default function ProcurementReportsHub() {
  const [mounted, setMounted] = React.useState(false);
  const [selected, setSelected] = React.useState<ReportKey>("all-indent-itemwise");

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const reportOptions = React.useMemo<ReportOption[]>(
    () => reportOrder.map(k => ({ value: k, label: reportConfig[k].label })),
    [],
  );

  const selectedOption = React.useMemo(
    () => reportOptions.find(option => option.value === selected) ?? null,
    [reportOptions, selected],
  );

  const handleChange = React.useCallback((option: ReportOption | null) => {
    if (option) setSelected(option.value);
  }, []);

  if (!mounted) return null;

  const ActiveReport = reportConfig[selected].component;

  return (
    <Box className="min-h-screen bg-gray-50 p-8">
      <Box className="mx-auto max-w-7xl">
        <Box className="mb-6 flex flex-col gap-2">
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            Procurement Reports
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Operational reports across indents, POs, and SRs
          </Typography>
        </Box>

        <Paper sx={{ mb: 2 }}>
          <Box sx={{ p: 2, display: "flex", gap: 2, alignItems: "center" }}>
            <Typography variant="body2" fontWeight={600}>
              Report:
            </Typography>
            <Box sx={{ minWidth: 380 }}>
              <SearchableSelect<ReportOption>
                variant="outlined"
                options={reportOptions}
                value={selectedOption}
                onChange={handleChange}
                getOptionLabel={option => option.label}
                getOptionKey={option => option.value}
                isOptionEqualToValue={(option, value) => option.value === value.value}
                clearable={false}
                placeholder="Search reports"
              />
            </Box>
          </Box>
        </Paper>

        <Paper>
          <ActiveReport />
        </Paper>
      </Box>
    </Box>
  );
}
