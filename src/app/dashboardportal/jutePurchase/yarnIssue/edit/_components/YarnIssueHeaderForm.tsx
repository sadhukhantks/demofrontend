/**
 * @file YarnIssueHeaderForm.tsx
 * @description Presentational header form for a Yarn Issue / Return (date, type,
 * department, issue number, remarks). Renders from props only; the page owns the state.
 */
import * as React from "react";
import { Card, CardContent, Grid, TextField, Typography } from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { BranchOption } from "@/components/reports/types";
import type { YarnIssueDepartment, YarnIssueType } from "@/utils/yarnIssueService";
import type { YarnIssueHeaderFormValues } from "../types/yarnIssueTypes";
import { YARN_ISSUE_TYPE_OPTIONS, type YarnIssueTypeOption } from "../../utils/yarnIssueConstants";

type YarnIssueHeaderFormProps = {
	values: YarnIssueHeaderFormValues;
	readOnly: boolean;
	onChange: <K extends keyof YarnIssueHeaderFormValues>(field: K, value: YarnIssueHeaderFormValues[K]) => void;
	departments: ReadonlyArray<YarnIssueDepartment>;
	departmentsLoading?: boolean;
	/** Types the backend offers (`setup.issue_types`); defaults to both. */
	issueTypes: ReadonlyArray<YarnIssueType>;
	/** Type is locked once lines exist or the document has been saved. */
	typeLocked: boolean;
	/** Branches in the sidebar scope — the picker renders only when more than one AND the doc is new. */
	branches: ReadonlyArray<BranchOption>;
	branchId: number | null;
	onBranchChange?: (branchId: number | null) => void;
	/** True for an unsaved document (branch can still be chosen). */
	isNew: boolean;
	issueNo: string | null;
	/** Zod field errors keyed by API field name (`tran_date`, `dept_id`, ...). */
	fieldErrors: Record<string, string>;
};

export function YarnIssueHeaderForm({
	values,
	readOnly,
	onChange,
	departments,
	departmentsLoading = false,
	issueTypes,
	typeLocked,
	branches,
	branchId,
	onBranchChange,
	isNew,
	issueNo,
	fieldErrors,
}: YarnIssueHeaderFormProps) {
	const typeOptions = React.useMemo<YarnIssueTypeOption[]>(
		() => YARN_ISSUE_TYPE_OPTIONS.filter((option) => issueTypes.length === 0 || issueTypes.includes(option.value)),
		[issueTypes],
	);
	const selectedType = React.useMemo(
		() => YARN_ISSUE_TYPE_OPTIONS.find((option) => option.value === values.issueType) ?? null,
		[values.issueType],
	);
	const selectedDepartment = React.useMemo(
		() => departments.find((dept) => dept.dept_id === values.deptId) ?? null,
		[departments, values.deptId],
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
					Yarn Issue / Return{issueNo ? ` - ${issueNo}` : ""}
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
						<SearchableSelect<YarnIssueTypeOption>
							variant="outlined"
							size="medium"
							label="Type"
							required
							clearable={false}
							options={typeOptions}
							value={selectedType}
							onChange={(option) => onChange("issueType", option ? option.value : null)}
							getOptionLabel={(option) => option.label}
							getOptionKey={(option) => option.value}
							isOptionEqualToValue={(option, value) => option.value === value.value}
							disabled={readOnly || typeLocked}
							error={Boolean(fieldErrors.issue_type)}
							helperText={
								fieldErrors.issue_type ?? (typeLocked && !readOnly ? "Locked: remove all lines to change the type." : undefined)
							}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<SearchableSelect<YarnIssueDepartment>
							variant="outlined"
							size="medium"
							label="Department"
							required
							options={departments}
							value={selectedDepartment}
							onChange={(option) => onChange("deptId", option ? option.dept_id : null)}
							getOptionLabel={(option) => option.dept_desc}
							getOptionKey={(option) => String(option.dept_id)}
							isOptionEqualToValue={(option, value) => option.dept_id === value.dept_id}
							disabled={readOnly}
							loading={departmentsLoading}
							error={Boolean(fieldErrors.dept_id)}
							helperText={fieldErrors.dept_id}
						/>
					</Grid>
					<Grid size={{ xs: 12, md: 4 }}>
						<TextField
							label="Issue No"
							fullWidth
							value={issueNo ?? ""}
							placeholder={isNew ? "Generated on Open" : "Not yet generated"}
							InputProps={{ readOnly: true }}
							InputLabelProps={{ shrink: true }}
						/>
					</Grid>
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

export default YarnIssueHeaderForm;
