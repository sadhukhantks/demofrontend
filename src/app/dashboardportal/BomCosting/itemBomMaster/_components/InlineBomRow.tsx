"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Check, X } from "lucide-react";
import { ItemOption, UomOption, getCoId } from "./types";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";

export type InlineBomRowProps = {
  /** 0-based grid level for indentation */
  level: number;
  gridColumns: string;
  nextSeq: number;
  parentItemId: number;
  parentMultiplier: number;
  itemOptions: ItemOption[];
  uomOptions: UomOption[];
  onItemSearchChange: (query: string) => void;
  onSave: (
    parentItemId: number,
    payload: { child_item_id: number; qty: number; uom_id: number; sequence_no: number; co_id: number }
  ) => Promise<void>;
  onCancel: () => void;
};

export default function InlineBomRow({
  level,
  gridColumns,
  nextSeq,
  parentItemId,
  parentMultiplier,
  itemOptions,
  uomOptions,
  onItemSearchChange,
  onSave,
  onCancel,
}: InlineBomRowProps) {
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [itemInputValue, setItemInputValue] = useState("");
  const [qty, setQty] = useState<string>("1");
  const [selectedUom, setSelectedUom] = useState<UomOption | null>(null);
  const [saving, setSaving] = useState(false);

  // Field-level validation errors
  const [itemError, setItemError] = useState(false);
  const [qtyError, setQtyError] = useState(false);
  const [uomError, setUomError] = useState(false);

  const itemRef = useRef<HTMLInputElement>(null);

  // Auto-focus the item field when this row mounts
  useEffect(() => {
    const timeout = setTimeout(() => itemRef.current?.focus(), 50);
    return () => clearTimeout(timeout);
  }, []);

  const resetRow = () => {
    setSelectedItem(null);
    setItemInputValue("");
    setQty("1");
    setSelectedUom(null);
    setItemError(false);
    setQtyError(false);
    setUomError(false);
  };

  const handleSave = async () => {
    let valid = true;
    if (!selectedItem) { setItemError(true); valid = false; }
    const parsedQty = parseFloat(qty);
    if (!qty || isNaN(parsedQty) || parsedQty <= 0) { setQtyError(true); valid = false; }
    if (!selectedUom) { setUomError(true); valid = false; }
    if (!valid) return;

    setSaving(true);
    try {
      const co_id = parseInt(getCoId());
      await onSave(parentItemId, {
        child_item_id: selectedItem!.item_id,
        qty: parsedQty,
        uom_id: selectedUom!.uom_id,
        sequence_no: nextSeq,
        co_id,
      });
      // Auto-spawn: reset fields but keep the row open (parent controls whether row stays)
      resetRow();
      setTimeout(() => itemRef.current?.focus(), 50);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  };

  const bomQtyPreview = !qty || isNaN(parseFloat(qty)) ? 0 : parseFloat(qty) * parentMultiplier;

  return (
    <Box
      onKeyDown={handleKeyDown}
      sx={{
        display: "grid",
        gridTemplateColumns: gridColumns,
        alignItems: "center",
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "action.selected",
      }}
    >
      {/* Seq — auto-computed, read-only */}
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 0.5, borderRight: "1px solid", borderColor: "divider" }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {nextSeq}
        </Typography>
      </Box>

      {/* Item autocomplete — spans Item Code + Item Name columns */}
      <Box sx={{ gridColumn: "span 2", pl: level * 3 + 1, pr: 1, py: 0.5, borderRight: "1px solid", borderColor: "divider" }}>
        <Autocomplete
          size="small"
          options={itemOptions}
          getOptionLabel={(opt) => `${opt.full_item_code || opt.item_code} — ${opt.item_name}`}
          value={selectedItem}
          inputValue={itemInputValue}
          onChange={(_, newValue) => {
            setSelectedItem(newValue);
            setItemError(false);
            if (newValue?.uom_id && newValue?.uom_name) {
              setSelectedUom({ uom_id: newValue.uom_id, uom_name: newValue.uom_name });
              setUomError(false);
            }
          }}
          onInputChange={(_, value, reason) => {
            if (reason !== "reset") {
              setItemInputValue(value);
              onItemSearchChange(value);
            }
          }}
          isOptionEqualToValue={(opt, val) => opt.item_id === val.item_id}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={itemRef}
              placeholder="Search item…"
              size="small"
              error={itemError}
              helperText={itemError ? "Required" : undefined}
            />
          )}
        />
      </Box>

      {/* Qty */}
      <Box sx={{ px: 1, py: 0.5, borderRight: "1px solid", borderColor: "divider" }}>
        <TextField
          size="small"
          type="number"
          value={qty}
          onChange={(e) => { setQty(e.target.value); setQtyError(false); }}
          error={qtyError}
          helperText={qtyError ? "> 0" : undefined}
          inputProps={{ min: 0, step: "any", style: { textAlign: "right" } }}
          sx={{ width: "100%" }}
        />
      </Box>

      {/* BOM Qty preview */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", px: 1, py: 0.5, borderRight: "1px solid", borderColor: "divider" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {bomQtyPreview > 0 ? Math.round(bomQtyPreview * 1000) / 1000 : ""}
        </Typography>
      </Box>

      {/* UOM autocomplete */}
      <Box sx={{ px: 1, py: 0.5, borderRight: "1px solid", borderColor: "divider" }}>
        <Autocomplete
          size="small"
          options={uomOptions}
          getOptionLabel={(opt) => opt.uom_name}
          value={selectedUom}
          onChange={(_, newValue) => { setSelectedUom(newValue); setUomError(false); }}
          isOptionEqualToValue={(opt, val) => opt.uom_id === val.uom_id}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="UOM…"
              size="small"
              error={uomError}
              helperText={uomError ? "Required" : undefined}
            />
          )}
        />
      </Box>

      {/* Actions */}
      <Box sx={{ display: "flex", justifyContent: "center", gap: 0.25, py: 0.5 }}>
        <Tooltip title="Save (Enter)">
          <span>
            <IconButton size="small" color="primary" onClick={handleSave} disabled={saving}>
              <Check size={14} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Cancel (Esc)">
          <IconButton size="small" onClick={onCancel} disabled={saving}>
            <X size={14} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
