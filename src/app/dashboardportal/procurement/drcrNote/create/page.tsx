"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Divider, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { ArrowLeft, Save } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { toast } from "@/hooks/use-toast";
import useDebounce from "@/hooks/use-debounce";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";

import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
// Adjustment types
const TYPE_DEBIT = 1;
const TYPE_CREDIT = 2;

// Debit note reason types
const DEBITNOTE_TYPE_QTY_REJECTION = 1;
const DEBITNOTE_TYPE_RATE_DIFF = 2;

type EligibleInward = {
	inward_id: number;
	inward_no: string;
	sr_no: string;
	sr_date: string;
	supplier_id: number;
	supplier_name: string;
	branch_id: number;
};

type InwardHeader = {
	inward_id: number;
	inward_no: string;
	inward_date: string;
	branch_name: string;
	supplier_name: string;
	sr_no: string;
	sr_date: string;
	challan_no: string;
	challan_date: string;
};

/** One inward line plus the editable DRCR fields. */
type NoteLine = {
	inward_dtl_id: number;
	full_item_code: string;
	item_name: string;
	uom_name: string;
	approved_qty: number;
	accepted_rate: number;
	invoice_rate: number;
	include: boolean;
	debitnote_type: number;
	quantity: string;
	rate: string;
};

const formatCurrency = (value?: number) => {
	if (value === undefined || value === null) return "₹0.00";
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		minimumFractionDigits: 2,
	}).format(value);
};

const formatDate = (value?: string) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

/**
 * Manual DR/CR Note create page.
 * Pick an approved-SR inward, tick the lines to adjust, save → view page.
 */
