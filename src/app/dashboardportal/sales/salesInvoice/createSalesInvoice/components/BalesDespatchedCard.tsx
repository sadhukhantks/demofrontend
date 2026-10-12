"use client";

import React from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import BaleSuggestPicker from "@/components/juteProduction/baleStock/BaleSuggestPicker";
import {
	formatKg,
	qualityTypeLabel,
	statusColor,
	statusLabel,
	todayISO,
} from "@/components/juteProduction/baleStock/baleStockCalc";
import { fetchBaleStockRows, type BaleStockRow } from "@/utils/baleStockService";
import { BALE_STOCK_PAGE_HREF, capDateToToday } from "../utils/salesInvoiceBales";

export interface BalesDespatchedCardProps {
	mode: "create" | "edit" | "view";
	coId: number;
	branchId: number;
	/** Invoice date (YYYY-MM-DD) — the as-on / despatch date, capped at today. */
	invoiceDate: string;
	/** Saved invoice id in edit / view mode; null while creating. */
	invoiceId: number | null;
	/** Create mode: controlled selection held by the page. */
	selectedIds: number[];
	onSelectionChange: (ids: number[], rows: BaleStockRow[]) => void;
	disabled: boolean;
}

const CARD_TITLE = "Bales despatched";
const CARD_SUBTITLE =
	"Pick the bales that leave on this invoice — enter the state and number of bales for a suggestion, then adjust";
const VOID_LINK_LABEL = "link void — invoice cancelled";

function balesCount(n: number): string {
	return `${n} ${n === 1 ? "bale" : "bales"}`;
}

/**
 * @component BalesDespatchedCard
 * @description "Bales despatched" card on the sales invoice (spec §7e). In
 * create mode it hosts the shared `BaleSuggestPicker` (purpose `despatch`,
 * as on the invoice date capped at today) and the page keeps the selection,
 * linking the bales right after the invoice is saved. In edit / view mode it
 * lists the bales already linked to the invoice read-only — a bale whose
 * status is no longer DESPATCHED is marked "link void — invoice cancelled" —
 * and points to Bale Stock & Inspection for any change.
 */
export default function BalesDespatchedCard({
	mode,
	coId,
	branchId,
	invoiceDate,
	invoiceId,
	selectedIds,
	onSelectionChange,
	disabled,
}: BalesDespatchedCardProps) {
	const asOn = React.useMemo(() => capDateToToday(invoiceDate), [invoiceDate]);

	const [linkedRows, setLinkedRows] = React.useState<BaleStockRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (mode === "create") return;
		if (!invoiceId || !coId || !branchId) {
			setLinkedRows([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		fetchBaleStockRows({ coId, branchId, asOn: todayISO(), status: "ALL", invoiceId })
			.then((result) => {
				if (cancelled) return;
				setLinkedRows(result.rows);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setLinkedRows([]);
				setError(err instanceof Error ? err.message : "Unable to load the linked bales.");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [mode, coId, branchId, invoiceId]);

	const linkedNetKg = React.useMemo(
		() => linkedRows.reduce((sum, row) => sum + (Number(row.net_wt) || 0), 0),
		[linkedRows],
	);

	const isCreate = mode === "create";
	const pickedCount = selectedIds.length;

	return (
		<Paper variant="outlined" sx={{ p: 2 }}>
			<Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
				<Box sx={{ minWidth: 0 }}>
					<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
						{CARD_TITLE}
					</Typography>
					<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
						{isCreate ? CARD_SUBTITLE : "Bales linked to this invoice"}
					</Typography>
				</Box>
				{isCreate ? (
					<Chip
						size="small"
						color={pickedCount > 0 ? "primary" : "default"}
						label={pickedCount === 0 ? "None picked" : `${balesCount(pickedCount)} picked`}
					/>
				) : (
					<Button
						component={Link}
						href={BALE_STOCK_PAGE_HREF}
						variant="outlined"
						size="small"
						sx={{ flexShrink: 0, textTransform: "none" }}
					>
						Change on Bale Stock &amp; Inspection
					</Button>
				)}
			</Box>

			{isCreate ? (
				<BaleSuggestPicker
					coId={coId}
					branchId={branchId}
					asOn={asOn}
					purpose="despatch"
					selectedIds={selectedIds}
					onSelectionChange={onSelectionChange}
					disabled={disabled}
					compact
				/>
			) : loading ? (
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
					<CircularProgress size={16} />
					<Typography variant="body2" color="text.secondary">
						Loading linked bales…
					</Typography>
				</Box>
			) : error ? (
				<Typography variant="body2" color="error">
					{error}
				</Typography>
			) : linkedRows.length === 0 ? (
				<Typography variant="body2" color="text.secondary">
					No bales linked to this invoice
				</Typography>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<Typography variant="body2" color="text.secondary">
						{balesCount(linkedRows.length)} linked · {formatKg(linkedNetKg)} kg net
					</Typography>
					<Table size="small" aria-label="Bales linked to this invoice">
						<TableHead>
							<TableRow>
								<TableCell>Series</TableCell>
								<TableCell align="right">Bale No</TableCell>
								<TableCell>Quality</TableCell>
								<TableCell align="right">Net kg</TableCell>
								<TableCell>Status</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{linkedRows.map((row) => (
								<TableRow key={row.bale_entry_id}>
									<TableCell>{row.series_name ?? `#${row.bale_series_id}`}</TableCell>
									<TableCell align="right">{row.bale_no}</TableCell>
									<TableCell>{row.item_name ?? qualityTypeLabel(row.quality_type)}</TableCell>
									<TableCell align="right">{formatKg(row.net_wt)}</TableCell>
									<TableCell>
										{row.status === "DESPATCHED" ? (
											<Chip size="small" label={statusLabel(row.status)} color={statusColor(row.status)} />
										) : (
											<Chip size="small" label={VOID_LINK_LABEL} color="warning" variant="outlined" />
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Box>
			)}
		</Paper>
	);
}
