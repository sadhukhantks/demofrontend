/**
 * @file useYarnPurchaseLineColumns.tsx
 * @description Column definitions for the Yarn Purchase line grid
 * (`TransactionLineItems`). Every dropdown is a `SearchableSelect` (bare variant
 * inside the grid); numeric boxes keep string state and route through the page's
 * `onLineChange` so the weight auto-fill rule lives in one place.
 */
import * as React from "react";
import { Box, TextField, Typography } from "@mui/material";
import type { TransactionLineColumn } from "@/components/ui/transaction";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { YarnPurchaseYarnItem } from "@/utils/yarnPurchaseService";
import type { EditableLineField, EditableYarnPurchaseLine, PackageTypeOption } from "../types/yarnPurchaseTypes";
import { lineAmount } from "../utils/yarnPurchaseCalc";
import { formatNumber } from "../../utils/yarnPurchaseFormat";

type UseYarnPurchaseLineColumnsParams = {
	canEdit: boolean;
	yarnItems: ReadonlyArray<YarnPurchaseYarnItem>;
	packageTypes: ReadonlyArray<string>;
	onLineChange: (id: string, field: EditableLineField, value: string) => void;
	onItemChange: (id: string, itemId: number | null) => void;
};

/** "13 LBS SKWP (13 lbs)" — item name plus the yarn count when the master has one. */
export const yarnItemLabel = (item: YarnPurchaseYarnItem): string =>
	item.yarn_count?.trim() ? `${item.item_name} (${item.yarn_count.trim()})` : item.item_name;

const CELL_INPUT_SX = { "& .MuiInputBase-input": { fontSize: "0.75rem", py: 0.5 } } as const;

type NumberCellProps = {
	value: string;
	onChange: (value: string) => void;
	caption?: string;
	ariaLabel: string;
};

function NumberCell({ value, onChange, caption, ariaLabel }: NumberCellProps) {
	return (
		<Box>
			<TextField
				type="number"
				size="small"
				fullWidth
				value={value}
				onChange={(event) => onChange(event.target.value)}
				inputProps={{ min: 0, step: "any", "aria-label": ariaLabel }}
				sx={CELL_INPUT_SX}
			/>
			{caption ? (
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
					{caption}
				</Typography>
			) : null}
		</Box>
	);
}

