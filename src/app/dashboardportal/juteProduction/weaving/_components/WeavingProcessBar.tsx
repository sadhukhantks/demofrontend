"use client";

import * as React from "react";
import {
	Alert,
	AlertTitle,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Snackbar,
	Typography,
} from "@mui/material";
import { usePathname } from "next/navigation";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { useWeavingProcessStatus } from "../hooks/useWeavingProcessStatus";

type Props = {
	coId: string;
	branchId: number;
	date: string;
	spellId: number;
	// Bumped after a successful Process so the grids re-fetch (locked -> frozen log).
	onProcessed?: () => void;
};

type WarnLoom = { machine_id: number; mech_code?: string; machine_name?: string };
type Warnings = {
	no_worker: WarnLoom[];
	no_standard: WarnLoom[];
	no_picks: WarnLoom[];
	negative_jugar?: WarnLoom[];
	// Sync-only: /sync never 400-blocks on these — they come back as warnings.
	unmapped?: WarnLoom[];
	quality_mismatch?: string[];
	// Branch-scoped sync/process: NULL-branch entry rows the freeze skipped.
	null_branch_rows?: WarnLoom[];
};
// BE sends quality_mismatch as mech_code strings in the 400 block too.
type BlockDetail = { message: string; unmapped?: WarnLoom[]; quality_mismatch?: string[] };

const codes = (looms: WarnLoom[] = []) =>
	looms.map((l) => l.mech_code ?? `#${l.machine_id}`).join(", ");

