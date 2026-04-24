"use client";
import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Autocomplete,
  Paper,
  Typography,
} from "@mui/material";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import JuteStockReport from "./_components/JuteStockReport";
import BatchCostReport from "./_components/BatchCostReport";
import MrListReport from "./_components/MrListReport";
import type { BranchOption } from "./types/reportTypes";

type ReportKey = "stock" | "batch" | "mrList";

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export default function JuteReportsPage() {
  const { selectedCompany } = useSidebarContext();
  const [selectedReport, setSelectedReport] = useState<ReportKey>("stock");
  const [selectedBranch, setSelectedBranch] = useState<BranchOption | null>(
    null,
  );
  const [reportDate, setReportDate] = useState<string>(getYesterdayDate());

  // Get branch options from sidebar context
  const branchOptions: BranchOption[] = useMemo(
    () =>
      (selectedCompany?.branches ?? []).map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
      })),
    [selectedCompany?.branches],
  );

  const handleReportChange = useCallback(
    (e: SelectChangeEvent<ReportKey>) => {
      setSelectedReport(e.target.value as ReportKey);
    },
    [],
  );

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setReportDate(e.target.value);
    },
    [],
  );

  const showDateBranchFilters = selectedReport !== "mrList";

  return (
    <Box sx={{ p: 3 }}>
      <Typography
        variant="h5"
        sx={{ color: "#0C3C60", fontWeight: "bold", mb: 2 }}
      >
        Jute Procurement Reports
      </Typography>

      <Paper elevation={1} sx={{ mb: 3 }}>
        {/* Filters toolbar */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            p: 2,
            flexWrap: "wrap",
          }}
        >
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="jute-report-select-label">Report</InputLabel>
            <Select<ReportKey>
              labelId="jute-report-select-label"
              label="Report"
              value={selectedReport}
              onChange={handleReportChange}
            >
              <MenuItem value="stock">Jute Stock Report</MenuItem>
              <MenuItem value="batch">Batch Cost Report</MenuItem>
              <MenuItem value="mrList">MR List</MenuItem>
            </Select>
          </FormControl>

          {showDateBranchFilters && (
            <>
              <Autocomplete
                options={branchOptions}
                getOptionLabel={(option) => option.branch_name}
                isOptionEqualToValue={(option, value) =>
                  option.branch_id === value.branch_id
                }
                value={selectedBranch}
                onChange={(_, newValue) => setSelectedBranch(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Branch"
                    size="small"
                    required
                  />
                )}
                sx={{ minWidth: 240 }}
              />
              <TextField
                type="date"
                label="Report Date"
                value={reportDate}
                onChange={handleDateChange}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 180 }}
              />
            </>
          )}
        </Box>
      </Paper>

      {/* Report content */}
      {selectedReport === "stock" && (
        <JuteStockReport
          branchId={selectedBranch?.branch_id ?? null}
          date={reportDate}
        />
      )}
      {selectedReport === "batch" && (
        <BatchCostReport
          branchId={selectedBranch?.branch_id ?? null}
          date={reportDate}
        />
      )}
      {selectedReport === "mrList" && (
        <MrListReport
          coId={selectedCompany?.co_id ?? null}
          branches={branchOptions}
        />
      )}
    </Box>
  );
}
