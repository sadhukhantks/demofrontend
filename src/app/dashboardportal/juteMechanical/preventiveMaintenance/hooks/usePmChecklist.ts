"use client";

import * as React from "react";
import { fetchPmChecklist, type MechPmChecklistTask } from "@/utils/juteMechanicalService";
import type { EditablePmTask } from "../types/pmTypes";
import { createAdhocTask, seedTaskFromTemplate } from "../types/pmTypes";

/**
 * The checklist grid's data: template tasks pulled from `jute_mech_pm_schedule` for
 * the chosen machine + frequency, seeded as editable rows, plus whatever ad-hoc
 * rows the fitter adds on the day.
 *
 * SEEDING RULE: the template is re-pulled (and the grid replaced) only when the
 * machine or the frequency changes while `seedEnabled` is true. Editing an existing
 * execution turns seeding off and the page supplies the saved rows through
 * `replaceTasks`, so re-opening an old PM never rewrites what a fitter signed off
 * with today's template.
 *
 * RESPONSE SHAPE: `/pm_checklist` wraps its list —
 * `{"data": {machine_id, machine_name, frequency, tasks: [...]}, "total": n}` — so
 * the service's `fetchPmChecklist` hands back that OBJECT even though its return
 * type says `MechPmChecklistTask[]`. `normalizeChecklistTasks` narrows whatever
 * arrives (bare array or `{tasks: [...]}`) through `unknown`, so the screen works
 * against either shape and never trusts the declared type blindly.
 */
export interface UsePmChecklistResult {
	tasks: EditablePmTask[];
	/** Number of rows that came from the template (the rest are ad-hoc). */
	templateCount: number;
	loading: boolean;
	error: string | null;
	/** True once a seed attempt returned an empty template for this machine + frequency. */
	templateEmpty: boolean;
	updateTask: (rowId: string, patch: Partial<Omit<EditablePmTask, "row_id">>) => void;
	addAdhocTask: () => void;
	removeTask: (rowId: string) => void;
	replaceTasks: (tasks: EditablePmTask[]) => void;
	clearTasks: () => void;
	/** Re-pull the template, discarding the current rows. */
	reseed: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isChecklistTask(value: unknown): value is MechPmChecklistTask {
	return (
		isRecord(value) &&
		typeof value.pm_schedule_id === "number" &&
		typeof value.task_desc === "string" &&
		typeof value.frequency === "string"
	);
}

/**
 * Narrow the `/pm_checklist` payload to the task list, accepting either the bare
 * array the service's type promises or the `{tasks: [...]}` envelope the router
 * actually returns.
 */
export function normalizeChecklistTasks(raw: unknown): MechPmChecklistTask[] {
	if (Array.isArray(raw)) return raw.filter(isChecklistTask);
	if (isRecord(raw) && Array.isArray(raw.tasks)) return raw.tasks.filter(isChecklistTask);
	return [];
}

/** Template order: seq_no first (nulls last), then the schedule id. */
function bySequence(a: MechPmChecklistTask, b: MechPmChecklistTask): number {
	const left = a.seq_no ?? Number.MAX_SAFE_INTEGER;
	const right = b.seq_no ?? Number.MAX_SAFE_INTEGER;
	if (left !== right) return left - right;
	return a.pm_schedule_id - b.pm_schedule_id;
}

export interface UsePmChecklistParams {
	coId: string | null | undefined;
	/** Machine chosen in the header, or null while nothing is picked. */
	machineId: number | null;
	/** Frequency chosen in the header, or "" while nothing is picked. */
	frequency: string;
	/** False while editing a saved execution — its rows come from the record, not the template. */
	seedEnabled: boolean;
}

export function usePmChecklist({
	coId,
	machineId,
	frequency,
	seedEnabled,
}: UsePmChecklistParams): UsePmChecklistResult {
	const [tasks, setTasks] = React.useState<EditablePmTask[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [templateEmpty, setTemplateEmpty] = React.useState(false);

	// Guards against an older, slower response overwriting a newer selection.
	const requestRef = React.useRef(0);

	const loadTemplate = React.useCallback(async () => {
		if (!coId || machineId == null || frequency === "") {
			setTemplateEmpty(false);
			return;
		}
		const requestId = requestRef.current + 1;
		requestRef.current = requestId;
		setLoading(true);
		setError(null);
		try {
			const raw: unknown = await fetchPmChecklist({
				coId: Number(coId),
				machineId,
				frequency,
			});
			if (requestRef.current !== requestId) return;
			const template = normalizeChecklistTasks(raw).sort(bySequence);
			setTasks(template.map(seedTaskFromTemplate));
			setTemplateEmpty(template.length === 0);
		} catch (err) {
			if (requestRef.current !== requestId) return;
			setTasks([]);
			setTemplateEmpty(false);
			setError(err instanceof Error ? err.message : "Failed to load the PM checklist");
		} finally {
			if (requestRef.current === requestId) setLoading(false);
		}
	}, [coId, machineId, frequency]);

	React.useEffect(() => {
		if (!seedEnabled) return;
		if (machineId == null || frequency === "") {
			setTasks([]);
			setTemplateEmpty(false);
			return;
		}
		void loadTemplate();
	}, [seedEnabled, machineId, frequency, loadTemplate]);

	const updateTask = React.useCallback(
		(rowId: string, patch: Partial<Omit<EditablePmTask, "row_id">>) => {
			setTasks((prev) =>
				prev.map((task) => (task.row_id === rowId ? { ...task, ...patch } : task)),
			);
		},
		[],
	);

	const addAdhocTask = React.useCallback(() => {
		setTasks((prev) => [...prev, createAdhocTask()]);
	}, []);

	const removeTask = React.useCallback((rowId: string) => {
		setTasks((prev) => prev.filter((task) => task.row_id !== rowId));
	}, []);

	const replaceTasks = React.useCallback((next: EditablePmTask[]) => {
		// A manual replacement outranks any template load still in flight.
		requestRef.current += 1;
		setTasks(next);
		setTemplateEmpty(false);
		setLoading(false);
	}, []);

	const clearTasks = React.useCallback(() => {
		requestRef.current += 1;
		setTasks([]);
		setTemplateEmpty(false);
	}, []);

	const templateCount = React.useMemo(
		() => tasks.filter((task) => task.source === "TEMPLATE").length,
		[tasks],
	);

	return {
		tasks,
		templateCount,
		loading,
		error,
		templateEmpty,
		updateTask,
		addAdhocTask,
		removeTask,
		replaceTasks,
		clearTasks,
		reseed: loadTemplate,
	};
}

export default usePmChecklist;
