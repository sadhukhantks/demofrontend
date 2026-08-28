"use client";

import * as React from "react";
import {
	Autocomplete,
	Box,
	Button,
	IconButton,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from "@mui/material";
import { Plus as AddIcon, Trash2 as Trash2Icon } from "lucide-react";
import type { GlProdStatement, GlQualityType } from "@/utils/juteGainLossService";
import { fmt3, parseQty, type ProdDraft } from "../utils/sheetState";
import NumberCell from "./NumberCell";

interface ProductionSectionProps {
	title: string;
	statement: GlProdStatement;
	/** All production drafts; the component filters by its own statement. */
	drafts: ProdDraft[];
	/** Quality-name suggestions grouped by quality type (1 Hessian, 2 Sacking). */
	suggestions: Readonly<Record<GlQualityType, string[]>>;
	disabled: boolean;
	onAdd: (statement: GlProdStatement, qualityType: GlQualityType) => void;
	onRemove: (uid: number) => void;
	onChange: (uid: number, field: "quality_name" | "qty", value: string) => void;
}

const GROUPS: { qualityType: GlQualityType; label: string }[] = [
	{ qualityType: 1, label: "Hessian" },
	{ qualityType: 2, label: "Sacking" },
];

/**
 * Quality-wise production block (used for both FNG "Packed Production" and
 * WVG "Weaving Production"). Two groups — Hessian and Sacking — each with
 * add/remove rows of (quality name, qty MT). Quality name is a freeSolo
 * Autocomplete: suggestions come from the tenant master but any typed name
 * is accepted. Presentational only.
 */
export default function ProductionSection({
	title,
	statement,
	drafts,
	suggestions,
	disabled,
	onAdd,
	onRemove,
	onChange,
}: ProductionSectionProps) {
	return (
		<Paper variant="outlined" sx={{ overflow: "hidden" }}>
			<Typography variant="subtitle2" sx={{ px: 2, py: 1, bgcolor: "action.hover" }}>
				{title}
			</Typography>
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
					gap: 2,
					p: 2,
				}}
			>
				{GROUPS.map((group) => {
					const rows = drafts.filter(
						(d) => d.statement === statement && d.quality_type === group.qualityType,
					);
					const total = rows.reduce((acc, r) => acc + parseQty(r.qty), 0);
					return (
						<Box key={group.qualityType}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
								<Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
									{group.label}
								</Typography>
								<Button
									size="small"
									startIcon={<AddIcon size={16} />}
									disabled={disabled}
									onClick={() => onAdd(statement, group.qualityType)}
								>
									Add quality
								</Button>
							</Box>
							<TableContainer sx={{ overflowX: "auto" }}>
								<Table size="small">
									<TableHead>
										<TableRow>
											<TableCell>Quality</TableCell>
											<TableCell align="right" sx={{ width: 140 }}>
												Qty (MT)
											</TableCell>
											<TableCell sx={{ width: 48 }} />
										</TableRow>
									</TableHead>
									<TableBody>
										{rows.length === 0 ? (
											<TableRow>
												<TableCell colSpan={3}>
													<Typography variant="caption" color="text.secondary">
														No {group.label.toLowerCase()} qualities added.
													</Typography>
												</TableCell>
											</TableRow>
										) : (
											rows.map((row) => (
												<TableRow key={row.uid}>
													<TableCell>
														<Autocomplete
															freeSolo
															options={suggestions[group.qualityType] ?? []}
															inputValue={row.quality_name}
															onInputChange={(_, next) =>
																onChange(row.uid, "quality_name", next)
															}
															disabled={disabled}
															size="small"
															renderInput={(params) => (
																<TextField
																	{...params}
																	placeholder="Quality name"
																	inputProps={{
																		...params.inputProps,
																		maxLength: 100,
																		"aria-label": `${title} ${group.label} quality name`,
																	}}
																/>
															)}
														/>
													</TableCell>
													<TableCell align="right">
														<NumberCell
															value={row.qty}
															onChange={(v) => onChange(row.uid, "qty", v)}
															disabled={disabled}
															ariaLabel={`${title} ${group.label} quantity MT`}
														/>
													</TableCell>
													<TableCell align="center">
														<IconButton
															size="small"
															aria-label="Remove quality row"
															disabled={disabled}
															onClick={() => onRemove(row.uid)}
														>
															<Trash2Icon size={16} />
														</IconButton>
													</TableCell>
												</TableRow>
											))
										)}
										<TableRow>
											<TableCell>
												<Typography variant="body2" sx={{ fontWeight: 600 }}>
													Total {group.label}
												</Typography>
											</TableCell>
											<TableCell align="right">
												<Typography variant="body2" sx={{ fontWeight: 600 }}>
													{fmt3(total)}
												</Typography>
											</TableCell>
											<TableCell />
										</TableRow>
									</TableBody>
								</Table>
							</TableContainer>
						</Box>
					);
				})}
			</Box>
		</Paper>
	);
}
