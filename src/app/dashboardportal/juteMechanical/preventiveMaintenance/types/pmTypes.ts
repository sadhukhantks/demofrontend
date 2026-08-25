/**
 * Every type the Preventive Maintenance page uses, in ONE file (house rule: a
 * single type module per page, so nothing can form an import cycle). This module
 * imports nothing local, so the hooks and components can all depend on it freely.
 *
 * The Zod schema is the single source of truth for the header form's TypeScript
 * type and its validation. Select and number fields are held as STRINGS because MUI
 * inputs bind to strings; they become numbers only when the payload is built.
 *
 * Wire types (`MechPmExecutionCreate`, `MechPmChecklistTask`, ...) are NOT
 * redeclared here — they come from `@/utils/juteMechanicalService`, which owns the
 * contract.
 */

import { z } from "zod";
import type {
	MechPmChecklistTask,
	MechPmExecutionCreate,
	MechPmExecutionDetail,
	MechPmTaskInput,
} from "@/utils/juteMechanicalService";

// =============================================================================
// Enum codes — mirror src/juteMechanical/constants.py
// =============================================================================

export const PM_RESULT_OK = "OK";
export const PM_RESULT_NOT_OK = "NOT_OK";
export const PM_RESULT_NA = "NA";

/** Ordered exactly as the backend's `PM_RESULTS`. */
export const PM_RESULT_CODES = Object.freeze([PM_RESULT_OK, PM_RESULT_NOT_OK, PM_RESULT_NA]);

/**
 * Fallback result options, used only if `/pm_create_setup` returns an empty
 * `pm_results` list — the checklist is unusable without them. The server payload
 * always wins when present.
 */
export const FALLBACK_PM_RESULTS = Object.freeze([
	{ code: PM_RESULT_OK, label: "OK" },
	{ code: PM_RESULT_NOT_OK, label: "Not OK" },
	{ code: PM_RESULT_NA, label: "N/A" },
]);

/** Fallback frequency options, same reasoning as above. */
export const FALLBACK_PM_FREQUENCIES = Object.freeze([
	{ code: "DAILY", label: "Daily", freq_days: 1 },
	{ code: "WEEKLY", label: "Weekly", freq_days: 7 },
	{ code: "MONTHLY", label: "Monthly", freq_days: 30 },
	{ code: "QUARTERLY", label: "Quarterly", freq_days: 91 },
	{ code: "HALF_YEARLY", label: "Half-Yearly", freq_days: 182 },
	{ code: "ANNUAL", label: "Annual", freq_days: 365 },
]);

/** Stable empty task list, so memo dependencies do not churn. */
export const EMPTY_TASKS: ReadonlyArray<EditablePmTask> = Object.freeze([]);

// =============================================================================
// Checklist task rows
// =============================================================================

/**
 * Where a checklist row came from. TEMPLATE rows were seeded from
 * `jute_mech_pm_schedule` and carry a `pm_schedule_id`; ADHOC rows are jobs the
 * fitter did on the day that are not in the template, and must carry their own
 * `task_desc` (the backend rejects an ad-hoc task without one).
 */
export type PmTaskSource = "TEMPLATE" | "ADHOC";

/** One checklist row while it is being filled in. */
export interface EditablePmTask {
	/** Client-side row key — a task has no server id until the save round-trips. */
	row_id: string;
	/** Null for an ad-hoc task not present in the template. */
	pm_schedule_id: number | null;
	task_desc: string;
	/** OK | NOT_OK | NA */
	result: string;
	observation: string;
	/** Template ordering, used to keep the grid in checklist order. */
	seq_no: number | null;
	/** The frequency the template row belongs to; blank for ad-hoc rows. */
	frequency: string;
	source: PmTaskSource;
}

let pmTaskCounter = 0;

/** Monotonic client-side row key. */
export function nextPmTaskRowId(): string {
	pmTaskCounter += 1;
	return `pm-task-${pmTaskCounter}`;
}

/**
 * Seed one checklist row from a template task. Every seeded row starts at OK — the
 * fitter downgrades what failed, which is the fast path for a round where most
 * checks pass.
 */
export function seedTaskFromTemplate(template: MechPmChecklistTask): EditablePmTask {
	return {
		row_id: nextPmTaskRowId(),
		pm_schedule_id: template.pm_schedule_id,
		task_desc: template.task_desc,
		result: PM_RESULT_OK,
		observation: "",
		seq_no: template.seq_no,
		frequency: template.frequency,
		source: "TEMPLATE",
	};
}

/** A blank ad-hoc row the user fills in themselves. */
export function createAdhocTask(): EditablePmTask {
	return {
		row_id: nextPmTaskRowId(),
		pm_schedule_id: null,
		task_desc: "",
		result: PM_RESULT_OK,
		observation: "",
		seq_no: null,
		frequency: "",
		source: "ADHOC",
	};
}

