"use client";

import React from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import {
	fetchGovtSackingSourceList,
	fetchGovtSackingSource,
} from "@/utils/salesInvoiceService";
import type {
	GovtSackingSourceRow,
	GovtSackingSourceDetail,
} from "../types/salesInvoiceTypes";
import { toast } from "@/hooks/use-toast";

type Props = {
	coId: string;
	branchId: string;
	value: GovtSackingSourceRow | null;
	onSelect: (detail: GovtSackingSourceDetail | null, row: GovtSackingSourceRow | null) => void;
	disabled?: boolean;
};

const formatOptionLabel = (row: GovtSackingSourceRow): string => {
	const parts: string[] = [];
	parts.push(`Invoice No ${row.invoice_no ?? "—"}`);
	if (row.party_name) parts.push(row.party_name);
	if (row.pcso_no) parts.push(`PCSO ${row.pcso_no}`);
	if (row.invoice_date) parts.push(row.invoice_date);
	return parts.join(" — ");
};

export function GovtSackingSourcePicker({ coId, branchId, value, onSelect, disabled }: Props) {
	const [inputValue, setInputValue] = React.useState("");
	const [debouncedSearch, setDebouncedSearch] = React.useState("");
	const [options, setOptions] = React.useState<GovtSackingSourceRow[]>([]);
	const [listLoading, setListLoading] = React.useState(false);
	const [detailLoading, setDetailLoading] = React.useState(false);
	const [open, setOpen] = React.useState(false);

	React.useEffect(() => {
		const handle = setTimeout(() => setDebouncedSearch(inputValue.trim()), 300);
		return () => clearTimeout(handle);
	}, [inputValue]);

	React.useEffect(() => {
		if (!coId || !branchId) return;
		if (!open) return;
		let cancelled = false;
		setListLoading(true);
		fetchGovtSackingSourceList({
			coId,
			branchId,
			search: debouncedSearch || undefined,
			page: 1,
			limit: 25,
		})
			.then((response) => {
				if (cancelled) return;
				setOptions(response.data ?? []);
			})
			.catch((error) => {
				if (cancelled) return;
				toast({
					variant: "destructive",
					title: "Unable to load Govt Sacking invoices",
					description: error instanceof Error ? error.message : "Please try again.",
				});
				setOptions([]);
			})
			.finally(() => {
				if (!cancelled) setListLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, debouncedSearch, open]);

	const handleChange = React.useCallback(
		async (_event: unknown, selected: GovtSackingSourceRow | null) => {
			if (!selected) {
				onSelect(null, null);
				return;
			}
			setDetailLoading(true);
			try {
				const response = await fetchGovtSackingSource(selected.invoice_id, coId);
				onSelect(response.data, selected);
			} catch (error) {
				toast({
					variant: "destructive",
					title: "Unable to load source invoice",
					description: error instanceof Error ? error.message : "Please try again.",
				});
				onSelect(null, null);
			} finally {
				setDetailLoading(false);
			}
		},
		[coId, onSelect],
	);

	return (
		<Autocomplete<GovtSackingSourceRow>
			open={open}
			onOpen={() => setOpen(true)}
			onClose={() => setOpen(false)}
			options={options}
			value={value}
			onChange={handleChange}
			onInputChange={(_event, value, reason) => {
				if (reason === "input") setInputValue(value);
			}}
			getOptionLabel={(option) => formatOptionLabel(option)}
			isOptionEqualToValue={(option, val) => option.invoice_id === val.invoice_id}
			loading={listLoading || detailLoading}
			disabled={disabled}
			filterOptions={(opts) => opts}
			noOptionsText={debouncedSearch ? "No matching Govt Sacking invoices" : "Type to search"}
			renderInput={(params) => (
				<TextField
					{...params}
					label="Source Govt Sacking Invoice"
					required
					placeholder="Search by invoice no or party name"
					InputProps={{
						...params.InputProps,
						endAdornment: (
							<>
								{(listLoading || detailLoading) ? (
									<CircularProgress color="inherit" size={16} />
								) : null}
								{params.InputProps.endAdornment}
							</>
						),
					}}
				/>
			)}
		/>
	);
}

export default GovtSackingSourcePicker;
