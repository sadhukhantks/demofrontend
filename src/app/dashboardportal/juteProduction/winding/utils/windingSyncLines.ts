// TKT-000171 — result shaping for the winding "Sync" (WINDING_QUALITY_SYNC).
//
// Winding freezes nothing (every figure is computed live), so its Sync is not
// a reprocess: it reconciles the Quality tab's person -> machine/yarn map for
// one date + spell against that unit's attendance. These helpers turn the
// endpoint's lists into the one-line summary (snackbar) and the per-category
// lines (panel) the button shows. Pure — kept out of the component so the
// wording is unit-testable.

export type WindingSyncRowRef = {
	winding_daily_qlty_id: number | null;
	eb_id: number;
	emp_code: string | null;
	worker_name: string | null;
};

export type WindingSyncMachine = {
	machine_id: number | null;
	mech_code: string | null;
	machine_name: string | null;
};

export type WindingSyncMachineChange = WindingSyncRowRef &
	WindingSyncMachine & {
		old_machine_id: number | null;
		old_mech_code: string | null;
		old_machine_name: string | null;
	};

export type WindingSyncAdded = WindingSyncRowRef &
	WindingSyncMachine & {
		item_id: number | null;
		source: "attendance" | "doff";
	};

export type WindingSyncAbsent = WindingSyncRowRef & {
	has_doffs: boolean;
	other_spells: string[];
};

export type WindingSyncAmbiguous = {
	eb_id: number;
	machine_ids: number[];
	used_machine_id: number;
};

export type WindingSyncResult = {
	mode: "fill" | "force";
	attendance_missing: boolean;
	counts: { attendance_winders: number; map_rows: number; doff_winders: number };
	added: WindingSyncAdded[];
	machine_filled: WindingSyncMachineChange[];
	machine_updated: WindingSyncMachineChange[];
	removed: WindingSyncRowRef[];
	exceptions: {
		machine_differs: WindingSyncMachineChange[];
		absent_on_map: WindingSyncAbsent[];
		machine_ambiguous: WindingSyncAmbiguous[];
	};
};

// "02413 - LAXMI DEBI", the label every winding screen uses; "EB 123" when the
// HRMS record is gone.
export function winderLabel(r: Pick<WindingSyncRowRef, "eb_id" | "emp_code" | "worker_name">): string {
	const code = (r.emp_code ?? "").trim();
	const name = (r.worker_name ?? "").trim();
	if (code && name) return `${code} - ${name}`;
	return code || name || `EB ${r.eb_id}`;
}

export function machineCode(m: Pick<WindingSyncMachine, "mech_code" | "machine_name">): string {
	return (m.mech_code ?? "").trim() || (m.machine_name ?? "").trim() || "—";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Absent rows the "Remove" action would drop: no attendance AND no doffs.
export function removableAbsent(r: WindingSyncResult): WindingSyncAbsent[] {
	return r.exceptions.absent_on_map.filter((a) => !a.has_doffs);
}

// One line for the snackbar.
export function syncSummary(r: WindingSyncResult): string {
	const parts: string[] = [];
	if (r.added.length) parts.push(`${plural(r.added.length, "winder")} added`);
	if (r.machine_filled.length) parts.push(`${plural(r.machine_filled.length, "machine")} filled`);
	if (r.machine_updated.length) parts.push(`${plural(r.machine_updated.length, "machine")} changed`);
	if (r.removed.length) parts.push(`${plural(r.removed.length, "winder")} removed`);
	const differs = r.exceptions.machine_differs.length;
	if (differs) parts.push(`${plural(differs, "machine")} differ${differs === 1 ? "s" : ""} from attendance`);
	const absent = r.exceptions.absent_on_map.length;
	if (absent) parts.push(`${absent} absent`);
	if (r.attendance_missing) parts.push("no attendance entered for this spell");
	return parts.length ? `Sync: ${parts.join(", ")}.` : "Sync: map already matches attendance.";
}

// What the sync CHANGED (writes).
export function syncChangeLines(r: WindingSyncResult): string[] {
	const lines: string[] = [];
	const fromAtt = r.added.filter((a) => a.source === "attendance");
	const fromDoff = r.added.filter((a) => a.source === "doff");
	if (fromAtt.length) {
		lines.push(
			`Added from attendance: ${fromAtt
				.map((a) => `${winderLabel(a)} (${machineCode(a)})`)
				.join(", ")}`,
		);
	}
	if (fromDoff.length) {
		lines.push(
			`Added because they have doffs (no attendance machine): ${fromDoff
				.map((a) => winderLabel(a))
				.join(", ")}`,
		);
	}
	if (r.machine_filled.length) {
		lines.push(
			`Machine filled from attendance: ${r.machine_filled
				.map((m) => `${winderLabel(m)} → ${machineCode(m)}`)
				.join(", ")}`,
		);
	}
	if (r.machine_updated.length) {
		lines.push(
			`Machine changed to the attendance machine: ${r.machine_updated
				.map(
					(m) =>
						`${winderLabel(m)} ${machineCode({ mech_code: m.old_mech_code, machine_name: m.old_machine_name })} → ${machineCode(m)}`,
				)
				.join(", ")}`,
		);
	}
	if (r.removed.length) {
		lines.push(`Removed (absent, no doffs): ${r.removed.map((x) => winderLabel(x)).join(", ")}`);
	}
	return lines;
}

// What the sync only REPORTED (nothing written for these).
export function syncExceptionLines(r: WindingSyncResult): string[] {
	const lines: string[] = [];
	if (r.attendance_missing) {
		lines.push(
			"No attendance entered yet for this date and spell — absentees and machines could not be checked.",
		);
	}
	if (r.exceptions.machine_differs.length) {
		lines.push(
			`Map machine differs from attendance (not changed): ${r.exceptions.machine_differs
				.map(
					(m) =>
						`${winderLabel(m)} map ${machineCode({ mech_code: m.old_mech_code, machine_name: m.old_machine_name })} / attendance ${machineCode(m)}`,
				)
				.join("; ")}`,
		);
	}
	if (r.exceptions.absent_on_map.length) {
		lines.push(
			`On the map but no attendance in this spell: ${r.exceptions.absent_on_map
				.map((a) => {
					const notes: string[] = [];
					if (a.has_doffs) notes.push("has doffs");
					if (a.other_spells.length) notes.push(`marked in ${a.other_spells.join("/")}`);
					return notes.length ? `${winderLabel(a)} (${notes.join(", ")})` : winderLabel(a);
				})
				.join(", ")}`,
		);
	}
	if (r.exceptions.machine_ambiguous.length) {
		lines.push(
			`Marked on more than one winding machine (first-marked used): ${r.exceptions.machine_ambiguous
				.map((a) => `EB ${a.eb_id} → #${a.used_machine_id} of [${a.machine_ids.join(", ")}]`)
				.join("; ")}`,
		);
	}
	return lines;
}
