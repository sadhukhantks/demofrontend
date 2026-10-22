"use client";

/**
 * The parameter rows that priced the range — one line per row actually
 * picked on at least one day (a change mid-range lists both rows with the
 * days each covered). Desktop: a small table; phone: one card per row.
 */

import React from "react";
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { SectionCard } from "../../../../juteProduction/report/dailyProductionReport/_components/DprPieces";
import type { ParamUsed } from "../_service";
import { fmtParam } from "../dayColumns";

const scopeText = (p: ParamUsed): string => (p.scope === "branch" ? "Branch" : "All branches");
/** The label comes with the row (backend catalogue); the code is the fallback. */
const label = (p: ParamUsed): string => p.param_label || p.param_code;
const title = (p: ParamUsed): string => `${label(p)}${p.product ? ` · ${p.product}` : ""}`;
/** "days, capital" — where the row priced something; "" on a backend that does not say. */
const usedIn = (p: ParamUsed): string => (p.used_in ?? []).join(", ");

export default function ParamsPanel({ params, isPhone }: { params: ParamUsed[]; isPhone: boolean }) {
  if (params.length === 0) {
    return (
      <SectionCard title="Parameters used">
        <Typography variant="body2" color="text.secondary">
          No cost parameter was in force on any day of this range — key them on the Cost
          Parameters page.
        </Typography>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Parameters used"
      subtitle="the rows in force on the days of the range; a change mid-range lists both rows"
    >
      {isPhone ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {params.map((p) => (
            <Paper key={p.cost_param_id} variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {title(p)}
              </Typography>
              <Typography variant="body1">
                {fmtParam(p.value)} {p.uom ?? ""}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                from {p.effective_date ?? "—"} · {scopeText(p)} · {p.days_used} day{p.days_used === 1 ? "" : "s"}
                {p.source ? ` · ${p.source}` : ""}
                {usedIn(p) ? ` · used in ${usedIn(p)}` : ""}
              </Typography>
            </Paper>
          ))}
        </Box>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table
            size="small"
            sx={{
              "& th": { fontWeight: 700, whiteSpace: "nowrap", bgcolor: "action.hover", py: 0.5 },
              "& td": { py: 0.4, whiteSpace: "nowrap" },
              "@media print": { "& td, & th": { whiteSpace: "normal" } },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell>Parameter</TableCell>
                <TableCell>Product</TableCell>
                <TableCell align="right">Value</TableCell>
                <TableCell>UoM</TableCell>
                <TableCell>Effective from</TableCell>
                <TableCell>Scope</TableCell>
                <TableCell>Source</TableCell>
                <TableCell align="right">Days used</TableCell>
                <TableCell>Used in</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {params.map((p) => (
                <TableRow key={p.cost_param_id}>
                  <TableCell>{label(p)}</TableCell>
                  <TableCell>{p.product ?? "All"}</TableCell>
                  <TableCell align="right">{fmtParam(p.value)}</TableCell>
                  <TableCell>{p.uom ?? ""}</TableCell>
                  <TableCell>{p.effective_date ?? "—"}</TableCell>
                  <TableCell>{scopeText(p)}</TableCell>
                  <TableCell>{p.source ?? ""}</TableCell>
                  <TableCell align="right">{p.days_used}</TableCell>
                  <TableCell>{usedIn(p)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </SectionCard>
  );
}
