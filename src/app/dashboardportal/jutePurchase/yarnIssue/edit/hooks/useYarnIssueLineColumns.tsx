/**
 * @file useYarnIssueLineColumns.tsx
 * @description Column definitions for the Yarn Issue line grid
 * (`TransactionLineItems`). The purchase lot is the driving pick (a
 * `SearchableSelect`, bare variant, listed oldest first = FIFO); the item follows
 * from it and is read-only. A balance column shows what the lot still has for
 * this line once the document's other lines on the same lot are counted.
 */
import * as React from "react";
import { Box, TextField, Typography } from "@mui/material";
import type { TransactionLineColumn } from "@/components/ui/transaction";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { YarnIssueLot, YarnIssueType } from "@/utils/yarnIssueService";
import type { EditableLineField, EditableYarnIssueLine, LineBalance } from "../types/yarnIssueTypes";
import { lotOptionFromLine } from "../utils/yarnIssueMappers";
import { formatDisplayDate, formatNumber } from "../../utils/yarnIssueFormat";
import { YARN_ISSUE_TYPES } from "../../utils/yarnIssueConstants";

type UseYarnIssueLineColumnsParams = {
	canEdit: boolean;
	issueType: YarnIssueType | null;
	/** Lot options for the current type (+ department for RETURN), oldest first. */
	lots: ReadonlyArray<YarnIssueLot>;
	lotsLoading: boolean;
	/** Per-line balance picture keyed by line id (see `computeLineBalances`). */
	balances: ReadonlyMap<string, LineBalance>;
	/** Zod line errors keyed by line id → field → message. */
	lineErrors: ReadonlyMap<string, Record<string, string>>;
	onLineChange: (id: string, field: EditableLineField, value: string) => void;
	onLotChange: (id: string, lot: YarnIssueLot | null) => void;
};

/**
 * `PUR-24/25-0012 · 01 Sep 2026 · 13 LBS SKWP · bal 600.00 kg` for ISSUE,
 * `… · floor 150.00 kg` for RETURN.
 */
export const lotLabel = (lot: YarnIssueLot, issueType: YarnIssueType | null): string => {
	const head = `PUR-${lot.purchase_no ?? `#${lot.yarn_purchase_id || lot.yarn_purchase_li_id}`} · ${formatDisplayDate(lot.tran_date)} · ${lot.item_name}`;
	return issueType === YARN_ISSUE_TYPES.RETURN
		? `${head} · floor ${formatNumber(lot.floor_bal_kg ?? null, 0)} kg`
		: `${head} · bal ${formatNumber(lot.bal_kg, 0)} kg`;
};

const CELL_INPUT_SX = { "& .MuiInputBase-input": { fontSize: "0.75rem", py: 0.5 } } as const;

type NumberCellProps = {
	value: string;
	onChange: (value: string) => void;
	caption?: string;
	captionColor?: string;
	error?: boolean;
	ariaLabel: string;
	/** HTML step; weight uses "1" (whole kg). */
	step?: string;
};

function NumberCell({ value, onChange, caption, captionColor = "text.secondary", error = false, ariaLabel , step = "0.01" }: NumberCellProps) {
	return (
		<Box>
			<TextField
				type="number"
				size="small"
				fullWidth
				error={error}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				inputProps={{ min: 0, step, "aria-label": ariaLabel }}
				sx={CELL_INPUT_SX}
			/>
			{caption ? (
				<Typography variant="caption" color={captionColor} sx={{ display: "block", lineHeight: 1.2 }}>
					{caption}
				</Typography>
			) : null}
		</Box>
	);
}

/** Text + colour for the balance cell of one line. */
const describeBalance = (balance: LineBalance | undefined, issueType: YarnIssueType | null): { text: string; color: string } => {
	if (!balance || balance.available == null) return { text: "-", color: "text.secondary" };
	if (balance.overBy > 0) {
		return issueType === YARN_ISSUE_TYPES.RETURN
			? { text: `${formatNumber(balance.available, 0)} kg · over floor by ${formatNumber(balance.overBy, 0)} kg`, color: "warning.main" }
			: { text: `${formatNumber(balance.available, 0)} kg · over by ${formatNumber(balance.overBy, 0)} kg`, color: "error.main" };
	}
	return { text: `${formatNumber(balance.available, 0)} kg`, color: "text.primary" };
};