// The Process button: validates the 5 inputs server-side, freezes computed rows into
// the log and locks the (date,spell). A locked unit needs Edit permission to re-process
// or mutate; reprocess_needed flags SQC/stoppage drift since the last Process.
export default function WeavingProcessBar({ coId, branchId, date, spellId, onProcessed }: Props) {
	const pathname = usePathname();
	const { hasMenuAccess } = useSidebarContext();
	const canEdit = hasMenuAccess(pathname, "edit");

	const { status, loading: statusLoading, refresh } = useWeavingProcessStatus(
		coId,
		branchId,
		date,
		spellId
	);

	const [busy, setBusy] = React.useState(false);
	const [syncBusy, setSyncBusy] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [warnings, setWarnings] = React.useState<Warnings | null>(null);
	const [warnTitle, setWarnTitle] = React.useState("Processed with warnings");
	const [block, setBlock] = React.useState<BlockDetail | null>(null);
	const [snack, setSnack] = React.useState<string | null>(null);

	const lockedNoEdit = status.locked && !canEdit;
	// stale supersedes reprocess_needed (legacy alias, same value on new BE).
	const stale = status.stale ?? status.reprocess_needed;

	const handleProcess = async () => {
		setConfirmOpen(false);
		setBusy(true);
		setWarnings(null);
		setBlock(null);
		const body = { co_id: Number(coId), branch_id: branchId, tran_date: date, spell_id: spellId };
		const { data, error, payload } = await fetchWithCookie<{
			data: { processed: number; warnings: Warnings };
		}>(apiRoutesPortalMasters.WEAVING_PROCESS, "POST", body);
		setBusy(false);
		if (error) {
			// BLOCK (400) carries the offending loom lists in the raw payload's detail
			// (fetchWithCookie flattens error to detail.message only).
			const detail = (payload as { detail?: BlockDetail } | null | undefined)?.detail;
			if (detail && (detail.unmapped?.length || detail.quality_mismatch?.length)) {
				setBlock(detail);
			} else {
				setSnack(error);
			}
			return;
		}
		setWarnTitle("Processed with warnings");
		setWarnings(data?.data?.warnings ?? null);
		setSnack(`Processed ${data?.data?.processed ?? 0} looms — day/spell locked.`);
		refresh();
		onProcessed?.();
	};

	// Sync = recompute + store derived rows WITHOUT locking. Never 400-blocks on
	// unmapped/mismatched looms — they arrive as warnings instead.
	const handleSync = async () => {
		setSyncBusy(true);
		setWarnings(null);
		setBlock(null);
		const body = { co_id: Number(coId), branch_id: branchId, tran_date: date, spell_id: spellId };
		const { data, error } = await fetchWithCookie<{
			data: { synced: number; warnings: Warnings };
		}>(apiRoutesPortalMasters.WEAVING_SYNC, "POST", body);
		setSyncBusy(false);
		if (error) {
			setSnack(error);
			return;
		}
		setWarnTitle("Synced with warnings");
		setWarnings(data?.data?.warnings ?? null);
		setSnack(`Synced ${data?.data?.synced ?? 0} looms.`);
		refresh();
		onProcessed?.();
	};

	if (spellId == null) return null;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
				<Button
					variant="contained"
					color={status.locked ? "warning" : "primary"}
					size="small"
					onClick={() => setConfirmOpen(true)}
					disabled={busy || syncBusy || statusLoading || lockedNoEdit}
				>
					{busy ? "Processing…" : status.locked ? "Re-process" : "Process day + spell"}
				</Button>

				<Button
					variant="outlined"
					size="small"
					onClick={handleSync}
					disabled={busy || syncBusy || statusLoading || lockedNoEdit}
				>
					{syncBusy ? "Syncing…" : "Sync"}
				</Button>

				{statusLoading ? (
					<CircularProgress size={16} />
				) : status.locked ? (
					<Chip size="small" color="success" label="Processed & Locked" variant="outlined" />
				) : status.synced && !stale ? (
					<Chip size="small" color="success" label="Synced" variant="outlined" />
				) : status.synced ? null : (
					<Chip size="small" label="Not synced" variant="outlined" />
				)}

				{stale ? (
					<Chip size="small" color="warning" label="Out of date — Sync to refresh" />
				) : null}

				{lockedNoEdit ? (
					<Typography variant="caption" color="text.secondary">
						Locked — Edit permission required to re-process or change entries.
					</Typography>
				) : null}
			</Box>

			{block ? (
				<Alert severity="error" onClose={() => setBlock(null)}>
					<AlertTitle>Cannot process — fix the loom mapping first</AlertTitle>
					{block.unmapped?.length ? (
						<div>Production but no mapped quality: {codes(block.unmapped)}</div>
					) : null}
					{block.quality_mismatch?.length ? (
						<div>Entry quality differs from mapped quality: {block.quality_mismatch.join(", ")}</div>
					) : null}
				</Alert>
			) : null}

			{warnings &&
			(warnings.no_worker.length ||
				warnings.no_standard.length ||
				warnings.no_picks.length ||
				warnings.negative_jugar?.length ||
				warnings.unmapped?.length ||
				warnings.quality_mismatch?.length) ? (
				<Alert severity="warning" onClose={() => setWarnings(null)}>
					<AlertTitle>{warnTitle}</AlertTitle>
					{warnings.unmapped?.length ? (
						<div>
							Looms without mapped quality (stored as zero until mapped): {codes(warnings.unmapped)}
						</div>
					) : null}
					{warnings.quality_mismatch?.length ? (
						<div>
							Entry quality differs from mapped quality: {warnings.quality_mismatch.join(", ")}
						</div>
					) : null}
					{warnings.null_branch_rows?.length ? (
						<div>
							Entries without a branch were NOT stored by this branch-scoped run (run a
							company-wide sync to include them): {codes(warnings.null_branch_rows)}
						</div>
					) : null}
					{warnings.no_worker.length ? (
						<div>No worker (attendance) for: {codes(warnings.no_worker)}</div>
					) : null}
					{warnings.no_standard.length ? (
						<div>No speed/efficiency standard for: {codes(warnings.no_standard)}</div>
					) : null}
					{warnings.no_picks.length ? (
						<div>No SQC pick reading for: {codes(warnings.no_picks)}</div>
					) : null}
					{warnings.negative_jugar?.length ? (
						<div>Negative jugar (closing &lt; opening) for: {codes(warnings.negative_jugar)}</div>
					) : null}
				</Alert>
			) : null}

			<Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
				<DialogTitle>{status.locked ? "Re-process" : "Process"} day + spell?</DialogTitle>
				<DialogContent>
					<DialogContentText>
						{status.locked ? "Re-process" : "Process"} {date} for the selected spell? This freezes
						the computed rows and locks the day + spell.
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
					<Button variant="contained" onClick={handleProcess}>
						{status.locked ? "Re-process" : "Process"}
					</Button>
				</DialogActions>
			</Dialog>

			<Snackbar
				open={!!snack}
				autoHideDuration={5000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
