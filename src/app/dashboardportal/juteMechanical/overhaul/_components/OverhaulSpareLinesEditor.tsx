"use client";

import * as React from "react";
import {
	Box,
	Button,
	IconButton,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableFooter,
	TableHead,
	TableRow,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { Plus as PlusIcon, Trash2 as TrashIcon } from "lucide-react";
import {
	ItemSelectionDialog,
	type SelectedItem,
} from "@/components/ui/transaction/ItemSelectionDialog";
import type { EditableOverhaulSpare } from "../types/overhaulTypes";
import { nextSpareLineId } from "../types/overhaulTypes";
import { formatAmount, spareLineAmount } from "../utils/overhaulCalc";

export interface OverhaulSpareLinesEditorProps {
	/** Company id, needed by the shared item picker. */
	coId: string;
	lines: ReadonlyArray<EditableOverhaulSpare>;
	/** Receives the whole next line set — the parent owns the array. */
	onChange: (lines: EditableOverhaulSpare[]) => void;
	/** View/save-in-flight lock. */
	disabled?: boolean;
}

/** Columns whose cell is a free-typed number. */
type NumericField = "qty" | "rate" | "amount";

/**
 * Spare parts consumed during an overhaul.
 *
 * Items are picked through the shared `ItemSelectionDialog` (which owns its own
 * searchable, paginated item lookup) rather than a dropdown of every item in the
 * mill — the item master runs to thousands of rows and the dialog already carries
 * uom/code/name so the table can render without a second round trip.
 *
 * `amount` is editable and optional: leave it blank and the line values at
 * qty x rate, exactly as the backend derives it. A typed amount always wins, which
 * is how a lump-sum charge with no meaningful quantity gets booked.
 */
export default function OverhaulSpareLinesEditor({
	coId,
	lines,
	onChange,
	disabled = false,
}: OverhaulSpareLinesEditorProps) {
	const [pickerOpen, setPickerOpen] = React.useState(false);

	const selectedItemIds = React.useMemo(
		() => new Set(lines.map((line) => line.item_id)),
		[lines],
	);

	const spareTotal = React.useMemo(
		() => lines.reduce((sum, line) => sum + spareLineAmount(line), 0),
		[lines],
	);

	const handleConfirmItems = React.useCallback(
		(items: SelectedItem[]) => {
			const additions: EditableOverhaulSpare[] = items
				.filter((item) => !selectedItemIds.has(item.item_id))
				.map((item) => ({
					line_id: nextSpareLineId(),
					item_id: item.item_id,
					item_code: item.full_item_code || item.item_code,
					item_name: item.item_name,
					uom_id: item.uom_id ?? null,
					uom_name: item.uom_name ?? "",
					qty: "",
					rate: "",
					amount: "",
					remarks: "",
				}));
			if (additions.length > 0) onChange([...lines, ...additions]);
			setPickerOpen(false);
		},
		[lines, onChange, selectedItemIds],
	);

	const handleNumericChange = React.useCallback(
		(lineId: string, field: NumericField, value: string) => {
			onChange(
				lines.map((line) => (line.line_id === lineId ? { ...line, [field]: value } : line)),
			);
		},
		[lines, onChange],
	);

	const handleRemarksChange = React.useCallback(
		(lineId: string, value: string) => {
			onChange(
				lines.map((line) => (line.line_id === lineId ? { ...line, remarks: value } : line)),
			);
		},
		[lines, onChange],
	);

	const handleRemove = React.useCallback(
		(lineId: string) => {
			onChange(lines.filter((line) => line.line_id !== lineId));
		},
		[lines, onChange],
	);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Typography variant="subtitle2">Spares consumed</Typography>
				<Button
					size="small"
					variant="outlined"
					startIcon={<PlusIcon size={16} />}
					onClick={() => setPickerOpen(true)}
					disabled={disabled || !coId}
					sx={{ minHeight: 36 }}
				>
					Add spares
				</Button>
				<Typography variant="body2" color="text.secondary">
					{lines.length === 0
						? "No spares booked on this overhaul."
						: `${lines.length} line${lines.length === 1 ? "" : "s"}`}
				</Typography>
			</Box>

			{lines.length > 0 ? (
				<TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell sx={{ minWidth: 200 }}>Item</TableCell>
								<TableCell sx={{ width: 90 }}>UOM</TableCell>
								<TableCell align="right" sx={{ width: 110 }}>
									Qty
								</TableCell>
								<TableCell align="right" sx={{ width: 120 }}>
									Rate
								</TableCell>
								<TableCell align="right" sx={{ width: 140 }}>
									Amount
								</TableCell>
								<TableCell sx={{ minWidth: 160 }}>Remarks</TableCell>
								<TableCell sx={{ width: 56 }} />
							</TableRow>
						</TableHead>
						<TableBody>
							{lines.map((line) => (
								<TableRow key={line.line_id} hover>
									<TableCell>
										<Typography variant="body2" sx={{ fontWeight: 600 }}>
											{line.item_code || `#${line.item_id}`}
										</Typography>
										<Typography variant="caption" color="text.secondary">
											{line.item_name}
										</Typography>
									</TableCell>
									<TableCell>{line.uom_name || "—"}</TableCell>
									<TableCell align="right">
										<TextField
											value={line.qty}
											onChange={(e) =>
												handleNumericChange(line.line_id, "qty", e.target.value)
											}
											type="number"
											size="small"
											disabled={disabled}
											inputProps={{ min: 0, step: "any", style: { textAlign: "right" } }}
											sx={{ width: 100 }}
										/>
									</TableCell>
									<TableCell align="right">
										<TextField
											value={line.rate}
											onChange={(e) =>
												handleNumericChange(line.line_id, "rate", e.target.value)
											}
											type="number"
											size="small"
											disabled={disabled}
											inputProps={{ min: 0, step: "any", style: { textAlign: "right" } }}
											sx={{ width: 110 }}
										/>
									</TableCell>
									<TableCell align="right">
										<TextField
											value={line.amount}
											onChange={(e) =>
												handleNumericChange(line.line_id, "amount", e.target.value)
											}
											type="number"
											size="small"
											disabled={disabled}
											placeholder={formatAmount(spareLineAmount(line))}
											inputProps={{ min: 0, step: "any", style: { textAlign: "right" } }}
											sx={{ width: 130 }}
											helperText={line.amount === "" ? "qty x rate" : undefined}
										/>
									</TableCell>
									<TableCell>
										<TextField
											value={line.remarks}
											onChange={(e) => handleRemarksChange(line.line_id, e.target.value)}
											size="small"
											fullWidth
											disabled={disabled}
											inputProps={{ maxLength: 255 }}
										/>
									</TableCell>
									<TableCell>
										<Tooltip title="Remove line">
											<span>
												<IconButton
													size="small"
													color="error"
													onClick={() => handleRemove(line.line_id)}
													disabled={disabled}
													sx={{ minWidth: 40, minHeight: 40 }}
												>
													<TrashIcon size={16} />
												</IconButton>
											</span>
										</Tooltip>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
						<TableFooter>
							<TableRow>
								<TableCell colSpan={4} align="right" sx={{ fontWeight: 600 }}>
									Spare cost
								</TableCell>
								<TableCell align="right" sx={{ fontWeight: 600 }}>
									{formatAmount(spareTotal)}
								</TableCell>
								<TableCell colSpan={2} />
							</TableRow>
						</TableFooter>
					</Table>
				</TableContainer>
			) : null}

			<ItemSelectionDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				coId={coId}
				onConfirm={handleConfirmItems}
				excludeItemIds={selectedItemIds}
				title="Select spare parts"
			/>
		</Box>
	);
}
