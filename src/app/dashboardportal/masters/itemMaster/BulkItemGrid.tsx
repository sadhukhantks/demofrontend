"use client";
import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Checkbox,
  IconButton,
  Tooltip,
  Box,
  Button,
} from "@mui/material";
import { Trash as DeleteIcon, Plus as AddIcon } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

export type BulkRow = {
  rowKey: string;
  itemGroupId: number | null;
  itemGroupText: string;
  itemCode: string;
  itemName: string;
  uomId: number | null;
  uomText: string;
  hsnCode: string;
  taxPercent: string;
  uomRounding: string;
  rateRounding: string;
  goodOrService: "Good" | "Service" | "";
  saleable: boolean;
  consumable: boolean;
  purchaseable: boolean;
  manufacturable: boolean;
  assembly: boolean;
  errors: Record<string, string>;
};

export type GroupOption = { item_grp_id: number; label: string; code: string };
export type UomOption = { uom_id: number; label: string };

/** Good/Service dropdown option. Clearing the field restores the empty value. */
type GoodOrServiceOption = { value: Exclude<BulkRow["goodOrService"], "">; label: string };

const GOOD_OR_SERVICE_OPTIONS: GoodOrServiceOption[] = [
  { value: "Good", label: "Good" },
  { value: "Service", label: "Service" },
];

const groupOptionLabel = (g: GroupOption) => `${g.label}${g.code ? ` (${g.code})` : ""}`;

type Props = {
  rows: BulkRow[];
  onRowsChange: (rows: BulkRow[]) => void;
  groups: GroupOption[];
  uoms: UomOption[];
  disabled?: boolean;
};

const COLUMNS: Array<{
  key: keyof BulkRow | "_actions";
  label: string;
  width?: number;
  errorField?: string;
}> = [
  { key: "itemGroupId", label: "Group *", width: 180, errorField: "itemGroupId" },
  { key: "itemCode", label: "Code *", width: 130, errorField: "itemCode" },
  { key: "itemName", label: "Name *", width: 200, errorField: "itemName" },
  { key: "uomId", label: "UOM *", width: 140, errorField: "uomId" },
  { key: "hsnCode", label: "HSN", width: 110, errorField: "hsnCode" },
  { key: "taxPercent", label: "Tax %", width: 80, errorField: "taxPercent" },
  { key: "goodOrService", label: "G/S", width: 90 },
  { key: "uomRounding", label: "UOM Rnd", width: 80 },
  { key: "rateRounding", label: "Rate Rnd", width: 80 },
  { key: "saleable", label: "Sale", width: 60 },
  { key: "consumable", label: "Cons", width: 60 },
  { key: "purchaseable", label: "Purch", width: 60 },
  { key: "manufacturable", label: "Mfg", width: 60 },
  { key: "assembly", label: "Asm", width: 60 },
  { key: "_actions", label: "", width: 50 },
];

export const makeBlankRow = (): BulkRow => ({
  rowKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  itemGroupId: null,
  itemGroupText: "",
  itemCode: "",
  itemName: "",
  uomId: null,
  uomText: "",
  hsnCode: "",
  taxPercent: "",
  uomRounding: "",
  rateRounding: "",
  goodOrService: "",
  saleable: false,
  consumable: false,
  purchaseable: false,
  manufacturable: false,
  assembly: false,
  errors: {},
});

export const isRowEmpty = (r: BulkRow): boolean =>
  !r.itemGroupId && !r.itemGroupText && !r.itemCode && !r.itemName && !r.uomId && !r.uomText && !r.hsnCode && !r.taxPercent;

const resolveGroup = (text: string, groups: GroupOption[]): number | null => {
  const t = text.trim();
  if (!t) return null;
  const exact = groups.find(g => g.label === t || g.code === t);
  if (exact) return exact.item_grp_id;
  const ci = groups.find(
    g => g.label.toLowerCase() === t.toLowerCase() || g.code.toLowerCase() === t.toLowerCase()
  );
  return ci ? ci.item_grp_id : null;
};

const resolveUom = (text: string, uoms: UomOption[]): number | null => {
  const t = text.trim();
  if (!t) return null;
  const exact = uoms.find(u => u.label === t);
  if (exact) return exact.uom_id;
  const ci = uoms.find(u => u.label.toLowerCase() === t.toLowerCase());
  return ci ? ci.uom_id : null;
};

const COLUMN_HEADERS_LOWER = COLUMNS.filter(c => c.key !== "_actions").map(c =>
  c.label.replace(/\s*\*$/, "").trim().toLowerCase()
);

