"use client";

/**
 * What the range could not price and why — one line per missing input, in
 * the backend's order (power first, then the parameters, then the items
 * phase 1 does not capture). Nothing when everything was keyed.
 */

import React from "react";
import { Alert, AlertTitle } from "@mui/material";
import type { NotKeyed } from "../_service";

export default function NotKeyedPanel({ items }: { items: NotKeyed[] }) {
  if (items.length === 0) return null;
  return (
    <Alert severity="warning" sx={{ "& ul": { m: 0, pl: 2.5 } }}>
      <AlertTitle>Not keyed</AlertTitle>
      <ul>
        {items.map((item) => (
          <li key={item.key}>{item.reason}</li>
        ))}
      </ul>
    </Alert>
  );
}
