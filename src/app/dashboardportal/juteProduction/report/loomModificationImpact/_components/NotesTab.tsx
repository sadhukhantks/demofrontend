"use client";

/**
 * Section G: the server-generated notes (data source, coverage gaps, why a
 * verdict was withheld, standard / weaver changes, data holes, control
 * drops), the evidence pairs, the flag legend and the thresholds in force.
 */

import React from "react";
import { Alert, Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { ImpactEvidence, ImpactMeta } from "../_service";
import { flagLegend, thresholdRows } from "../impactRows";

export function NotesAlert({ notes }: { notes: string[] }) {
  return (
    <Alert severity="info" data-testid="notes-alert">
      {notes.length ? (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </Box>
      ) : (
        "No notes from the server for this run."
      )}
    </Alert>
  );
}

export default function NotesTab({
  meta,
  evidence,
}: {
  meta: ImpactMeta | null;
  evidence: ImpactEvidence[];
}) {
  const legend = flagLegend(meta);
  const thresholds = thresholdRows(meta?.thresholds);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <NotesAlert notes={meta?.notes ?? []} />

      {evidence.length ? (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Evidence
          </Typography>
          <Table size="small" sx={{ maxWidth: 640 }}>
            <TableBody>
              {evidence.map((e, i) => (
                <TableRow key={i}>
                  <TableCell>{e.label}</TableCell>
                  <TableCell align="right">{e.value == null ? "—" : String(e.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : null}

      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Flags
        </Typography>
        <Table size="small" sx={{ maxWidth: 640 }}>
          <TableBody>
            {legend.map((l) => (
              <TableRow key={l.flag}>
                <TableCell sx={{ fontWeight: 700, width: 40 }}>{l.flag}</TableCell>
                <TableCell>{l.text}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {thresholds.length ? (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Thresholds in force
          </Typography>
          <Table size="small" sx={{ maxWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Constant</TableCell>
                <TableCell>Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {thresholds.map((t) => (
                <TableRow key={t.row_id}>
                  <TableCell>{t.key}</TableCell>
                  <TableCell>{t.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : null}
      {meta?.server_ms != null ? (
        <Typography variant="caption" color="text.secondary">
          Server time {meta.server_ms} ms
        </Typography>
      ) : null}
    </Box>
  );
}
