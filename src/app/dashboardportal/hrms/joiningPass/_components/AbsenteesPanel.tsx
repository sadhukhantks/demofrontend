"use client";

/**
 * Workers who would need a joining pass if they came on the as-on date:
 * absent more than the threshold in working days (holidays / non-working days
 * skipped), last seen within the rule's look-back. "Check" opens the worker on
 * the Check & issue tab with that joining date.
 */

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { fetchJpAbsentees, type JpAbsentee, type JpSetup } from "@/utils/joiningPassService";
import { fmtDate } from "../_utils";

interface AbsenteesPanelProps {
  coId: number;
  branchId: number;
  setup: JpSetup;
  onCheck: (empCode: string, joinDate: string) => void;
}

export default function AbsenteesPanel({ coId, branchId, setup, onCheck }: AbsenteesPanelProps) {
  const [asOn, setAsOn] = React.useState(setup.today);
  const [deptId, setDeptId] = React.useState<number | "">("");
  const [rows, setRows] = React.useState<JpAbsentee[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchJpAbsentees(coId, branchId, asOn || null, deptId === "" ? null : deptId)
      .then((res) => {
        if (alive) setRows(res.rows);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [coId, branchId, asOn, deptId]);

  const deptOptions = React.useMemo(
    () => setup.depts.map((d) => ({ value: d.dept_id, label: d.dept_desc ?? String(d.dept_id) })),
    [setup.depts],
  );

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.emp_code ?? ""} ${r.emp_name ?? ""}`.toLowerCase().includes(q));
  }, [rows, search]);

  const pending = shown.filter((r) => r.joining_pass_id == null).length;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          label="As on (joining) date"
          type="date"
          size="small"
          value={asOn}
          onChange={(e) => setAsOn(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: { xs: "100%", sm: 190 } }}
        />
        <SearchableOptionSelect<number>
          label="Department"
          placeholder="All departments"
          options={deptOptions}
          value={deptId}
          onChange={setDeptId}
          size="small"
          sx={{ width: { xs: "100%", sm: 240 } }}
        />
        <TextField
          label="EB No / name"
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: "100%", sm: 200 } }}
        />
        <Typography variant="body2" color="text.secondary">
          {loading ? "Loading…" : `${shown.length} workers absent > ${setup.rule.min_absent_days} working days · ${pending} without a pass`}
        </Typography>
      </Paper>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>EB No</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Designation</TableCell>
                <TableCell>Last seen</TableCell>
                <TableCell>Absent from</TableCell>
                <TableCell align="right">Working days</TableCell>
                <TableCell>Pass</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography variant="body2" color="text.secondary">
                      Nobody absent above the threshold.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((r) => (
                  <TableRow key={r.eb_id} hover>
                    <TableCell>{r.emp_code}</TableCell>
                    <TableCell>{r.emp_name}</TableCell>
                    <TableCell>{r.dept_desc}</TableCell>
                    <TableCell>{r.designation}</TableCell>
                    <TableCell>{fmtDate(r.last_seen_date)}</TableCell>
                    <TableCell>{fmtDate(r.absent_from)}</TableCell>
                    <TableCell align="right">
                      {r.absent_working_days}
                      <Typography component="span" variant="caption" color="text.secondary">
                        {" "}
                        / {r.absent_calendar_days}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {r.pass_no ? (
                        <Chip size="small" color="success" variant="outlined" label={`${r.pass_no} · w.e.f. ${fmtDate(r.pass_join_date)}`} />
                      ) : (
                        <Chip size="small" color="warning" variant="outlined" label="Pass needed" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="small" disabled={!r.emp_code} onClick={() => r.emp_code && onCheck(r.emp_code, asOn)}>
                        Check
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