export function useYarnIssueLineColumns({
	canEdit,
	issueType,
	lots,
	lotsLoading,
	balances,
	lineErrors,
	onLineChange,
	onLotChange,
}: UseYarnIssueLineColumnsParams): TransactionLineColumn<EditableYarnIssueLine>[] {
	const lotById = React.useMemo(() => new Map(lots.map((lot) => [lot.yarn_purchase_li_id, lot])), [lots]);

	/** Options for one line — includes the stored lot when the picker no longer lists it. */
	const optionsForLine = React.useCallback(
		(line: EditableYarnIssueLine): { options: ReadonlyArray<YarnIssueLot>; selected: YarnIssueLot | null } => {
			if (line.yarnPurchaseLiId == null) return { options: lots, selected: null };
			const fromList = lotById.get(line.yarnPurchaseLiId);
			if (fromList) return { options: lots, selected: fromList };
			const standIn = lotOptionFromLine(line);
			return { options: standIn ? [standIn, ...lots] : lots, selected: standIn };
		},
		[lots, lotById],
	);

	const balanceHeader = issueType === YARN_ISSUE_TYPES.RETURN ? "Floor Balance" : "Godown Balance";

	return React.useMemo<TransactionLineColumn<EditableYarnIssueLine>[]>(
		() => [
			{
				id: "lot",
				header: "Purchase Lot",
				width: "2.6fr",
				minWidth: "280px",
				renderCell: ({ item }) => {
					const { options, selected } = optionsForLine(item);
					if (!canEdit) {
						return <span className="text-xs">{selected ? lotLabel(selected, issueType) : item.yarnPurchaseLiId ?? "-"}</span>;
					}
					const lotError = lineErrors.get(item.id)?.yarn_purchase_li_id;
					return (
						<SearchableSelect<YarnIssueLot>
							options={options}
							value={selected}
							onChange={(option) => onLotChange(item.id, option)}
							getOptionLabel={(option) => lotLabel(option, issueType)}
							getOptionKey={(option) => String(option.yarn_purchase_li_id)}
							isOptionEqualToValue={(option, value) => option.yarn_purchase_li_id === value.yarn_purchase_li_id}
							placeholder={issueType == null ? "Pick the type first" : issueType === YARN_ISSUE_TYPES.RETURN && lots.length === 0 && !lotsLoading ? "Pick a department first" : "Select lot (oldest first)"}
							loading={lotsLoading}
							error={Boolean(lotError)}
							noOptionsText={lotsLoading ? "Loading lots..." : "No lots with a balance"}
						/>
					);
				},
				getTooltip: ({ item }) => {
					const { selected } = optionsForLine(item);
					if (!selected) return "Lots are listed oldest first (FIFO). Pick the lot the yarn physically comes from.";
					const supplier = selected.supp_name ? ` · ${selected.supp_name}` : "";
					return `${lotLabel(selected, issueType)}${supplier}`;
				},
			},
			{
				id: "item",
				header: "Yarn Item",
				width: "1.4fr",
				minWidth: "150px",
				renderCell: ({ item }) => {
					const { selected } = optionsForLine(item);
					const name = selected?.item_name ?? item.itemName;
					return <span className="text-xs">{name || (item.itemId != null ? String(item.itemId) : "-")}</span>;
				},
				getTooltip: () => "Follows the chosen lot.",
			},
			{
				id: "balance",
				header: balanceHeader,
				width: "1.3fr",
				minWidth: "150px",
				renderCell: ({ item }) => {
					const { text, color } = describeBalance(balances.get(item.id), issueType);
					return (
						<Typography component="span" variant="caption" sx={{ color, fontWeight: color === "text.primary" ? 400 : 600 }}>
							{text}
						</Typography>
					);
				},
				getTooltip: ({ item }) => {
					const balance = balances.get(item.id);
					if (!balance || balance.lotBalance == null) return "Available once a lot is chosen.";
					const other = balance.usedByOtherLines > 0 ? ` minus ${formatNumber(balance.usedByOtherLines, 0)} kg on other lines of this document` : "";
					return `Lot balance ${formatNumber(balance.lotBalance, 0)} kg${other}.`;
				},
			},
			{
				id: "noOfPackages",
				header: "Packages",
				width: "0.8fr",
				minWidth: "90px",
				renderCell: ({ item }) =>
					canEdit ? (
						<NumberCell
							ariaLabel="No. of packages"
							value={item.noOfPackages}
							onChange={(value) => onLineChange(item.id, "noOfPackages", value)}
							error={Boolean(lineErrors.get(item.id)?.no_of_packages)}
						/>
					) : (
						<span className="text-xs">{item.noOfPackages || "-"}</span>
					),
			},
			{
				id: "weightKg",
				header: "Weight (kg)",
				width: "1fr",
				minWidth: "110px",
				renderCell: ({ item }) => {
					if (!canEdit) return <span className="text-xs">{item.weightKg || "-"}</span>;
					const balance = balances.get(item.id);
					const over = balance != null && balance.overBy > 0;
					const zodError = lineErrors.get(item.id)?.weight_kg;
					const hardOver = over && issueType !== YARN_ISSUE_TYPES.RETURN;
					return (
						<NumberCell
							ariaLabel="Weight in kg"
							step="1"
							value={item.weightKg}
							onChange={(value) => onLineChange(item.id, "weightKg", value)}
							error={Boolean(zodError) || hardOver}
							caption={over ? (hardOver ? "exceeds lot balance" : "over floor balance (backend warns)") : undefined}
							captionColor={hardOver ? "error.main" : "warning.main"}
						/>
					);
				},
				getTooltip: () => "Authoritative weight for stock, in kilograms.",
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
		[canEdit, issueType, lots, lotsLoading, balances, lineErrors, optionsForLine, balanceHeader, onLineChange, onLotChange],
	);
}

export default useYarnIssueLineColumns;
