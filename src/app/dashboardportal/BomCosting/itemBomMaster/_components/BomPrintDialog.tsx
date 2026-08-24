"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
} from "@mui/material";
import { Printer } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { BomPrintOptions } from "./bomPrintRender";

/** Option shape for the searchable "print up to level" dropdown. */
type DepthOption = { value: number | "all"; label: string };

type BomPrintDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (opts: BomPrintOptions) => void;
  itemLabel: string;
  maxDepth: number;
};

export default function BomPrintDialog({
  open,
  onClose,
  onConfirm,
  itemLabel,
  maxDepth,
}: BomPrintDialogProps) {
  const [depth, setDepth] = useState<number | "all">(1);
  const [includeQtyUom, setIncludeQtyUom] = useState(true);
  const [includeSequence, setIncludeSequence] = useState(false);

  useEffect(() => {
    if (open) {
      setDepth(1);
      setIncludeQtyUom(true);
      setIncludeSequence(false);
    }
  }, [open]);

  const depthOptions = useMemo<DepthOption[]>(
    () => [
      { value: "all", label: "All levels" },
      ...Array.from({ length: Math.max(1, maxDepth) }, (_, i) => i + 1).map(
        (n) => ({
          value: n,
          label: `Level ${n}${n === 1 ? " (top components only)" : ""}`,
        })
      ),
    ],
    [maxDepth]
  );

  const handlePrint = () => {
    onConfirm({ depth, includeQtyUom, includeSequence });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Print BOM
        {itemLabel ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {itemLabel}
          </Typography>
        ) : null}
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <SearchableSelect<DepthOption>
            variant="outlined"
            label="Print up to level"
            options={depthOptions}
            value={depthOptions.find((o) => o.value === depth) ?? null}
            onChange={(option) => {
              if (option) setDepth(option.value);
            }}
            getOptionLabel={(o) => o.label}
            getOptionKey={(o) => String(o.value)}
            isOptionEqualToValue={(o, v) => o.value === v.value}
            clearable={false}
          />

          <Box>
            <Typography variant="caption" color="text.secondary">
              Columns
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", pl: 0.5 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={includeQtyUom}
                    onChange={(e) => setIncludeQtyUom(e.target.checked)}
                  />
                }
                label="Include Qty, BOM Qty & UOM"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={includeSequence}
                    onChange={(e) => setIncludeSequence(e.target.checked)}
                  />
                }
                label="Include Sequence No"
              />
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<Printer size={16} />}
          onClick={handlePrint}
        >
          Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}
