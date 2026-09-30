/**
 * @file YarnPurchaseHeaderForm.tsx
 * @description Presentational header form for a Yarn Purchase (date, supplier,
 * challan, vehicle, remarks). Renders from props only; the page owns the state.
 */
import * as React from "react";
import { Card, CardContent, Grid, TextField, Typography } from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { BranchOption } from "@/components/reports/types";
import type { YarnPurchaseParty } from "@/utils/yarnPurchaseService";
import type { YarnPurchaseHeaderFormValues } from "../types/yarnPurchaseTypes";

type YarnPurchaseHeaderFormProps = {
	values: YarnPurchaseHeaderFormValues;
	readOnly: boolean;
	onChange: <K extends keyof YarnPurchaseHeaderFormValues>(field: K, value: YarnPurchaseHeaderFormValues[K]) => void;
	parties: ReadonlyArray<YarnPurchaseParty>;
	partiesLoading?: boolean;
	/** Branches in the sidebar scope — the picker renders only when more than one AND the doc is new. */
	branches: ReadonlyArray<BranchOption>;
	branchId: number | null;
	onBranchChange?: (branchId: number | null) => void;
	/** True for an unsaved document (branch can still be chosen). */
	isNew: boolean;
	purchaseNo: string | null;
	/** Zod field errors keyed by API field name (`tran_date`, `challan_no`, ...). */
	fieldErrors: Record<string, string>;
};

export function YarnPurchaseHeaderForm({
	values,
	readOnly,
	onChange,
	parties,
	partiesLoading = false,
	branches,
	branchId,
	onBranchChange,
	isNew,
	purchaseNo,
	fieldErrors,
}: YarnPurchaseHeaderFormProps) {
	const selectedParty = React.useMemo(
		() => parties.find((party) => party.party_id === values.partyId) ?? null,
		[parties, values.partyId],
	);
	const selectedBranch = React.useMemo(
		() => branches.find((branch) => branch.branch_id === branchId) ?? null,
		[branches, branchId],
	);
	const showBranchPicker = isNew && !readOnly && branches.length > 1;

	return (
		<Card variant="outlined">
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Yarn Purchase{purchaseNo ? ` - ${purchaseNo}` : ""}
				</Typography>
				<Grid container spacing={2}>
					<Grid size={{ xs: 12, md: 4 }}>
						{showBranchPicker ? (
							<SearchableSelect<BranchOption>
								variant="outlined"
								size="medium"
								label="Branch"
								required
								clearable={false}
								options={branches}
								value={selectedBranch}
								onChange={(option) => onBranchChange?.(option ? option.branch_id : null)}
								getOptionLabel={(option) => option.branch_name}
								getOptionKey={(option) => String(option.branch_id)}
								isOptionEqualToValue={(option, value) => option.branch_id === value.branch_id}
								error={Boolean(fieldErrors.branch_id)}
								helperText={fieldErrors.branch_id}
							/>
						) : (
							<TextField
								label="Branch"
								fullWidth
								value={selectedBranch?.branch_name ?? (branchId != null ? String(branchId) : "")}
								InputProps={{ readOnly: true }}
								error={Boolean(fieldErrors.branch_id)}
								helperText={fieldErrors.branch_id}
							/>
						)}
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Date"
							type="date"
							required
							fullWidth
							value={values.tranDate}
							onChange={(event) => onChange("tranDate", event.target.value)}
							InputLabelProps={{ shrink: true }}
							InputProps={{ readOnly }}
							error={Boolean(fieldErrors.tran_date)}
							helperText={fieldErrors.tran_date}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<SearchableSelect<YarnPurchaseParty>
							variant="outlined"
							size="medium"
							label="Supplier"
							options={parties}
							value={selectedParty}
							onChange={(option) => onChange("partyId", option ? option.party_id : null)}
							getOptionLabel={(option) => option.supp_name}
							getOptionKey={(option) => String(option.party_id)}
							isOptionEqualToValue={(option, value) => option.party_id === value.party_id}
							disabled={readOnly}
							loading={partiesLoading}
							error={Boolean(fieldErrors.party_id)}
							helperText={fieldErrors.party_id}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Challan No"
							fullWidth
							value={values.challanNo}
							onChange={(event) => onChange("challanNo", event.target.value)}
							InputProps={{ readOnly }}
							inputProps={{ maxLength: 50 }}
							error={Boolean(fieldErrors.challan_no)}
							helperText={fieldErrors.challan_no}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Challan Date"
							type="date"
							fullWidth
							value={values.challanDate}
							onChange={(event) => onChange("challanDate", event.target.value)}
							InputLabelProps={{ shrink: true }}
							InputProps={{ readOnly }}
							error={Boolean(fieldErrors.challan_date)}
							helperText={fieldErrors.challan_date}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Vehicle No"
							fullWidth
							value={values.vehicleNo}
							onChange={(event) => onChange("vehicleNo", event.target.value)}
							InputProps={{ readOnly }}
							inputProps={{ maxLength: 50 }}
							error={Boolean(fieldErrors.vehicle_no)}
							helperText={fieldErrors.vehicle_no}
						/>
					</Grid>
					{purchaseNo ? (
						<Grid size={{ xs: 12, md: 4 }}>
							<TextField label="Purchase No" fullWidth value={purchaseNo} InputProps={{ readOnly: true }} />
						</Grid>
					) : null}
					<Grid size={{ xs: 12 }}>
						<TextField
							label="Remarks"
							fullWidth
							multiline
							rows={2}
							value={values.remarks}
							onChange={(event) => onChange("remarks", event.target.value)}
							InputProps={{ readOnly }}
							inputProps={{ maxLength: 1000 }}
							error={Boolean(fieldErrors.remarks)}
							helperText={fieldErrors.remarks}
						/>
					</Grid>
				</Grid>
			</CardContent>
		</Card>
	);
}

export default YarnPurchaseHeaderForm;
