"use client";

import * as React from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";
import type { CalcField } from "../types/productionPlanningTypes";

/**
 * Shared compact-grid building blocks for the Production Planning sections.
 * All colors come from theme palette keys — never hardcoded.
 */

export type NumCellProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  width?: number;
  /** Visually flags a manual override (auto=false CalcField). */
  manual?: boolean;
  helper?: string;
};

/** Small right-aligned numeric input for grid cells. */
export function NumCell({ value, onChange, disabled, width = 74, manual = false, helper }: NumCellProps) {
  // Draft holds the raw text while the user is typing. A controlled
  // type="number" input bound directly to the parsed number destroys
  // in-progress entries ("82." sanitizes to "", which would commit 0 and
  // rewrite the DOM), so we only push parseable values up and never let a
  // parent re-render clobber the edit buffer mid-keystroke.
  const [draft, setDraft] = React.useState<string | null>(null);
  const display = draft ?? (Number.isFinite(value) ? String(value) : "0");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
      <TextField
        type="number"
        size="small"
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw === "") return; // sanitized intermediate state ("82.") — keep last committed value
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed !== value) onChange(parsed);
        }}
        onBlur={() => setDraft(null)}
        disabled={disabled}
        inputProps={{
          step: "any",
          style: { textAlign: "right", padding: "3px 6px", fontSize: "0.75rem" },
        }}
        sx={{
          width,
          "& .MuiOutlinedInput-root": {
            bgcolor: manual ? "action.selected" : "background.paper",
          },
        }}
      />
      {helper ? (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.62rem", textAlign: "right" }}>
          {helper}
        </Typography>
      ) : null}
    </Box>
  );
}

export type CalcCellProps = Omit<NumCellProps, "value" | "manual"> & {
  field: CalcField;
};

/** Numeric input bound to a CalcField — highlights when manually overridden. */
export function CalcCell({ field, ...rest }: CalcCellProps) {
  return <NumCell value={field.value} manual={!field.auto} {...rest} />;
}

export type TextCellProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  width?: number;
  placeholder?: string;
};

/** Small free-text input for grid cells (descriptions, remarks). */
export function TextCell({ value, onChange, disabled, width = 130, placeholder }: TextCellProps) {
  return (
    <TextField
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      inputProps={{ style: { padding: "3px 6px", fontSize: "0.75rem" } }}
      sx={{ width, "& .MuiOutlinedInput-root": { bgcolor: "background.paper" } }}
    />
  );
}

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onRecalculate: () => void;
  children?: React.ReactNode;
};

/** Section title row with the per-section "Recalculate" (reset-to-auto) button. */
export function SectionHeader({ title, subtitle, disabled, onRecalculate, children }: SectionHeaderProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      ) : null}
      <Box sx={{ flexGrow: 1 }} />
      {children}
      <Button
        size="small"
        variant="outlined"
        startIcon={<RefreshCw size={14} />}
        onClick={onRecalculate}
        disabled={disabled}
      >
        Recalculate
      </Button>
    </Box>
  );
}

/** Consistent compact-table styling for all three section grids. */
export const compactTableSx = {
  minWidth: 900,
  borderCollapse: "collapse",
  "& th, & td": {
    border: "1px solid",
    borderColor: "divider",
    p: 0.4,
    fontSize: "0.72rem",
    whiteSpace: "nowrap",
    textAlign: "center",
    verticalAlign: "top",
  },
  "& th": {
    bgcolor: "action.hover",
    fontWeight: 600,
  },
} as const;
