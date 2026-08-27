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
	Typography,
} from "@mui/material";
import type { GlDeptMst } from "@/utils/juteGainLossService";
import { fmt3, parseQty, type StockDraft } from "../utils/sheetState";
import NumberCell from "./NumberCell";

interface ProcessStockSectionProps {
	/** Department master rows, order by display_order. */
	departments: GlDeptMst[];
	/** Drafts keyed by gl_dept_id. */
	drafts: ReadonlyMap<number, StockDraft>;
	/** True when opening comes from the previous month's closing (read-only). */
	openingFromPrev: boolean;
	disabled: boolean;
	onChange: (
		glDeptId: number,
		field: "opening_hess" | "opening_sack" | "closing_hess" | "closing_sack",
		value: string,
	) => void;
}

const FIELDS = [
	{ field: "opening_hess", label: "Opening Hess" },
	{ field: "opening_sack", label: "Opening Sack" },
	{ field: "closing_hess", label: "Closing Hess" },
	{ field: "closing_sack", label: "Closing Sack" },
] as const;

/**
 * "Process Stock (Month End)" table — one row per gl department with
 * opening/closing Hessian & Sacking MT plus a computed totals row. When the
 * previous month's sheet exists, opening cells are read-only (they mirror
 * that sheet's closing). Presentational only.
 */
export default function ProcessStockSection({
	departments,
	drafts,
	openingFromPrev,
	disabled,
	onChange,
}: ProcessStockSectionProps) {
	const totals = React.useMemo(() => {
		const t = { opening_hess: 0, opening_sack: 0, closing_hess: 0, closing_sack: 0 };
		for (const dept of departments) {
			const d = drafts.get(dept.gl_dept_id);
			if (!d) continue;
			t.opening_hess += parseQty(d.opening_hess);
			t.opening_sack += parseQty(d.opening_sack);
			t.closing_hess += parseQty(d.closing_hess);
			t.closing_sack += parseQty(d.closing_sack);
		}
		return t;
	}, [departments, drafts]);

	return (
		<Paper variant="outlined" sx={{ overflow: "hidden" }}>
			<Typography variant="subtitle2" sx={{ px: 2, py: 1, bgcolor: "action.hover" }}>
				Process Stock (Month End)
			</Typography>
			{openingFromPrev ? (
				<Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: "block" }}>
					Opening figures come from the previous month&apos;s closing and cannot be edited here.
				</Typography>
			) : (
				<Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, display: "block" }}>
					No previous month sheet found — enter the opening figures manually.
				</Typography>
			)}
			<TableContainer sx={{ overflowX: "auto" }}>
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell sx={{ minWidth: 180 }}>Department</TableCell>
							{FIELDS.map((f) => (
								<TableCell key={f.field} align="right" sx={{ width: 130 }}>
									{f.label} (MT)
								</TableCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{departments.map((dept) => {
							const d = drafts.get(dept.gl_dept_id);
							return (
								<TableRow key={dept.gl_dept_id}>
									<TableCell>
										<Typography variant="body2">{dept.dept_name}</Typography>
									</TableCell>
									{FIELDS.map((f) => {
										const isOpening = f.field === "opening_hess" || f.field === "opening_sack";
										const readOnly = isOpening && openingFromPrev;
										const value = d?.[f.field] ?? "0";
										return (
											<TableCell key={f.field} align="right">
												{readOnly ? (
													<Typography variant="body2" color="text.secondary">
														{fmt3(parseQty(value))}
													</Typography>
												) : (
													<NumberCell
														value={value}
														onChange={(v) => onChange(dept.gl_dept_id, f.field, v)}
														disabled={disabled}
														ariaLabel={`${dept.dept_name} ${f.label} MT`}
													/>
												)}
											</TableCell>
										);
									})}
								</TableRow>
							);
						})}
						<TableRow>
							<TableCell>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									Total
								</Typography>
							</TableCell>
							{FIELDS.map((f) => (
								<TableCell key={f.field} align="right">
									<Typography variant="body2" sx={{ fontWeight: 600 }}>
										{fmt3(totals[f.field])}
									</Typography>
								</TableCell>
							))}
						</TableRow>
					</TableBody>
				</Table>
			</TableContainer>
		</Paper>
	);
}
