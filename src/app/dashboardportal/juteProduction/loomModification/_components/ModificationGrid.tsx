"use client";

import * as React from "react";
import Link from "next/link";
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	IconButton,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { DataGrid, type GridColDef, type GridPaginationModel } from "@mui/x-data-grid";
import {
	ChartColumn as ImpactIcon,
	CornerDownRight as FollowUpIcon,
	ListPlus as AddLoomsIcon,
	EllipsisVertical as MoreIcon,
	Pencil as EditIcon,
	Rewind as InsertEarlierIcon,
	Trash2 as TrashIcon,
	Unlink as DeleteChainIcon,
} from "lucide-react";
import {
	CardStat,
	DESKTOP_ONLY_SX,
	MOBILE_ONLY_SX,
	TOUCH_ICON_BUTTON_SX,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
import type { ModificationRow } from "@/utils/loomModificationService";
import {
	MOD_KIND_INITIAL,
	MOD_KIND_REVERSAL,
	dataCheckIsRed,
	formatAmount,
	impactReportHref,
	scopeText,
	followUpCount,
	rowHasChildren,
	stageText,
} from "../types/modificationTypes";

export interface ModificationGridProps {
	rows: ReadonlyArray<ModificationRow>;
	total: number;
	loading: boolean;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	onEdit: (row: ModificationRow) => void;
	onDelete: (row: ModificationRow) => void;
	onDeleteChain: (row: ModificationRow) => void;
	onInsertEarlier: (row: ModificationRow) => void;
	onAddLooms: (row: ModificationRow) => void;
	onAddFollowUp: (row: ModificationRow) => void;
	/** Locks the row actions while a save or delete is in flight. */
	busy?: boolean;
}

/** Wire rows carry `children_count`; the service derives `has_children` from it. */
function hasChildren(row: ModificationRow): boolean {
	return rowHasChildren(row);
}

function followUpsText(row: ModificationRow): string {
	const n = followUpCount(row);
	return `has ${n} follow-up${n === 1 ? "" : "s"}`;
}

function isRoot(row: ModificationRow): boolean {
	return row.parent_modification_id === null;
}

function kindColor(kind: string): "primary" | "default" | "warning" | "error" {
	if (kind === MOD_KIND_INITIAL) return "primary";
	if (kind === MOD_KIND_REVERSAL) return "error";
	if (kind === "RECTIFY") return "warning";
	return "default";
}

function dataCheckLabel(row: ModificationRow): string {
	if (!row.data_check) return "—";
	return `${row.data_check.before_days} / ${row.data_check.after_days}`;
}

function dateText(row: ModificationRow): string {
	return row.mod_to_date && row.mod_to_date !== row.mod_date
		? `${row.mod_date} → ${row.mod_to_date}`
		: row.mod_date;
}

/** Everything a row offers beyond Edit / Delete, behind a "more" menu. */
function RowMenu({
	row,
	busy,
	onDeleteChain,
	onInsertEarlier,
	onAddLooms,
	onAddFollowUp,
}: {
	row: ModificationRow;
	busy: boolean;
	onDeleteChain: (row: ModificationRow) => void;
	onInsertEarlier: (row: ModificationRow) => void;
	onAddLooms: (row: ModificationRow) => void;
	onAddFollowUp: (row: ModificationRow) => void;
}) {
	const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
	const close = () => setAnchor(null);
	const root = isRoot(row);
	return (
		<>
			<Tooltip title="More actions">
				<span>
					<IconButton
						size="small"
						aria-label="More actions"
						disabled={busy}
						onClick={(e) => setAnchor(e.currentTarget)}
						sx={{ minWidth: 40, minHeight: 40 }}
					>
						<MoreIcon size={16} />
					</IconButton>
				</span>
			</Tooltip>
			<Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
				<MenuItem
					onClick={() => {
						close();
						onAddFollowUp(row);
					}}
					disabled={row.mod_kind === MOD_KIND_REVERSAL}
				>
					<ListItemIcon>
						<FollowUpIcon size={16} />
					</ListItemIcon>
					<ListItemText>Add follow-up</ListItemText>
				</MenuItem>
				<MenuItem
					onClick={() => {
						close();
						onAddLooms(row);
					}}
				>
					<ListItemIcon>
						<AddLoomsIcon size={16} />
					</ListItemIcon>
					<ListItemText>Add looms to this stage</ListItemText>
				</MenuItem>
				{root ? (
					<MenuItem
						onClick={() => {
							close();
							onInsertEarlier(row);
						}}
					>
						<ListItemIcon>
							<InsertEarlierIcon size={16} />
						</ListItemIcon>
						<ListItemText>Insert earlier stage</ListItemText>
					</MenuItem>
				) : null}
				<MenuItem component={Link} href={impactReportHref(row.modification_id)} onClick={close}>
					<ListItemIcon>
						<ImpactIcon size={16} />
					</ListItemIcon>
					<ListItemText>View impact</ListItemText>
				</MenuItem>
				{root && hasChildren(row) ? (
					<MenuItem
						onClick={() => {
							close();
							onDeleteChain(row);
						}}
						sx={{ color: "error.main" }}
					>
						<ListItemIcon sx={{ color: "inherit" }}>
							<DeleteChainIcon size={16} />
						</ListItemIcon>
						<ListItemText>Delete chain ({row.stage_count} stages)</ListItemText>
					</MenuItem>
				) : null}
			</Menu>
		</>
	);
}

/**
 * The modification register (§6.2). Server-paginated like the overhaul grid;
 * below `md` the DataGrid becomes a card list of the SAME `rows` prop, swapped by
 * CSS so the server and first client render agree.
 *
 * The data-check chip carries the producing loom-days found 90 days before / after
 * the event for its looms and turns red when a side is 0 — the same figure the save
 * snackbar prints, so an entry inside a data hole is visible in the list too.
 */
export default function ModificationGrid({
	rows,
	total,
	loading,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
	onEdit,
	onDelete,
	onDeleteChain,
	onInsertEarlier,
	onAddLooms,
	onAddFollowUp,
	busy = false,
}: ModificationGridProps) {
	const paginationModel = React.useMemo<GridPaginationModel>(
		() => ({ page: page - 1, pageSize }),
		[page, pageSize],
	);

	const handlePaginationChange = React.useCallback(
		(model: GridPaginationModel) => {
			if (model.pageSize !== pageSize) onPageSizeChange(model.pageSize);
			if (model.page + 1 !== page) onPageChange(model.page + 1);
		},
		[page, pageSize, onPageChange, onPageSizeChange],
	);

	const columns = React.useMemo<GridColDef<ModificationRow>[]>(
		() => [
			{
				field: "actions",
				headerName: "",
				width: 136,
				sortable: false,
				filterable: false,
				renderCell: (params) => {
					const children = hasChildren(params.row);
					return (
						<Box sx={{ display: "flex" }}>
							<Tooltip title="Edit">
								<span>
									<IconButton
										size="small"
										color="primary"
										disabled={busy}
										onClick={() => onEdit(params.row)}
										sx={{ minWidth: 40, minHeight: 40 }}
									>
										<EditIcon size={16} />
									</IconButton>
								</span>
							</Tooltip>
							<Tooltip
								title={children ? followUpsText(params.row) : "Delete"}
							>
								<span>
									<IconButton
										size="small"
										color="error"
										disabled={busy || children}
										onClick={() => onDelete(params.row)}
										sx={{ minWidth: 40, minHeight: 40 }}
									>
										<TrashIcon size={16} />
									</IconButton>
								</span>
							</Tooltip>
							<RowMenu
								row={params.row}
								busy={busy}
								onDeleteChain={onDeleteChain}
								onInsertEarlier={onInsertEarlier}
								onAddLooms={onAddLooms}
								onAddFollowUp={onAddFollowUp}
							/>
						</Box>
					);
				},
			},
			{
				field: "mod_date",
				headerName: "Date",
				width: 150,
				valueGetter: (_value, row) => dateText(row),
			},
			{
				field: "mod_kind",
				headerName: "Kind",
				width: 130,
				renderCell: (params) => (
					<Chip
						size="small"
						label={params.row.mod_kind_label ?? params.row.mod_kind}
						color={kindColor(params.row.mod_kind)}
						variant={params.row.mod_kind === MOD_KIND_INITIAL ? "filled" : "outlined"}
					/>
				),
			},
			{ field: "title", headerName: "Title", minWidth: 200, flex: 1 },
			{
				field: "scope",
				headerName: "Scope",
				minWidth: 180,
				flex: 1,
				valueGetter: (_value, row) => scopeText(row),
			},
			{
				field: "stage",
				headerName: "Stage",
				width: 90,
				valueGetter: (_value, row) => stageText(row),
			},
			{
				field: "mod_category_label",
				headerName: "Category",
				width: 130,
				valueGetter: (_value, row) => row.mod_category_label ?? row.mod_category,
			},
			{
				field: "done_by",
				headerName: "Done by",
				width: 160,
				valueGetter: (_value, row) => (row.party_name ? `${row.done_by} — ${row.party_name}` : row.done_by),
			},
			{
				field: "total_cost",
				headerName: "Cost",
				width: 120,
				type: "number",
				valueFormatter: (value) => (typeof value === "number" ? formatAmount(value) : "—"),
			},
			{
				field: "data_check",
				headerName: "Data (before / after)",
				width: 160,
				sortable: false,
				renderCell: (params) => (
					<Tooltip title="Producing loom-days found 90 days before / after for these looms">
						<Chip
							size="small"
							label={dataCheckLabel(params.row)}
							color={dataCheckIsRed(params.row.data_check) ? "error" : "default"}
							variant={dataCheckIsRed(params.row.data_check) ? "filled" : "outlined"}
						/>
					</Tooltip>
				),
			},
		],
		[busy, onAddFollowUp, onAddLooms, onDelete, onDeleteChain, onEdit, onInsertEarlier],
	);

	// MUI X measures the DataGrid on mount: inside the display:none desktop box on a
	// phone it would mount at 0 px width and log "useResizeContainer ... empty width"
	// on every render. The parent only renders this component after mount, so the
	// media query is safe (noSsr) and the grid is simply not mounted on small screens.
	const theme = useTheme();
	const isDesktop = useMediaQuery(theme.breakpoints.up("sm"), { noSsr: true });

	const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;

	return (
		<Box sx={{ width: "100%" }}>
			{isDesktop ? (
			<Box sx={DESKTOP_ONLY_SX}>
				<DataGrid
					autoHeight
					rows={[...rows]}
					getRowId={(row) => row.modification_id}
					columns={columns}
					loading={loading}
					disableRowSelectionOnClick
					density="comfortable"
					paginationMode="server"
					rowCount={total}
					paginationModel={paginationModel}
					onPaginationModelChange={handlePaginationChange}
					pageSizeOptions={[10, 25, 50, 100]}
					sx={{ width: "100%" }}
				/>
			</Box>
			) : null}

			<Box sx={MOBILE_ONLY_SX}>
				{loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : null}

				{!loading && rows.length === 0 ? (
					<Typography variant="body2" color="text.secondary">
						No modifications recorded for this filter.
					</Typography>
				) : null}

				{rows.map((row) => {
					const children = hasChildren(row);
					const red = dataCheckIsRed(row.data_check);
					return (
						<Box
							key={row.modification_id}
							sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}
						>
							<Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1 }}>
								<Box sx={{ minWidth: 0, flex: 1 }}>
									<Typography variant="subtitle2" sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
										{row.title}
									</Typography>
									<Typography variant="caption" color="text.secondary" display="block">
										{dateText(row)} · stage {stageText(row)}
									</Typography>
								</Box>
								<Chip
									size="small"
									label={row.mod_kind_label ?? row.mod_kind}
									color={kindColor(row.mod_kind)}
									variant={row.mod_kind === MOD_KIND_INITIAL ? "filled" : "outlined"}
								/>
							</Box>

							<Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
								<CardStat label="Scope" value={scopeText(row)} />
								<CardStat label="Category" value={row.mod_category_label ?? row.mod_category} align="right" />
								<CardStat
									label="Done by"
									value={row.party_name ? `${row.done_by} — ${row.party_name}` : row.done_by}
								/>
								<CardStat
									label="Cost"
									value={typeof row.total_cost === "number" ? formatAmount(row.total_cost) : "—"}
									align="right"
								/>
							</Box>

							<Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1, flexWrap: "wrap" }}>
								<Chip
									size="small"
									label={`data ${dataCheckLabel(row)}`}
									color={red ? "error" : "default"}
									variant={red ? "filled" : "outlined"}
								/>
								<Box sx={{ flex: 1 }} />
								<IconButton
									size="small"
									color="primary"
									aria-label="Edit modification"
									disabled={busy}
									onClick={() => onEdit(row)}
									sx={TOUCH_ICON_BUTTON_SX}
								>
									<EditIcon size={18} />
								</IconButton>
								<Tooltip title={children ? "has follow-ups" : "Delete"}>
									<span>
										<IconButton
											size="small"
											color="error"
											aria-label="Delete modification"
											disabled={busy || children}
											onClick={() => onDelete(row)}
											sx={TOUCH_ICON_BUTTON_SX}
										>
											<TrashIcon size={18} />
										</IconButton>
									</span>
								</Tooltip>
								<RowMenu
									row={row}
									busy={busy}
									onDeleteChain={onDeleteChain}
									onInsertEarlier={onInsertEarlier}
									onAddLooms={onAddLooms}
									onAddFollowUp={onAddFollowUp}
								/>
							</Box>
						</Box>
					);
				})}

				{total > 0 ? (
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						<Button
							size="small"
							variant="outlined"
							disabled={page <= 1 || loading}
							onClick={() => onPageChange(page - 1)}
							sx={{ minHeight: TOUCH_TARGET, flex: 1 }}
						>
							Previous
						</Button>
						<Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
							{page} / {pageCount}
						</Typography>
						<Button
							size="small"
							variant="outlined"
							disabled={page >= pageCount || loading}
							onClick={() => onPageChange(page + 1)}
							sx={{ minHeight: TOUCH_TARGET, flex: 1 }}
						>
							Next
						</Button>
					</Box>
				) : null}
			</Box>
		</Box>
	);
}
