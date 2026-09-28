"use client";

import React from "react";
import { Box, Typography } from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useMounted } from "./useMounted";
import type { BranchOption } from "./types";

type Props = {
	/** Branches in the sidebar's scope, from `useReportBranches`. */
	branches: BranchOption[];
	/** Currently selected branch id. */
	value: number | null;
	/** Called with the newly selected branch id. */
	onChange: (branchId: number | null) => void;
};

/**
 * The standing branch-filter norm in one place: a searchable picker when the
 * user has more than one branch in scope, the branch name as plain text when
 * they have exactly one.
 *
 * Renders nothing until mounted — `branches` comes from the localStorage-backed
 * sidebar context, which is empty during SSR, so drawing it on the first client
 * render would hydrate against different HTML.
 */
export function BranchScopePicker({ branches, value, onChange }: Props) {
	const mounted = useMounted();
	if (!mounted) return null;

	if (branches.length <= 1) {
		return (
			<Typography variant="body2" color="text.secondary">
				{branches[0]?.branch_name ?? ""}
			</Typography>
		);
	}

	return (
		<Box sx={{ minWidth: 240 }}>
			<SearchableSelect
				variant="outlined"
				label="Branch"
				options={branches}
				value={branches.find((b) => b.branch_id === value) ?? null}
				onChange={(opt) => onChange(opt?.branch_id ?? null)}
				getOptionLabel={(o) => o.branch_name}
				isOptionEqualToValue={(o, v) => o.branch_id === v.branch_id}
				clearable={false}
			/>
		</Box>
	);
}

export default BranchScopePicker;
