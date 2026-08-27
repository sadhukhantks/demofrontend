"use client";

import * as React from "react";
import {
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Tooltip,
	Typography,
} from "@mui/material";
import type { GlFigureRowMst } from "@/utils/juteGainLossService";
import { fmt3, parseQty, statementFlagsLabel, type FigureDraft } from "../utils/sheetState";
import NumberCell from "./NumberCell";

interface FigureSectionTableProps {
	title: string;
	/** Master rows for this section, already filtered; order by display_order. */
	rows: GlFigureRowMst[];
	/** Drafts keyed by gl_row_id (superset is fine). */
	drafts: ReadonlyMap<number, FigureDraft>;
	disabled: boolean;
	onChange: (glRowId: number, field: "hess" | "sack", value: string) => void;
}

/**
 * One "Input Figures" / "Output Figures" table of the gain/loss sheet.
 * Rows come from the gl figure-row master; each row takes a Hessian and a
 * Sacking quantity (MT) and shows a computed row total plus a signed net
 * footer (calc_sign −1 rows subtract). Presentational only.
 */
export default function FigureSectionTable({
	title,
	rows,
	drafts,
	disabled,
	onChange,
}: FigureSectionTableProps) {
	const net = React.useMemo(() => {
		let hess = 0;
		let sack = 0;
		for (const row of rows) {
			const d = drafts.get(row.gl_row_id);
			if (!d) continue;
			hess += row.calc_sign * parseQty(d.hess);
			sack += row.calc_sign * parseQty(d.sack);
		}
		return { hess, sack };
	}, [rows, drafts]);

	return (
		<Paper variant="outlined" sx={{ overflow: "hidden" }}>
			<Typography variant="subtitle2" sx={{ px: 2, py: 1, bgcolor: "action.hover" }}>
				{title}
			</Typography>
			<TableContainer sx={{ overflowX: "auto" }}>
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell sx={{ minWidth: 220 }}>Particulars</TableCell>
							<TableCell align="right" sx={{ width: 140 }}>
								Hessian (MT)
							</TableCell>
							<TableCell align="right" sx={{ width: 140 }}>
								Sacking (MT)
							</TableCell>
							<TableCell align="right" sx={{ width: 120 }}>
								Total (MT)
							</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{rows.map((row) => {
							const d = drafts.get(row.gl_row_id);
							const hess = parseQty(d?.hess ?? "0");
							const sack = parseQty(d?.sack ?? "0");
							return (
								<TableRow key={row.gl_row_id}>
									<TableCell>
										<Tooltip title={statementFlagsLabel(row)} placement="top-start" arrow>
											<Typography variant="body2" component="span" sx={{ cursor: "default" }}>
												{row.calc_sign === -1 ? "Less :- " : ""}
												{row.row_name}
											</Typography>
										</Tooltip>
									</TableCell>
									<TableCell align="right">
										<NumberCell
											value={d?.hess ?? "0"}
											onChange={(v) => onChange(row.gl_row_id, "hess", v)}
											disabled={disabled}
											ariaLabel={`${row.row_name} Hessian MT`}
										/>
									</TableCell>
									<TableCell align="right">
										<NumberCell
											value={d?.sack ?? "0"}
											onChange={(v) => onChange(row.gl_row_id, "sack", v)}
											disabled={disabled}
											ariaLabel={`${row.row_name} Sacking MT`}
										/>
									</TableCell>
									<TableCell align="right">
										<Typography variant="body2">{fmt3(hess + sack)}</Typography>
									</TableCell>
								</TableRow>
							);
						})}
						<TableRow>
							<TableCell>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									Net (Add/Less applied)
								</Typography>
							</TableCell>
							<TableCell align="right">
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{fmt3(net.hess)}
								</Typography>
							</TableCell>
							<TableCell align="right">
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{fmt3(net.sack)}
								</Typography>
							</TableCell>
							<TableCell align="right">
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{fmt3(net.hess + net.sack)}
								</Typography>
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</TableContainer>
		</Paper>
	);
}
