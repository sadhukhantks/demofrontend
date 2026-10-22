"use client";

/**
 * One small aggregated table of a breakdown dialog (ITM-027): a plain MUI
 * Table on desktop, one card per row on phones — never a DataGrid (a grid
 * inside a dialog or a CSS-hidden box has no width and MUI X throws). The
 * caller mounts ONE layout by passing `isPhone` from a `noSsr` media query.
 * Column definitions are plain functions of the row, so a null figure
 * prints "—" through the shared formatters and never 0.
 */

import React from "react";
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { SectionCard } from "../../../../juteProduction/report/dailyProductionReport/_components/DprPieces";

export interface BreakdownCol<T> {
	header: string;
	cell: (row: T) => string;
	/** Right-aligned figure. */
	num?: boolean;
	/** Bold on the phone card (the row's identity); defaults to the first column. */
	title?: boolean;
}

export interface BreakdownSectionProps<T> {
	title: string;
	subtitle?: string;
	rows: ReadonlyArray<T>;
	columns: ReadonlyArray<BreakdownCol<T>>;
	rowKey: (row: T, index: number) => string | number;
	isPhone: boolean;
	emptyText?: string;
	/** Rows visible before the table scrolls (desktop). */
	maxRows?: number;
}

export default function BreakdownSection<T>({
	title,
	subtitle,
	rows,
	columns,
	rowKey,
	isPhone,
	emptyText = "Nothing in this range.",
	maxRows = 12,
}: BreakdownSectionProps<T>) {
	const titleIdx = Math.max(
		0,
		columns.findIndex((c) => c.title),
	);
	return (
		<SectionCard title={title} subtitle={subtitle}>
			{rows.length === 0 ? (
				<Typography variant="body2" color="text.secondary">
					{emptyText}
				</Typography>
			) : isPhone ? (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					{rows.map((row, i) => (
						<Paper key={rowKey(row, i)} variant="outlined" sx={{ p: 1.25 }}>
							<Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
								{columns[titleIdx]?.cell(row) || "—"}
							</Typography>
							<Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 0.5 }}>
								{columns.map((c, ci) =>
									ci === titleIdx ? null : (
										<Box key={c.header} sx={{ minWidth: 0 }}>
											<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
												{c.header}
											</Typography>
											<Typography
												variant="body2"
												sx={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
											>
												{c.cell(row) || "—"}
											</Typography>
										</Box>
									),
								)}
							</Box>
						</Paper>
					))}
				</Box>
			) : (
				<TableContainer sx={{ overflowX: "auto", maxHeight: 40 + maxRows * 33 }}>
					<Table
						size="small"
						stickyHeader
						sx={{
							"& th": { fontWeight: 700, whiteSpace: "nowrap", bgcolor: "action.hover", py: 0.5 },
							"& td": { py: 0.4, whiteSpace: "nowrap" },
							"& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums" },
						}}
					>
						<TableHead>
							<TableRow>
								{columns.map((c) => (
									<TableCell key={c.header} className={c.num ? "num" : undefined}>
										{c.header}
									</TableCell>
								))}
							</TableRow>
						</TableHead>
						<TableBody>
							{rows.map((row, i) => (
								<TableRow key={rowKey(row, i)}>
									{columns.map((c) => (
										<TableCell key={c.header} className={c.num ? "num" : undefined}>
											{c.cell(row) || "—"}
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			)}
		</SectionCard>
	);
}