const looksLikeHeaderRow = (cells: string[]): boolean => {
  if (cells.length === 0) return false;
  const matches = cells.filter(c => COLUMN_HEADERS_LOWER.includes(c.trim().toLowerCase())).length;
  return matches >= Math.max(2, Math.floor(cells.length / 2));
};

const truthyText = (s: string): boolean => {
  const t = s.trim().toLowerCase();
  return t === "y" || t === "yes" || t === "true" || t === "1";
};

const BulkItemGrid: React.FC<Props> = ({ rows, onRowsChange, groups, uoms, disabled }) => {
  const [anchor, setAnchor] = React.useState<{ rowIdx: number; colIdx: number }>({ rowIdx: 0, colIdx: 0 });

  const updateRow = (idx: number, patch: Partial<BulkRow>) => {
    const next = rows.slice();
    const merged: BulkRow = { ...next[idx], ...patch };
    Object.keys(patch).forEach(k => {
      if (k !== "errors" && merged.errors[k]) {
        const newErrors = { ...merged.errors };
        delete newErrors[k];
        merged.errors = newErrors;
      }
    });
    next[idx] = merged;
    onRowsChange(next);
  };

  const handleAddRow = () => onRowsChange([...rows, makeBlankRow()]);

  const handleDeleteRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    onRowsChange(next.length ? next : [makeBlankRow()]);
  };

  const applyPaste = (raw: string, anchorRow: number, anchorCol: number) => {
    if (!raw) return;
    const dataCols = COLUMNS.filter(c => c.key !== "_actions");
    let lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (!lines.length) return;
    const firstCells = lines[0].split("\t");
    if (looksLikeHeaderRow(firstCells)) lines = lines.slice(1);
    if (!lines.length) return;

    const next = rows.slice();
    while (next.length < anchorRow + lines.length) next.push(makeBlankRow());

    lines.forEach((line, i) => {
      const cells = line.split("\t");
      const targetRowIdx = anchorRow + i;
      const target: BulkRow = { ...next[targetRowIdx], errors: { ...next[targetRowIdx].errors } };

      cells.forEach((rawCell, j) => {
        const colIdx = anchorCol + j;
        if (colIdx >= dataCols.length) return;
        const col = dataCols[colIdx];
        const cellVal = rawCell.trim();
        const k = col.key as keyof BulkRow;

        switch (k) {
          case "itemGroupId": {
            const id = resolveGroup(cellVal, groups);
            target.itemGroupId = id;
            target.itemGroupText = id === null && cellVal ? cellVal : "";
            if (col.errorField) delete target.errors[col.errorField];
            break;
          }
          case "uomId": {
            const id = resolveUom(cellVal, uoms);
            target.uomId = id;
            target.uomText = id === null && cellVal ? cellVal : "";
            if (col.errorField) delete target.errors[col.errorField];
            break;
          }
          case "saleable":
          case "consumable":
          case "purchaseable":
          case "manufacturable":
          case "assembly":
            target[k] = truthyText(cellVal);
            break;
          case "goodOrService": {
            const v = cellVal.toLowerCase();
            target.goodOrService = v.startsWith("g") ? "Good" : v.startsWith("s") ? "Service" : "";
            break;
          }
          default:
            (target as any)[k] = cellVal;
            if (col.errorField) delete target.errors[col.errorField];
        }
      });

      next[targetRowIdx] = target;
    });

    onRowsChange(next);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const raw = e.clipboardData.getData("text/plain");
    if (!raw) return;
    if (raw.indexOf("\t") < 0 && raw.indexOf("\n") < 0) return;
    e.preventDefault();
    applyPaste(raw, anchor.rowIdx, anchor.colIdx);
  };

  const renderCell = (row: BulkRow, rowIdx: number, col: typeof COLUMNS[number], colIdx: number) => {
    const errMsg = col.errorField ? row.errors[col.errorField] : undefined;
    const errSx = errMsg ? { "& fieldset": { borderColor: "error.main" } } : undefined;
    const focusProps = { onFocus: () => setAnchor({ rowIdx, colIdx }) };

    if (col.key === "_actions") {
      return (
        <IconButton size="small" onClick={() => handleDeleteRow(rowIdx)} disabled={disabled}>
          <DeleteIcon size={16} />
        </IconButton>
      );
    }
    if (col.key === "itemGroupId") {
      // A pasted value that could not be resolved to a group is surfaced as an
      // error-styled placeholder (previously a red renderValue).
      const unresolved = !row.itemGroupId && Boolean(row.itemGroupText);
      return (
        <Tooltip title={errMsg ?? ""} arrow disableHoverListener={!errMsg}>
          <Box sx={{ width: "100%" }}>
            <SearchableSelect<GroupOption>
              variant="outlined"
              options={groups}
              value={groups.find(g => g.item_grp_id === row.itemGroupId) ?? null}
              onChange={opt =>
                updateRow(rowIdx, { itemGroupId: opt ? opt.item_grp_id : null, itemGroupText: "" })
              }
              getOptionLabel={groupOptionLabel}
              getOptionKey={g => String(g.item_grp_id)}
              isOptionEqualToValue={(a, b) => a.item_grp_id === b.item_grp_id}
              disabled={disabled}
              error={Boolean(errMsg) || unresolved}
              placeholder={row.itemGroupText || "Select"}
              textFieldProps={{ ...focusProps }}
            />
          </Box>
        </Tooltip>
      );
    }
    if (col.key === "uomId") {
      const unresolved = !row.uomId && Boolean(row.uomText);
      return (
        <Tooltip title={errMsg ?? ""} arrow disableHoverListener={!errMsg}>
          <Box sx={{ width: "100%" }}>
            <SearchableSelect<UomOption>
              variant="outlined"
              options={uoms}
              value={uoms.find(u => u.uom_id === row.uomId) ?? null}
              onChange={opt => updateRow(rowIdx, { uomId: opt ? opt.uom_id : null, uomText: "" })}
              getOptionLabel={u => u.label}
              getOptionKey={u => String(u.uom_id)}
              isOptionEqualToValue={(a, b) => a.uom_id === b.uom_id}
              disabled={disabled}
              error={Boolean(errMsg) || unresolved}
              placeholder={row.uomText || "Select"}
              textFieldProps={{ ...focusProps }}
            />
          </Box>
        </Tooltip>
      );
    }
    if (col.key === "goodOrService") {
      return (
        <SearchableSelect<GoodOrServiceOption>
          variant="outlined"
          options={GOOD_OR_SERVICE_OPTIONS}
          value={GOOD_OR_SERVICE_OPTIONS.find(o => o.value === row.goodOrService) ?? null}
          onChange={opt => updateRow(rowIdx, { goodOrService: opt ? opt.value : "" })}
          getOptionLabel={o => o.label}
          getOptionKey={o => o.value}
          isOptionEqualToValue={(a, b) => a.value === b.value}
          disabled={disabled}
          placeholder="—"
          textFieldProps={{ ...focusProps }}
        />
      );
    }
    if (
      col.key === "saleable" ||
      col.key === "consumable" ||
      col.key === "purchaseable" ||
      col.key === "manufacturable" ||
      col.key === "assembly"
    ) {
      const k = col.key as "saleable" | "consumable" | "purchaseable" | "manufacturable" | "assembly";
      return (
        <Checkbox
          size="small"
          checked={row[k]}
          disabled={disabled}
          onChange={e => updateRow(rowIdx, { [k]: e.target.checked } as Partial<BulkRow>)}
          {...focusProps}
        />
      );
    }
    return (
      <Tooltip title={errMsg ?? ""} arrow disableHoverListener={!errMsg}>
        <TextField
          size="small"
          variant="outlined"
          value={(row as any)[col.key] ?? ""}
          disabled={disabled}
          fullWidth
          sx={errSx}
          inputProps={
            col.key === "taxPercent" || col.key === "uomRounding" || col.key === "rateRounding"
              ? { inputMode: "decimal" }
              : undefined
          }
          onChange={e => updateRow(rowIdx, { [col.key]: e.target.value } as Partial<BulkRow>)}
          {...focusProps}
        />
      </Tooltip>
    );
  };

  return (
    <Box onPaste={handlePaste} sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
        <Box sx={{ fontSize: 12, color: "text.secondary" }}>
          Click a cell, then paste TSV from Excel. Columns marked * are required.
        </Box>
        <Button size="small" startIcon={<AddIcon size={16} />} onClick={handleAddRow} disabled={disabled}>
          Add Row
        </Button>
      </Box>
      <TableContainer component={Paper} sx={{ maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {COLUMNS.map(c => (
                <TableCell
                  key={String(c.key)}
                  sx={{ width: c.width, fontWeight: 600, bgcolor: "#1b2a4e", color: "white" }}
                >
                  {c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={row.rowKey} hover>
                {COLUMNS.map((col, colIdx) => (
                  <TableCell key={String(col.key)} sx={{ p: 0.5 }}>
                    {renderCell(row, rowIdx, col, colIdx)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default BulkItemGrid;
