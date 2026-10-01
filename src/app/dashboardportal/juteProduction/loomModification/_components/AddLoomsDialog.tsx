"use client";

import * as React from "react";
import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { DIALOG_ACTIONS_SX } from "@/components/ui/responsiveEntry";
import type { ModificationRow } from "@/utils/loomModificationService";
import LoomChecklist from "./LoomChecklist";
import type { ChecklistMember, ChecklistRow } from "../types/modificationTypes";
import { EMPTY_MEMBERS, buildAddLoomsSchema } from "../types/modificationTypes";

export interface AddLoomsDialogProps {
	open: boolean;
	/** The stage looms are being appended to. */
	row: ModificationRow | null;
	/** Looms of the branch NOT yet in the stage's snapshot. */
	rows: ReadonlyArray<ChecklistRow>;
	lines: ReadonlyArray<string>;
	submitting: boolean;
	error: string | null;
	onClose: () => void;
	/** Ticked looms; a blank done date is filled with the stage's date by the caller. */
	onSubmit: (members: ChecklistMember[]) => void;
}

/**
 * "Add looms to this stage (done on …)" — appends snapshot rows with their own
 * done dates to an existing event, for the 13th loom modified weeks after the
 * first twelve (§5). Full-screen under `sm`, like the groups master dialog.
 */
export default function AddLoomsDialog({
	open,
	row,
	rows,
	lines,
	submitting,
	error,
	onClose,
	onSubmit,
}: AddLoomsDialogProps) {
	const theme = useTheme();
	const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
	const [members, setMembers] = React.useState<ChecklistMember[]>([...EMPTY_MEMBERS]);
	const [memberError, setMemberError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (open) {
			setMembers([...EMPTY_MEMBERS]);
			setMemberError(null);
		}
	}, [open, row?.modification_id]);

	const eventDate = row?.mod_date ?? "";
	const eventToDate = row?.mod_to_date ?? "";

	// Zod owns the validation (min 1 loom + the §5 per-loom date rules).
	const schema = React.useMemo(
		() => buildAddLoomsSchema(eventDate, eventToDate, rows),
		[eventDate, eventToDate, rows],
	);

	const submit = () => {
		if (!row) return;
		const parsed = schema.safeParse({ members });
		if (!parsed.success) {
			setMemberError(parsed.error.issues[0]?.message ?? "Tick at least one loom");
			return;
		}
		setMemberError(null);
		onSubmit(parsed.data.members);
	};

	return (
		<Dialog open={open} onClose={submitting ? undefined : onClose} fullScreen={fullScreen} fullWidth maxWidth="md">
			<DialogTitle>Add looms to this stage</DialogTitle>
			<DialogContent dividers>
				{row ? (
					<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
						{row.title} — {row.mod_date}
						{row.mod_to_date ? ` → ${row.mod_to_date}` : ""}. Tick the looms modified later and
						give each its own done date (blank = the stage&apos;s date).
					</Typography>
				) : null}
				<LoomChecklist
					rows={rows}
					lines={lines}
					value={members}
					onChange={(next) => {
						setMembers(next);
						if (memberError) setMemberError(null);
					}}
					withDates
					eventDate={eventDate}
					eventToDate={eventToDate}
					disabled={submitting}
					error={memberError}
				/>
				{error ? (
					<Alert severity="error" sx={{ mt: 2 }}>
						{error}
					</Alert>
				) : null}
			</DialogContent>
			<DialogActions sx={DIALOG_ACTIONS_SX}>
				<Button onClick={onClose} disabled={submitting}>
					Cancel
				</Button>
				<Button variant="contained" onClick={submit} disabled={submitting || members.length === 0}>
					{submitting ? "Saving…" : `Add ${members.length} loom${members.length === 1 ? "" : "s"}`}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