/** Lift the saved task rows of an execution back into editable rows (edit mode). */
export function toEditableTasks(detail: MechPmExecutionDetail): EditablePmTask[] {
	return detail.tasks.map((task) => ({
		row_id: nextPmTaskRowId(),
		pm_schedule_id: task.pm_schedule_id,
		task_desc: task.task_desc ?? "",
		result: task.result,
		observation: task.observation ?? "",
		seq_no: null,
		frequency: detail.frequency ?? "",
		source: task.pm_schedule_id === null ? "ADHOC" : "TEMPLATE",
	}));
}

/**
 * A row is postable once it has wording. Template rows always do (snapshotted from
 * the schedule); an ad-hoc row the user left blank is simply dropped rather than
 * sent to be rejected.
 */
export function isPostableTask(task: EditablePmTask): boolean {
	return task.task_desc.trim() !== "";
}

/** Ad-hoc rows the user started but left without wording — the one blocking case. */
export function findIncompleteAdhocTasks(
	tasks: ReadonlyArray<EditablePmTask>,
): EditablePmTask[] {
	return tasks.filter(
		(task) =>
			task.source === "ADHOC" &&
			task.task_desc.trim() === "" &&
			task.observation.trim() !== "",
	);
}

/** Count of failed checks — the number that predicts the next breakdown. */
export function countNotOk(tasks: ReadonlyArray<EditablePmTask>): number {
	return tasks.filter((task) => task.result === PM_RESULT_NOT_OK).length;
}

// =============================================================================
// Header form — Zod schema + inferred type
// =============================================================================

/** Today as an ISO date string (YYYY-MM-DD) in LOCAL time. */
export function todayISO(): string {
	const now = new Date();
	const tzOffset = now.getTimezoneOffset() * 60000;
	return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function isFutureISODate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return value > todayISO();
}

export const pmExecutionFormSchema = z.object({
	machine_id: z.string().min(1, "Machine is required"),
	pm_date: z
		.string()
		.min(1, "PM date is required")
		.refine((value) => !isFutureISODate(value), {
			message: "PM date cannot be in the future",
		}),
	/**
	 * Which cycle this visit covers. Optional on the wire, but the checklist cannot
	 * be seeded without it, so the screen treats it as required.
	 */
	frequency: z.string().min(1, "Frequency is required"),
	/** Free text: the fitter or crew who did the round (NOT an enum on this router). */
	done_by: z.string().max(100, "Done by cannot exceed 100 characters"),
	downtime_min: z
		.string()
		.refine((value) => value === "" || Number.isInteger(Number(value)), {
			message: "Downtime must be a whole number of minutes",
		})
		.refine((value) => value === "" || Number(value) >= 0, {
			message: "Downtime cannot be negative",
		}),
	remarks: z.string().max(500, "Remarks cannot exceed 500 characters"),
});

export type PmExecutionFormValues = z.infer<typeof pmExecutionFormSchema>;

/** Blank header — today's date, nothing else assumed. */
export function buildDefaultPmFormValues(): PmExecutionFormValues {
	return {
		machine_id: "",
		pm_date: todayISO(),
		frequency: "",
		done_by: "",
		downtime_min: "",
		remarks: "",
	};
}

/** Lift a saved execution into the header form (edit mode). */
export function toPmFormValues(detail: MechPmExecutionDetail): PmExecutionFormValues {
	return {
		machine_id: String(detail.machine_id),
		pm_date: detail.pm_date ?? todayISO(),
		frequency: detail.frequency ?? "",
		done_by: detail.done_by ?? "",
		downtime_min: detail.downtime_min === null ? "" : String(detail.downtime_min),
		remarks: detail.remarks ?? "",
	};
}

// =============================================================================
// Payload builder
// =============================================================================

function toTaskInput(task: EditablePmTask): MechPmTaskInput {
	return {
		pm_schedule_id: task.pm_schedule_id,
		task_desc: task.task_desc.trim(),
		result: task.result,
		observation: task.observation.trim() === "" ? null : task.observation.trim(),
	};
}

/**
 * Body for `POST /pm_execution_create` and `PUT /pm_execution_edit/{id}` — the same
 * shape. `next_due_date` is absent on purpose: the backend derives it from the
 * machine's `pm_freq_days` (or the template's, or the frequency's day count) and
 * writes it back onto the machine-attribute row.
 */
export function buildPmExecutionPayload(
	values: PmExecutionFormValues,
	tasks: ReadonlyArray<EditablePmTask>,
	coId: number,
	branchId: number,
): MechPmExecutionCreate {
	return {
		co_id: coId,
		branch_id: branchId,
		machine_id: Number(values.machine_id),
		pm_date: values.pm_date,
		frequency: values.frequency === "" ? null : values.frequency,
		done_by: values.done_by.trim() === "" ? null : values.done_by.trim(),
		downtime_min: values.downtime_min === "" ? null : Number(values.downtime_min),
		remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
		tasks: tasks.filter(isPostableTask).map(toTaskInput),
	};
}
