"use client";

/**
 * Exceptions strip of the Purchased Yarn Ledger: one Alert per exception,
 * ordered by severity (red, then amber, then blue). Presentational only.
 */

import React from "react";
import { Alert, Stack } from "@mui/material";
import type { LedgerException } from "../_service";
import { groupExceptions, labelOf } from "../ledgerRows";

export interface ExceptionsStripProps {
  exceptions: readonly LedgerException[];
}

export function ExceptionsStrip({ exceptions }: ExceptionsStripProps) {
  const groups = groupExceptions(exceptions);
  if (groups.length === 0) return null;
  return (
    <Stack spacing={1} data-testid="ledger-exceptions">
      {groups.map((g) =>
        g.items.map((e, i) => (
          <Alert
            key={`${g.severity}-${e.code}-${e.item_id ?? "x"}-${e.dept_id ?? "x"}-${i}`}
            severity={g.severity}
            sx={{ py: 0.25 }}
          >
            <strong>{labelOf(e.code)}:</strong> {e.message}
          </Alert>
        )),
      )}
    </Stack>
  );
}
