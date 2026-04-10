"use client";

import * as React from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Paper,
	Typography,
	Radio,
	Chip,
	Box,
} from "@mui/material";
import type {
	EnquiryDetailItem,
	ComparisonResponseDetail,
	ComparisonItemDetail,
} from "../../createEnquiry/types/enquiryTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComparisonTableProps {
	items: EnquiryDetailItem[];
	responses: ComparisonResponseDetail[];
	selectedResponseId: number | null;
	onSelectResponse: (responseId: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (value: number | null | undefined): string => {
	if (value == null) return "-";
	return value.toLocaleString("en-IN", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
};

/**
 * Find the response item for a given enquiry detail item within a response.
 */
const findResponseItem = (
	response: ComparisonResponseDetail,
	enquiryDtlId: number,
): ComparisonItemDetail | undefined =>
	response.items.find((i) => i.enquiry_dtl_id === enquiryDtlId);

/**
 * Compute totals for a single response.
 */
const computeResponseTotals = (response: ComparisonResponseDetail) => {
	let totalGross = 0;
	let totalNet = 0;
	for (const item of response.items) {
		totalGross += item.gross_amount ?? 0;
		totalNet += item.net_amount ?? 0;
	}
	return { totalGross, totalNet };
};

/**
 * Find the lowest net amount per item across responses (for highlighting).
 */
const findLowestNetPerItem = (
	items: EnquiryDetailItem[],
	responses: ComparisonResponseDetail[],
): Map<number, number> => {
	const lowestMap = new Map<number, number>();
	for (const enquiryItem of items) {
		let lowest = Infinity;
		for (const response of responses) {
			const rItem = findResponseItem(response, enquiryItem.enquiry_dtl_id);
			if (rItem?.net_amount != null && rItem.net_amount < lowest) {
				lowest = rItem.net_amount;
			}
		}
		if (lowest !== Infinity) {
			lowestMap.set(enquiryItem.enquiry_dtl_id, lowest);
		}
	}
	return lowestMap;
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEADER_SX = {
	fontWeight: 600,
	whiteSpace: "nowrap" as const,
	fontSize: "0.8125rem",
};

const CELL_SX = {
	py: 0.75,
	px: 1,
	borderRight: "1px solid",
	borderColor: "divider",
};

const STICKY_CELL_SX = {
	...CELL_SX,
	position: "sticky" as const,
	left: 0,
	backgroundColor: "background.paper",
	zIndex: 2,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Side-by-side comparison table for all supplier responses for a price enquiry.
 *
 * - Rows correspond to enquiry items.
 * - Each supplier response gets its own column group showing rate, discount, and net.
 * - The lowest net amount per item is highlighted in green.
 * - A radio button in the header row enables selecting the winning quote.
 */
const ComparisonTable: React.FC<ComparisonTableProps> = ({
	items,
	responses,
	selectedResponseId,
	onSelectResponse,
}) => {
	const lowestNetMap = React.useMemo(
		() => findLowestNetPerItem(items, responses),
		[items, responses],
	);

	const responseTotals = React.useMemo(
		() => responses.map((r) => computeResponseTotals(r)),
		[responses],
	);

	const lowestTotalNet = React.useMemo(() => {
		let lowest = Infinity;
		for (const t of responseTotals) {
			if (t.totalNet < lowest) lowest = t.totalNet;
		}
		return lowest === Infinity ? null : lowest;
	}, [responseTotals]);

	if (responses.length === 0) {
		return (
			<Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
				No supplier responses to compare.
			</Typography>
		);
	}

	return (
		<TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
			<Table size="small" stickyHeader>
				{/* Header: Item info + one column group per supplier */}
				<TableHead>
					{/* Top row: supplier names with radio */}
					<TableRow>
						<TableCell sx={{ ...STICKY_CELL_SX, zIndex: 3, minWidth: 200 }} colSpan={4}>
							<Typography sx={HEADER_SX}>Item Details</Typography>
						</TableCell>
						{responses.map((resp) => (
							<TableCell
								key={resp.proc_price_enquiry_response_id}
								colSpan={3}
								align="center"
								sx={{
									...CELL_SX,
									backgroundColor: selectedResponseId === resp.proc_price_enquiry_response_id
										? "primary.50"
										: "action.hover",
								}}
							>
								<Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
									<Radio
										size="small"
										checked={selectedResponseId === resp.proc_price_enquiry_response_id}
										onChange={() => onSelectResponse(resp.proc_price_enquiry_response_id)}
									/>
									<Typography sx={HEADER_SX}>{resp.supp_name}</Typography>
									{resp.is_selected === 1 && (
										<Chip size="small" label="Selected" color="success" sx={{ ml: 0.5 }} />
									)}
								</Box>
							</TableCell>
						))}
					</TableRow>

					{/* Sub-header: column labels */}
					<TableRow>
						<TableCell sx={{ ...STICKY_CELL_SX, zIndex: 3 }}>
							<Typography sx={HEADER_SX}>Code</Typography>
						</TableCell>
						<TableCell sx={STICKY_CELL_SX}>
							<Typography sx={HEADER_SX}>Item Name</Typography>
						</TableCell>
						<TableCell sx={STICKY_CELL_SX}>
							<Typography sx={HEADER_SX}>UOM</Typography>
						</TableCell>
						<TableCell sx={STICKY_CELL_SX} align="right">
							<Typography sx={HEADER_SX}>Qty</Typography>
						</TableCell>
						{responses.map((resp) => (
							<React.Fragment key={`sub-${resp.proc_price_enquiry_response_id}`}>
								<TableCell sx={CELL_SX} align="right">
									<Typography sx={HEADER_SX}>Rate</Typography>
								</TableCell>
								<TableCell sx={CELL_SX} align="right">
									<Typography sx={HEADER_SX}>Discount</Typography>
								</TableCell>
								<TableCell sx={CELL_SX} align="right">
									<Typography sx={HEADER_SX}>Net Amt</Typography>
								</TableCell>
							</React.Fragment>
						))}
					</TableRow>
				</TableHead>

				<TableBody>
					{/* Item rows */}
					{items.map((item) => (
						<TableRow key={item.enquiry_dtl_id} hover>
							<TableCell sx={STICKY_CELL_SX}>
								<Typography variant="body2">{item.item_code}</Typography>
							</TableCell>
							<TableCell sx={{ ...STICKY_CELL_SX, left: "auto" }}>
								<Typography variant="body2">{item.item_name}</Typography>
							</TableCell>
							<TableCell sx={{ ...STICKY_CELL_SX, left: "auto" }}>
								<Typography variant="body2">{item.uom_name}</Typography>
							</TableCell>
							<TableCell sx={{ ...STICKY_CELL_SX, left: "auto" }} align="right">
								<Typography variant="body2">{item.qty}</Typography>
							</TableCell>

							{responses.map((resp) => {
								const rItem = findResponseItem(resp, item.enquiry_dtl_id);
								const isLowest =
									rItem?.net_amount != null &&
									lowestNetMap.get(item.enquiry_dtl_id) === rItem.net_amount;

								return (
									<React.Fragment key={`cell-${resp.proc_price_enquiry_response_id}-${item.enquiry_dtl_id}`}>
										<TableCell sx={CELL_SX} align="right">
											<Typography variant="body2">
												{formatCurrency(rItem?.rate)}
											</Typography>
										</TableCell>
										<TableCell sx={CELL_SX} align="right">
											<Typography variant="body2">
												{formatCurrency(rItem?.discount_amount)}
											</Typography>
										</TableCell>
										<TableCell
											sx={{
												...CELL_SX,
												backgroundColor: isLowest ? "success.50" : undefined,
											}}
											align="right"
										>
											<Typography
												variant="body2"
												fontWeight={isLowest ? 700 : 400}
												color={isLowest ? "success.main" : undefined}
											>
												{formatCurrency(rItem?.net_amount)}
											</Typography>
										</TableCell>
									</React.Fragment>
								);
							})}
						</TableRow>
					))}

					{/* Totals row */}
					<TableRow sx={{ backgroundColor: "action.selected" }}>
						<TableCell sx={STICKY_CELL_SX} colSpan={4} align="right">
							<Typography variant="body2" fontWeight={700}>
								Totals
							</Typography>
						</TableCell>
						{responses.map((resp, idx) => {
							const totals = responseTotals[idx];
							const isLowestTotal = lowestTotalNet != null && totals.totalNet === lowestTotalNet;

							return (
								<React.Fragment key={`total-${resp.proc_price_enquiry_response_id}`}>
									<TableCell sx={CELL_SX} align="right">
										<Typography variant="body2" fontWeight={700}>
											{formatCurrency(totals.totalGross)}
										</Typography>
									</TableCell>
									<TableCell sx={CELL_SX} align="right">
										{/* Discount total column */}
										<Typography variant="body2" fontWeight={700}>-</Typography>
									</TableCell>
									<TableCell
										sx={{
											...CELL_SX,
											backgroundColor: isLowestTotal ? "success.50" : undefined,
										}}
										align="right"
									>
										<Typography
											variant="body2"
											fontWeight={700}
											color={isLowestTotal ? "success.main" : undefined}
										>
											{formatCurrency(totals.totalNet)}
										</Typography>
									</TableCell>
								</React.Fragment>
							);
						})}
					</TableRow>
				</TableBody>
			</Table>
		</TableContainer>
	);
};

export default ComparisonTable;
export type { ComparisonTableProps };