export default function DrcrNoteCreatePage() {
	const router = useRouter();
	const { coId } = useSelectedCompanyCoId();

	// Header state
	const [noteDate, setNoteDate] = React.useState("");
	const [adjustmentType, setAdjustmentType] = React.useState<number>(TYPE_DEBIT);
	const [remarks, setRemarks] = React.useState("");

	// Inward picker state
	const [inwardInput, setInwardInput] = React.useState("");
	const debouncedInwardInput = useDebounce(inwardInput, 400);
	const [inwardOptions, setInwardOptions] = React.useState<EligibleInward[]>([]);
	const [optionsLoading, setOptionsLoading] = React.useState(false);
	const [selectedInward, setSelectedInward] = React.useState<EligibleInward | null>(null);

	// Loaded inward
	const [header, setHeader] = React.useState<InwardHeader | null>(null);
	const [lines, setLines] = React.useState<NoteLine[]>([]);
	const [loadingInward, setLoadingInward] = React.useState(false);
	const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);

	// Date defaults on mount, not in the initial state — server and first client render must match.
	React.useEffect(() => {
		setNoteDate(new Date().toISOString().slice(0, 10));
	}, []);

	// Fetch eligible inwards (runs once on mount for the empty search, then per debounced keystroke).
	// ponytail: co_id-scoped only — no procurement page reads the selected-branch key today.
	React.useEffect(() => {
		if (!coId) return;
		let cancelled = false;

		(async () => {
			setOptionsLoading(true);
			try {
				const query = new URLSearchParams({ co_id: String(coId), limit: "20" });
				const search = debouncedInwardInput.trim();
				if (search) query.set("search", search);

				const { data, error } = await fetchWithCookie(
					`${apiRoutesPortalMasters.DRCR_NOTE_ELIGIBLE_INWARDS}?${query.toString()}`,
					"GET"
				);
				if (error) throw new Error(error);
				if (cancelled) return;
				setInwardOptions(Array.isArray((data as any)?.data) ? (data as any).data : []);
			} catch {
				if (!cancelled) setInwardOptions([]);
			} finally {
				if (!cancelled) setOptionsLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [coId, debouncedInwardInput]);

	/** Load the picked inward's header + lines. */
	const handleInwardChange = React.useCallback(
		async (_event: React.SyntheticEvent, option: EligibleInward | null) => {
			setSelectedInward(option);
			setHeader(null);
			setLines([]);
			setErrorMessage(null);
			if (!option) return;

			setLoadingInward(true);
			try {
				const url = `${apiRoutesPortalMasters.DRCR_NOTE_GET_INWARD_FOR_CREATE}/${option.inward_id}?co_id=${encodeURIComponent(String(coId))}`;
				const { data, error } = await fetchWithCookie(url, "GET");
				if (error) throw new Error(error);

				const result = data as any;
				setHeader({
					inward_id: result.header?.inward_id ?? 0,
					inward_no: result.header?.inward_no ?? "",
					inward_date: result.header?.inward_date ?? "",
					branch_name: result.header?.branch_name ?? "",
					supplier_name: result.header?.supplier_name ?? "",
					sr_no: result.header?.sr_no ?? "",
					sr_date: result.header?.sr_date ?? "",
					challan_no: result.header?.challan_no ?? "",
					challan_date: result.header?.challan_date ?? "",
				});
				setLines(
					(result.line_items || []).map((item: any) => ({
						inward_dtl_id: item.inward_dtl_id,
						full_item_code: item.full_item_code ?? item.item_code ?? "",
						item_name: item.item_name ?? "",
						uom_name: item.uom_name ?? "",
						approved_qty: Number(item.approved_qty ?? 0),
						accepted_rate: Number(item.accepted_rate ?? item.rate ?? 0),
						invoice_rate: Number(item.invoice_rate ?? 0),
						include: false,
						debitnote_type: DEBITNOTE_TYPE_RATE_DIFF,
						quantity: String(item.approved_qty ?? 0),
						rate: "",
					}))
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to load inward";
				setErrorMessage(message);
			} finally {
				setLoadingInward(false);
			}
		},
		[coId]
	);

	const updateLine = React.useCallback((inwardDtlId: number, patch: Partial<NoteLine>) => {
		setLines((prev) => prev.map((l) => (l.inward_dtl_id === inwardDtlId ? { ...l, ...patch } : l)));
	}, []);

	const includedLines = lines.filter((l) => l.include);
	const totalAmount = includedLines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);

	const handleSave = React.useCallback(async () => {
		if (!selectedInward) {
			toast({ title: "Validation", description: "Select an inward first", variant: "destructive" });
			return;
		}
		if (!noteDate) {
			toast({ title: "Validation", description: "Note date is required", variant: "destructive" });
			return;
		}

		const selected = lines.filter((l) => l.include);
		if (selected.length === 0) {
			toast({ title: "Validation", description: "Select at least one line item", variant: "destructive" });
			return;
		}

		const invalid = selected.find((l) => !(Number(l.quantity) > 0) || !(Number(l.rate) > 0));
		if (invalid) {
			toast({
				title: "Validation",
				description: `Quantity and rate must be greater than zero for ${invalid.full_item_code || "the selected line"}`,
				variant: "destructive",
			});
			return;
		}

		setSaving(true);
		try {
			const { data, error } = await fetchWithCookie(apiRoutesPortalMasters.DRCR_NOTE_CREATE, "POST", {
				inward_id: Number(selectedInward.inward_id),
				note_date: noteDate,
				adjustment_type: adjustmentType,
				remarks: remarks || null,
				line_items: selected.map((l) => ({
					inward_dtl_id: l.inward_dtl_id,
					debitnote_type: l.debitnote_type,
					quantity: Number(l.quantity),
					rate: Number(l.rate),
				})),
			});
			if (error) throw new Error(error);

			const result = data as any;
			toast({
				title: "Success",
				description: `${result?.note_no || "DRCR Note"} created successfully`,
				variant: "default",
			});
			// mode=edit so the just-created Draft note shows its Open/Approve actions
			router.push(`/dashboardportal/procurement/drcrNote/view?mode=edit&id=${encodeURIComponent(String(result?.drcr_note_id))}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to create DRCR Note";
			toast({ title: "Error", description: message, variant: "destructive" });
		} finally {
			setSaving(false);
		}
	}, [selectedInward, noteDate, adjustmentType, remarks, lines, router]);

	const handleBack = React.useCallback(() => {
		router.push("/dashboardportal/procurement/drcrNote");
	}, [router]);

	return (
		<Box sx={{ p: 2 }}>
			<Paper sx={{ p: 3, mb: 3 }}>
				<Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
					<Box>
						<Typography variant="h5" fontWeight={600}>
							New Debit / Credit Note
						</Typography>
						<Typography variant="body2" color="text.secondary">
							Raise a manual adjustment against an inward whose Stores Receipt is approved.
						</Typography>
					</Box>
					<ToggleButtonGroup
						value={adjustmentType}
						exclusive
						size="small"
						onChange={(_e, value) => {
							if (value !== null) setAdjustmentType(value);
						}}
					>
						<ToggleButton value={TYPE_DEBIT}>Debit Note</ToggleButton>
						<ToggleButton value={TYPE_CREDIT}>Credit Note</ToggleButton>
					</ToggleButtonGroup>
				</Stack>

				<Divider sx={{ my: 2 }} />

				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
						gap: 2,
					}}
				>
					<Autocomplete
						options={inwardOptions}
						value={selectedInward}
						loading={optionsLoading}
						onChange={handleInwardChange}
						onInputChange={(_e, value, reason) => {
							if (reason === "input") setInwardInput(value);
						}}
						getOptionLabel={(option) => `${option.inward_no} — ${option.supplier_name}`}
						isOptionEqualToValue={(option, value) => option.inward_id === value.inward_id}
						filterOptions={(options) => options}
						renderOption={(props, option) => (
							<li {...props} key={option.inward_id}>
								{`${option.inward_no} — ${option.supplier_name}`}
							</li>
						)}
						renderInput={(params) => (
							<TextField
								{...params}
								label="Inward (approved SR)"
								size="small"
								required
								InputProps={{
									...params.InputProps,
									endAdornment: (
										<>
											{optionsLoading ? <CircularProgress size={16} /> : null}
											{params.InputProps.endAdornment}
										</>
									),
								}}
							/>
						)}
					/>
					<TextField
						label="Note Date"
						type="date"
						size="small"
						value={noteDate}
						onChange={(e) => setNoteDate(e.target.value)}
						InputLabelProps={{ shrink: true }}
						required
					/>
					<TextField
						label="Remarks"
						size="small"
						multiline
						minRows={2}
						value={remarks}
						onChange={(e) => setRemarks(e.target.value)}
						sx={{ gridColumn: { md: "span 2" } }}
					/>
				</Box>

				{header ? (
					<Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}>
						<Chip size="small" label={`Supplier: ${header.supplier_name || "-"}`} />
						<Chip size="small" label={`Branch: ${header.branch_name || "-"}`} />
						<Chip size="small" label={`SR No: ${header.sr_no || "-"}`} />
						<Chip size="small" label={`SR Date: ${formatDate(header.sr_date)}`} />
						<Chip size="small" label={`Inward Date: ${formatDate(header.inward_date)}`} />
						{header.challan_no ? <Chip size="small" label={`Challan: ${header.challan_no}`} /> : null}
					</Stack>
				) : null}

				{errorMessage ? (
					<Alert severity="error" sx={{ mt: 2 }}>
						{errorMessage}
					</Alert>
				) : null}
			</Paper>

			<Paper sx={{ p: 3, mb: 3 }}>
				<Typography variant="h6" fontWeight={600} mb={2}>
					Line Items
				</Typography>

				{loadingInward ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress />
					</Box>
				) : lines.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						Select an inward to load its line items.
					</Typography>
				) : (
					<TableContainer>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell padding="checkbox" />
									<TableCell>Item Code</TableCell>
									<TableCell>Item</TableCell>
									<TableCell>UOM</TableCell>
									<TableCell align="right">Accepted Qty</TableCell>
									<TableCell align="right">Accepted Rate</TableCell>
									<TableCell align="right">Invoice Rate</TableCell>
									<TableCell sx={{ minWidth: 160 }}>Reason</TableCell>
									<TableCell sx={{ minWidth: 110 }} align="right">Quantity</TableCell>
									<TableCell sx={{ minWidth: 110 }} align="right">Rate</TableCell>
									<TableCell align="right">Amount</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{lines.map((line) => (
									<TableRow key={line.inward_dtl_id} hover selected={line.include}>
										<TableCell padding="checkbox">
											<Checkbox
												checked={line.include}
												onChange={(e) => updateLine(line.inward_dtl_id, { include: e.target.checked })}
											/>
										</TableCell>
										<TableCell sx={{ fontFamily: "monospace" }}>{line.full_item_code || "-"}</TableCell>
										<TableCell>{line.item_name || "-"}</TableCell>
										<TableCell>{line.uom_name || "-"}</TableCell>
										<TableCell align="right">{line.approved_qty}</TableCell>
										<TableCell align="right">{formatCurrency(line.accepted_rate)}</TableCell>
										<TableCell align="right">{formatCurrency(line.invoice_rate)}</TableCell>
										<TableCell>
											<SearchableOptionSelect
												size="small"
												fullWidth
												disabled={!line.include}
												options={[{ value: DEBITNOTE_TYPE_QTY_REJECTION, label: "Qty Rejection" }, { value: DEBITNOTE_TYPE_RATE_DIFF, label: "Rate Difference" }]}
												value={line.debitnote_type}
												onChange={(selectedValue) => updateLine(line.inward_dtl_id, { debitnote_type: Number(selectedValue) })}
											/>
										</TableCell>
										<TableCell>
											<TextField
												type="number"
												size="small"
												fullWidth
												value={line.quantity}
												disabled={!line.include}
												onChange={(e) => updateLine(line.inward_dtl_id, { quantity: e.target.value })}
												inputProps={{ min: 0, step: 0.01, style: { textAlign: "right" } }}
											/>
										</TableCell>
										<TableCell>
											<TextField
												type="number"
												size="small"
												fullWidth
												value={line.rate}
												disabled={!line.include}
												onChange={(e) => updateLine(line.inward_dtl_id, { rate: e.target.value })}
												inputProps={{ min: 0, step: 0.01, style: { textAlign: "right" } }}
											/>
										</TableCell>
										<TableCell align="right">
											{formatCurrency((Number(line.quantity) || 0) * (Number(line.rate) || 0))}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TableContainer>
				)}

				{includedLines.length > 0 ? (
					<Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }} spacing={2}>
						<Typography variant="subtitle1" color="text.secondary">
							{includedLines.length} line{includedLines.length > 1 ? "s" : ""} selected — Total (before tax)
						</Typography>
						<Typography variant="subtitle1" fontWeight={700}>
							{formatCurrency(totalAmount)}
						</Typography>
					</Stack>
				) : null}
			</Paper>

			<Paper sx={{ p: 2 }}>
				<Stack direction="row" justifyContent="space-between">
					<Button variant="outlined" startIcon={<ArrowLeft size={18} />} onClick={handleBack} disabled={saving}>
						Back
					</Button>
					<Button
						variant="contained"
						startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
						onClick={handleSave}
						disabled={saving || !selectedInward}
					>
						Save Note
					</Button>
				</Stack>
			</Paper>
		</Box>
	);
}
