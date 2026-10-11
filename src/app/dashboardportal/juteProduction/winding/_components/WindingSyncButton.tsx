"use client";

import * as React from "react";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Snackbar,
	Typography,
} from "@mui/material";
import { ChevronDown as ExpandIcon, RefreshCw as SyncIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import {
	removableAbsent,
	syncChangeLines,
	syncExceptionLines,
	syncSummary,
	type WindingSyncResult,
} from "../utils/windingSyncLines";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spellId: number | null;
	// Fired after a sync that may have changed the map, so the page can refresh
	// the Quality tab and the grids that show the winder's machine.
	onSynced?: () => void;
};

type Action = "fill" | "force" | "remove";

// TKT-000171 — the winding "Sync" (mirror of spinning's DoffSyncButton).
//
// Winding freezes nothing: production, jugar and targets are computed live, so
// there is no Process / Re-process here. What goes stale is the Quality tab's
// winder -> machine/yarn map (carried forward from the previous spell). Sync
// reconciles it against the day's attendance: fill mode adds winders marked on
// a winding machine (or already doffing), fills blank machines and REPORTS the
// rest; the two overwriting actions (apply attendance machines, remove absent
// winders) are explicit, confirmed, and need Edit on this menu.
export default function WindingSyncButton({ coId, branchId, date, spellId, onSynced }: Props) {
	const pathname = usePathname();
	const { hasMenuAccess } = useSidebarContext();
	const canEdit = hasMenuAccess(pathname, "edit");

	const [busy, setBusy] = React.useState<Action | null>(null);
	const [result, setResult] = React.useState<WindingSyncResult | null>(null);
	const [confirm, setConfirm] = React.useState<Exclude<Action, "fill"> | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	// Any context change invalidates the last result.
	React.useEffect(() => {
		setResult(null);
	}, [coId, branchId, date, spellId]);

	const run = async (action: Action) => {
		if (spellId == null) {
			setSnack("Select a spell to sync.");
			return;
		}
		setConfirm(null);
		setBusy(action);
		const body = {
			co_id: Number(coId),
			branch_id: Number(branchId),
			tran_date: date,
			spell_id: spellId,
			mode: action === "force" ? "force" : "fill",
			remove_absent: action === "remove",
		};
		const { data, error } = await fetchWithCookie<{ data: WindingSyncResult }>(
			apiRoutesPortalMasters.WINDING_QUALITY_SYNC,
			"POST",
			body,
		);
		setBusy(null);
		if (error) {
			setSnack(error);
			return;
		}
		const r = data?.data ?? null;
		setResult(r);
		setSnack(r ? syncSummary(r) : "Sync done.");
		onSynced?.();
	};

	const changes = result ? syncChangeLines(result) : [];
	const exceptions = result ? syncExceptionLines(result) : [];
	const differs = result?.exceptions.machine_differs.length ?? 0;
	const removable = result ? removableAbsent(result).length : 0;

	return (
		<>
			<Button
				variant="outlined"
				size="small"
				startIcon={<SyncIcon size={16} />}
				onClick={() => run("fill")}
				disabled={busy != null || spellId == null}
			>
				{busy === "fill" ? "Syncing…" : "Sync"}
			</Button>
			<Typography variant="caption" color="text.secondary">
				Winding figures are always live — Sync updates the winder → machine map from attendance.
			</Typography>

			{result ? (
				<Box sx={{ width: "100%" }}>
					{changes.length === 0 && exceptions.length === 0 ? (
						<Alert severity="success" onClose={() => setResult(null)}>
							Sync clean — the map already matches attendance ({result.counts.map_rows} winder
							{result.counts.map_rows === 1 ? "" : "s"}, {result.counts.attendance_winders} with
							attendance).
						</Alert>
					) : (
						<Accordion defaultExpanded disableGutters>
							<AccordionSummary expandIcon={<ExpandIcon size={16} />}>
								<Typography variant="body2">{syncSummary(result)}</Typography>
							</AccordionSummary>
							<AccordionDetails>
								{changes.map((l) => (
									<Typography key={l} variant="body2" sx={{ mb: 0.5 }}>
										{l}
									</Typography>
								))}
								{exceptions.map((l) => (
									<Typography key={l} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
										{l}
									</Typography>
								))}
								{differs > 0 || removable > 0 ? (
									<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1, alignItems: "center" }}>
										{differs > 0 ? (
											<Button
												size="small"
												variant="contained"
												color="warning"
												onClick={() => setConfirm("force")}
												disabled={busy != null || !canEdit}
											>
												{busy === "force"
													? "Applying…"
													: `Apply attendance machines (${differs})`}
											</Button>
										) : null}
										{removable > 0 ? (
											<Button
												size="small"
												variant="outlined"
												color="error"
												onClick={() => setConfirm("remove")}
												disabled={busy != null || !canEdit}
											>
												{busy === "remove"
													? "Removing…"
													: `Remove ${removable} absent winder${removable === 1 ? "" : "s"}`}
											</Button>
										) : null}
										{!canEdit ? (
											<Typography variant="caption" color="text.secondary">
												Edit permission is required to apply attendance machines or remove winders.
											</Typography>
										) : null}
									</Box>
								) : null}
							</AccordionDetails>
						</Accordion>
					)}
				</Box>
			) : null}

			<Dialog open={confirm != null} onClose={() => setConfirm(null)}>
				<DialogTitle>
					{confirm === "force" ? "Apply attendance machines?" : "Remove absent winders?"}
				</DialogTitle>
				<DialogContent>
					<DialogContentText>
						{confirm === "force"
							? `Replace the machine on ${differs} map row${differs === 1 ? "" : "s"} for ${date} with the machine attendance marks the winder on. Yarn and spindle counts are not touched; you can still change a machine by hand on the Quality tab afterwards.`
							: `Remove ${removable} winder${removable === 1 ? "" : "s"} from this spell's map: they have no attendance in this spell and no doffs. Winders with doffs are never removed.`}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirm(null)}>Cancel</Button>
					<Button
						variant="contained"
						color={confirm === "force" ? "warning" : "error"}
						onClick={() => run(confirm === "force" ? "force" : "remove")}
					>
						{confirm === "force" ? "Apply" : "Remove"}
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar
				open={!!snack}
				autoHideDuration={5000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</>
	);
}