export function useYarnPurchaseLineColumns({
	canEdit,
	yarnItems,
	packageTypes,
	onLineChange,
	onItemChange,
}: UseYarnPurchaseLineColumnsParams): TransactionLineColumn<EditableYarnPurchaseLine>[] {
	const itemById = React.useMemo(() => new Map(yarnItems.map((item) => [item.item_id, item])), [yarnItems]);

	const packageTypeOptions = React.useMemo<PackageTypeOption[]>(
		() => packageTypes.map((value) => ({ value, label: value })),
		[packageTypes],
	);

	/** Options for one line — includes a stored value the setup list no longer offers. */
	const optionsForPackageType = React.useCallback(
		(current: string): PackageTypeOption[] =>
			current && !packageTypeOptions.some((option) => option.value === current)
				? [...packageTypeOptions, { value: current, label: current }]
				: packageTypeOptions,
		[packageTypeOptions],
	);

	return React.useMemo<TransactionLineColumn<EditableYarnPurchaseLine>[]>(
		() => [
			{
				id: "item",
				header: "Yarn Item",
				width: "2fr",
				minWidth: "200px",
				renderCell: ({ item }) => {
					const selected = item.itemId != null ? itemById.get(item.itemId) ?? null : null;
					if (!canEdit) {
						return <span className="text-xs">{selected ? yarnItemLabel(selected) : item.itemId ?? "-"}</span>;
					}
					return (
						<SearchableSelect<YarnPurchaseYarnItem>
							options={yarnItems}
							value={selected}
							onChange={(option) => onItemChange(item.id, option ? option.item_id : null)}
							getOptionLabel={yarnItemLabel}
							getOptionKey={(option) => String(option.item_id)}
							isOptionEqualToValue={(option, value) => option.item_id === value.item_id}
							placeholder="Select yarn item"
						/>
					);
				},
				getTooltip: ({ item }) => {
					const selected = item.itemId != null ? itemById.get(item.itemId) : undefined;
					return selected ? `${yarnItemLabel(selected)}${selected.item_code ? ` · ${selected.item_code}` : ""}` : undefined;
				},
			},
			{
				id: "packageType",
				header: "Package Type",
				width: "1.1fr",
				minWidth: "120px",
				renderCell: ({ item }) => {
					if (!canEdit) return <span className="text-xs">{item.packageType || "-"}</span>;
					const options = optionsForPackageType(item.packageType);
					return (
						<SearchableSelect<PackageTypeOption>
							options={options}
							value={options.find((option) => option.value === item.packageType) ?? null}
							onChange={(option) => onLineChange(item.id, "packageType", option ? option.value : "")}
							getOptionLabel={(option) => option.label}
							getOptionKey={(option) => option.value}
							isOptionEqualToValue={(option, value) => option.value === value.value}
							placeholder="Type"
						/>
					);
				},
			},
			{
				id: "noOfPackages",
				header: "No. of Packages",
				width: "0.9fr",
				minWidth: "100px",
				renderCell: ({ item }) =>
					canEdit ? (
						<NumberCell
							ariaLabel="No. of packages"
							value={item.noOfPackages}
							onChange={(value) => onLineChange(item.id, "noOfPackages", value)}
						/>
					) : (
						<span className="text-xs">{item.noOfPackages || "-"}</span>
					),
			},
			{
				id: "wtPerPackage",
				header: "Wt / Package (kg)",
				width: "0.9fr",
				minWidth: "100px",
				renderCell: ({ item }) =>
					canEdit ? (
						<NumberCell
							ariaLabel="Weight per package"
							value={item.wtPerPackage}
							onChange={(value) => onLineChange(item.id, "wtPerPackage", value)}
						/>
					) : (
						<span className="text-xs">{item.wtPerPackage || "-"}</span>
					),
			},
			{
				id: "weightKg",
				header: "Weight (kg)",
				width: "1fr",
				minWidth: "110px",
				renderCell: ({ item }) =>
					canEdit ? (
						<NumberCell
							ariaLabel="Weight in kg"
							value={item.weightKg}
							onChange={(value) => onLineChange(item.id, "weightKg", value)}
							caption={item.weightAutoFilled && item.weightKg ? "auto: packages × wt" : undefined}
						/>
					) : (
						<span className="text-xs">{item.weightKg || "-"}</span>
					),
				getTooltip: () => "Authoritative weight for stock. Auto-filled from packages × wt/package until you type it.",
			},
			{
				id: "ratePerQtl",
				header: "Rate / Qtl",
				width: "0.9fr",
				minWidth: "100px",
				renderCell: ({ item }) =>
					canEdit ? (
						<NumberCell
							ariaLabel="Rate per quintal"
							value={item.ratePerQtl}
							onChange={(value) => onLineChange(item.id, "ratePerQtl", value)}
						/>
					) : (
						<span className="text-xs">{item.ratePerQtl || "-"}</span>
					),
			},
			{
				id: "amount",
				header: "Amount",
				width: "1fr",
				minWidth: "100px",
				renderCell: ({ item }) => <span className="text-xs">{formatNumber(lineAmount(item))}</span>,
				getTooltip: () => "kg ÷ 100 × rate per quintal",
			},
			{
				id: "remarks",
				header: "Remarks",
				width: "1.4fr",
				minWidth: "140px",
				renderCell: ({ item }) =>
					canEdit ? (
						<TextField
							size="small"
							fullWidth
							value={item.remarks}
							onChange={(event) => onLineChange(item.id, "remarks", event.target.value)}
							inputProps={{ "aria-label": "Line remarks", maxLength: 500 }}
							sx={CELL_INPUT_SX}
						/>
					) : (
						<span className="text-xs">{item.remarks || "-"}</span>
					),
				getTooltip: ({ item }) => item.remarks || undefined,
			},
		],
		[canEdit, yarnItems, itemById, optionsForPackageType, onLineChange, onItemChange],
	);
}

export default useYarnPurchaseLineColumns;
