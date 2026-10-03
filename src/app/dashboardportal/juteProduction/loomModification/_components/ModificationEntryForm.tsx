"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	Checkbox,
	Divider,
	FormControlLabel,
	TextField,
	Typography,
} from "@mui/material";
import { Save as SaveIcon, X as CancelIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	FORM_GRID_2_SX,
	FORM_GRID_SX,
	STICKY_ACTIONS_SX,
	TOUCH_TARGET,
} from "@/components/ui/responsiveEntry";
import {
	SearchableOptionSelect,
	type SearchableOption,
} from "@/components/ui/SearchableOptionSelect";
import type {
	LoomGroupMember,
	ModEnumLike,
	ModificationMember,
	ModificationSetup,
	OpenEvent,
} from "@/utils/loomModificationService";
import LoomChecklist from "./LoomChecklist";
import type { ChecklistMember, ModificationFormValues } from "../types/modificationTypes";
import {
	DONE_BY_VENDOR,
	FALLBACK_DONE_BY_OPTIONS,
	FALLBACK_MOD_CATEGORIES,
	FALLBACK_MOD_KINDS,
	GROUP_PURPOSE_STUDY,
	MOD_CATEGORY_SPEED_CHANGE,
	MOD_KIND_INITIAL,
	MOD_KIND_REVERSAL,
	OLD_ROOT_KIND_OPTIONS,
	autoGroupMembers,
	buildChecklistRows,
	buildDefaultModificationFormValues,
	existingGroupings,
	groupMembersToChecklist,
	isAutoGroupKey,
	memberIsActive,
	modificationFormSchema,
	toChecklistMembers,
	toChecklistRows,
	validateMembers,
} from "../types/modificationTypes";

/** What the form is being used for; drives which chain fields are editable. */
export type ModificationFormMode = "create" | "edit" | "followup" | "insertEarlier";

/** Snapshot of a stage, as loaded for the "Follows" picker. */
export interface EventSnapshot {
	members: ModificationMember[];
	loom_group_id: number | null;
}

export interface ModificationEntryFormProps {
	/** Dropdowns and the branch's looms from `/setup`. */
	setup: ModificationSetup;
	mode: ModificationFormMode;
	/** Header being edited / prefilled, or null for a blank form. */
	initialValues: ModificationFormValues | null;
	/** Ticked looms (with dates) on open. */
	initialMembers: ReadonlyArray<ChecklistMember>;
	/**
	 * Snapshot used for the §5 labels: the PARENT's snapshot in follow-up mode, the
	 * event's own snapshot in edit mode (keeps retired looms visible), null otherwise.
	 */
	initialSnapshot: ReadonlyArray<ModificationMember> | null;
	/** Current members of the prefilled group, or null. */
	initialGroupMembers: ReadonlyArray<LoomGroupMember> | null;
	/** Edit mode: the row has active children, so Kind and Follows are immutable. */
	lockChainFields: boolean;
	/** Insert-earlier mode: the old root's date the new stage must end before. */
	insertBeforeDate: string | null;
	/** Edit mode: the id being edited (excluded from the Follows list). */
	editingId: number | null;
	/** Bumped by the page after a save or when leaving edit mode; resets everything. */
	resetToken: number;
	submitting: boolean;
	submitError: string | null;
	/** Members of a group picked in the form (the page owns the API). */
	loadGroupMembers: (groupId: number) => Promise<LoomGroupMember[]>;
	/** Snapshot of a stage picked in "Follows" (the page owns the API). */
	loadEventSnapshot: (modificationId: number) => Promise<EventSnapshot>;
	/** Validated header + ticked looms — the page builds the payload and calls the API. */
	onSubmit: (values: ModificationFormValues, members: ChecklistMember[]) => void;
	onCancelEdit: () => void;
}

/**
 * Un-pickable divider between the saved groups and the existing groupings in
 * the "From group" list (`SearchableSelect` has no group headers).
 */
const AUTO_GROUP_HEADER_VALUE = "__existing_groupings__";

function stageLabel(event: OpenEvent): string {
	// The open-stages rows carry `snapshot_count`; `loom_count` is a legacy alias.
	const n = event.snapshot_count ?? event.loom_count ?? 0;
	return `${event.mod_date} · ${event.title} (${event.mod_kind.toLowerCase()}, ${n} loom${n === 1 ? "" : "s"})`;
}

/**
 * Loom modification entry (§6.2).
 *
 * Owns React Hook Form state and the in-progress tick-list; every option list
 * comes through props and the two loaders are the only async work it triggers
 * (the snapshot of a stage picked in "Follows", the members of a group picked in
 * "From group"). "From group" also lists the groupings that already exist in the
 * data — bands of six looms and share codes (`existingGroupings`) — which tick
 * their looms locally and are saved as a hand-picked list (`loom_group_id` null).
 * The §5 rules the backend 400s on are mirrored here: Follows is
 * required unless Initial, Completed on >= Date done, nothing in the future, a
 * party when Vendor, at least one loom, per-loom dates inside the event's dates.
 */
export default function ModificationEntryForm({
	setup,
	mode,
	initialValues,
	initialMembers,
	initialSnapshot,
	initialGroupMembers,
	lockChainFields,
	insertBeforeDate,
	editingId,
	resetToken,
	submitting,
	submitError,
	loadGroupMembers,
	loadEventSnapshot,
	onSubmit,
	onCancelEdit,
}: ModificationEntryFormProps) {
	const [members, setMembers] = React.useState<ChecklistMember[]>([...initialMembers]);
	const [snapshot, setSnapshot] = React.useState<ReadonlyArray<ModificationMember> | null>(
		initialSnapshot,
	);
	const [groupMembers, setGroupMembers] = React.useState<ReadonlyArray<LoomGroupMember> | null>(
		initialGroupMembers,
	);
	const [memberError, setMemberError] = React.useState<string | null>(null);
	const [loaderError, setLoaderError] = React.useState<string | null>(null);
	const [loadingRelated, setLoadingRelated] = React.useState(false);

	// Ids already reflected in `snapshot` / `groupMembers`, so the effects below only
	// fire on a USER change and not on the prefill the page supplied.
	const loadedParentRef = React.useRef<string>(initialValues?.parent_modification_id ?? "");
	const loadedGroupRef = React.useRef<string>(initialValues?.loom_group_id ?? "");

	const {
		control,
		handleSubmit,
		reset,
		setValue,
		formState: { errors },
	} = useForm<ModificationFormValues>({
		resolver: zodResolver(modificationFormSchema),
		defaultValues: initialValues ?? buildDefaultModificationFormValues(),
		mode: "onBlur",
	});

	// Re-seed on every reset token change (save finished, edit / follow-up started, cancelled).
	React.useEffect(() => {
		const next = initialValues ?? buildDefaultModificationFormValues();
		reset(next);
		setMembers([...initialMembers]);
		setSnapshot(initialSnapshot);
		setGroupMembers(initialGroupMembers);
		setMemberError(null);
		setLoaderError(null);
		loadedParentRef.current = next.parent_modification_id;
		loadedGroupRef.current = next.loom_group_id;
		// initial* are rebuilt by the page alongside resetToken.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [resetToken, reset]);

	const values = useWatch({ control });
	const kindValue = values.mod_kind ?? MOD_KIND_INITIAL;
	const parentValue = values.parent_modification_id ?? "";
	const groupValue = values.loom_group_id ?? "";
	const modDateValue = values.mod_date ?? "";
	const modToDateValue = values.mod_to_date ?? "";
	const doneByValue = values.done_by ?? "";
	const categoryValue = values.mod_category ?? "";
	const saveAsGroupValue = values.save_as_group ?? false;

	const isInitial = kindValue === MOD_KIND_INITIAL;
	const isVendor = doneByValue === DONE_BY_VENDOR;
	// "From group" holds either a saved group's id or an `existingGroupings` key
	// (band / share code); the latter only pre-ticks looms and is sent as null.
	const isAutoGroup = isAutoGroupKey(groupValue);
	const isSavedGroup = groupValue !== "" && !isAutoGroup;

	// Bands of six and share codes already in the branch's looms — computed from
	// the setup list alone so the picker does not change with the ticked snapshot.
	const autoGroups = React.useMemo(
		() => existingGroupings(toChecklistRows(setup.looms)),
		[setup.looms],
	);
	const autoGroupByKey = React.useMemo(
		() => new Map(autoGroups.map((group) => [group.key, group])),
		[autoGroups],
	);
	// Follow-up semantics (parent snapshot ticked, "not in previous stage" labels,
	// list focused on snapshot ∪ group) apply when a parent's snapshot drives the
	// ticks — never in edit mode, where `snapshot` is the event's OWN members.
	const isFollowUpMode = mode === "followup" || (mode !== "edit" && !isInitial && snapshot !== null);

	// Kind = Initial has no parent: clear a stale one so the payload never carries it.
	React.useEffect(() => {
		if (isInitial && parentValue !== "") {
			setValue("parent_modification_id", "");
			loadedParentRef.current = "";
			setSnapshot(mode === "edit" ? initialSnapshot : null);
		}
	}, [initialSnapshot, isInitial, mode, parentValue, setValue]);

	// A stage picked in "Follows": its snapshot becomes the ticked set (§5).
	React.useEffect(() => {
		if (parentValue === loadedParentRef.current) return;
		loadedParentRef.current = parentValue;
		if (parentValue === "") {
			setSnapshot(null);
			return;
		}
		let cancelled = false;
		setLoadingRelated(true);
		setLoaderError(null);
		void loadEventSnapshot(Number(parentValue))
			.then(async (event) => {
				if (cancelled) return;
				setSnapshot(event.members);
				setMembers(toChecklistMembers(event.members, false));
				const groupId = event.loom_group_id === null ? "" : String(event.loom_group_id);
				setValue("loom_group_id", groupId);
				loadedGroupRef.current = groupId;
				if (event.loom_group_id !== null) {
					const groupRows = await loadGroupMembers(event.loom_group_id);
					if (!cancelled) setGroupMembers(groupRows);
				} else {
					setGroupMembers(null);
				}
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setLoaderError(err instanceof Error ? err.message : "Failed to load the stage");
				}
			})
			.finally(() => {
				if (!cancelled) setLoadingRelated(false);
			});
		return () => {
			cancelled = true;
		};
	}, [loadEventSnapshot, loadGroupMembers, parentValue, setValue]);

	// A group picked in "From group": pre-tick its current members (unless a parent
	// snapshot is already driving the ticks, in which case they only add labels).
	React.useEffect(() => {
		if (groupValue === loadedGroupRef.current) return;
		loadedGroupRef.current = groupValue;
		if (groupValue === "") {
			setGroupMembers(null);
			return;
		}
		if (isAutoGroupKey(groupValue)) {
			// An existing grouping has no master row to load: tick its looms straight
			// away (same replace-the-ticks path as a saved group) and carry no
			// membership labels. A parent snapshot keeps driving the ticks.
			setGroupMembers(null);
			const auto = autoGroupByKey.get(groupValue);
			if (auto && !snapshot) setMembers(autoGroupMembers(auto));
			return;
		}
		let cancelled = false;
		setLoadingRelated(true);
		setLoaderError(null);
		void loadGroupMembers(Number(groupValue))
			.then((rows) => {
				if (cancelled) return;
				setGroupMembers(rows);
				if (!snapshot) setMembers(groupMembersToChecklist(rows.filter(memberIsActive)));
				setValue("save_as_group", false);
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setLoaderError(err instanceof Error ? err.message : "Failed to load the group");
				}
			})
			.finally(() => {
				if (!cancelled) setLoadingRelated(false);
			});
		return () => {
			cancelled = true;
		};
	}, [autoGroupByKey, groupValue, loadGroupMembers, setValue, snapshot]);

	// ---- Option lists ----------------------------------------------------------
	const kindOptions = React.useMemo(() => {
		const source: ReadonlyArray<ModEnumLike> =
			setup.mod_kinds.length > 0 ? setup.mod_kinds : FALLBACK_MOD_KINDS;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [setup.mod_kinds]);

	const categoryOptions = React.useMemo(() => {
		const source: ReadonlyArray<ModEnumLike> =
			setup.mod_categories.length > 0 ? setup.mod_categories : FALLBACK_MOD_CATEGORIES;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [setup.mod_categories]);

	const doneByOptions = React.useMemo(() => {
		const source: ReadonlyArray<ModEnumLike> =
			setup.done_by_options.length > 0 ? setup.done_by_options : FALLBACK_DONE_BY_OPTIONS;
		return source.map((option) => ({ value: option.code, label: option.label }));
	}, [setup.done_by_options]);

	const partyOptions = React.useMemo(
		() => setup.parties.map((party) => ({ value: String(party.party_id), label: party.party_name })),
		[setup.parties],
	);

	// Saved study groups first, then — under an un-pickable divider — the bands
	// and share codes that already exist in the data ("resetting is repetition").
	const groupOptions = React.useMemo<SearchableOption<string>[]>(() => {
		const saved: SearchableOption<string>[] = setup.groups
			.filter((group) => group.group_purpose === GROUP_PURPOSE_STUDY)
			.map((group) => ({
				value: String(group.loom_group_id),
				label: `${group.group_code} — ${group.group_name} (${group.member_count} looms)`,
			}));
		if (autoGroups.length === 0) return saved;
		return [
			...saved,
			{ value: AUTO_GROUP_HEADER_VALUE, label: "── Existing groupings (not saved) ──", disabled: true },
			...autoGroups.map((group) => ({ value: group.key, label: group.label })),
		];
	}, [autoGroups, setup.groups]);

	const oldRootKindOptions = React.useMemo(
		() => OLD_ROOT_KIND_OPTIONS.map((option) => ({ value: option.code, label: option.label })),
		[],
	);

	// Follows: the latest open stage per chain; any non-reversal stage for a Reversal.
	const followsOptions = React.useMemo(() => {
		const source = kindValue === MOD_KIND_REVERSAL ? setup.all_stages : setup.open_events;
		return source
			.filter((event) => editingId === null || event.modification_id !== editingId)
			.map((event) => ({ value: String(event.modification_id), label: stageLabel(event) }));
	}, [editingId, kindValue, setup.all_stages, setup.open_events]);

	// ---- Checklist rows ------------------------------------------------------
	const checklistRows = React.useMemo(
		() =>
			buildChecklistRows({
				looms: setup.looms,
				snapshot,
				groupMembers,
				snapshotIsParent: isFollowUpMode,
			}),
		[groupMembers, isFollowUpMode, setup.looms, snapshot],
	);

	const focusIds = React.useMemo<ReadonlySet<number> | null>(() => {
		if (!isFollowUpMode || !snapshot) return null;
		const ids = new Set<number>(snapshot.map((member) => member.machine_id));
		(groupMembers ?? []).forEach((member) => ids.add(member.machine_id));
		return ids;
	}, [groupMembers, isFollowUpMode, snapshot]);

	const submit = handleSubmit((formValues) => {
		const problem = validateMembers(members, formValues.mod_date, formValues.mod_to_date, checklistRows);
		if (problem) {
			setMemberError(problem);
			return;
		}
		if (insertBeforeDate) {
			const ends = formValues.mod_to_date || formValues.mod_date;
			if (ends >= insertBeforeDate) {
				setMemberError(`the earlier stage must end before ${insertBeforeDate}`);
				return;
			}
		}
		setMemberError(null);
		onSubmit(formValues, members);
	});

	const heading =
		mode === "edit"
			? "Edit modification"
			: mode === "followup"
				? "Add a follow-up stage"
				: mode === "insertEarlier"
					? "Insert an earlier stage"
					: "Record a modification";

	const chainLocked = lockChainFields || mode === "insertEarlier";

	return (
		<Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
				{heading}
			</Typography>

			{mode === "insertEarlier" && insertBeforeDate ? (
				<Alert severity="info">
					This becomes the chain&apos;s first stage. It must be completed before{" "}
					{insertBeforeDate}; the current first stage is re-parented to it.
				</Alert>
			) : null}
			{lockChainFields ? (
				<Alert severity="info">
					This stage has follow-ups, so its Kind and Follows cannot change — delete the
					follow-ups first.
				</Alert>
			) : null}

			<Box sx={FORM_GRID_SX}>
				<Controller
					control={control}
					name="mod_kind"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Kind"
							required
							size="small"
							fullWidth
							clearable={false}
							disabled={submitting || chainLocked}
							options={kindOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.mod_kind)}
							helperText={errors.mod_kind?.message}
						/>
					)}
				/>

				<Controller
					control={control}
					name="parent_modification_id"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Follows"
							required={!isInitial}
							size="small"
							fullWidth
							disabled={submitting || isInitial || chainLocked}
							options={followsOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.parent_modification_id)}
							helperText={
								errors.parent_modification_id?.message ??
								(isInitial ? "An initial change follows nothing" : "The stage this one builds on")
							}
						/>
					)}
				/>

				{mode === "insertEarlier" ? (
					<Controller
						control={control}
						name="old_root_kind"
						render={({ field }) => (
							<SearchableOptionSelect
								label="Current first stage becomes"
								required
								size="small"
								fullWidth
								clearable={false}
								disabled={submitting}
								options={oldRootKindOptions}
								value={field.value}
								onChange={(next) => field.onChange(next === "" ? "" : String(next))}
								error={Boolean(errors.old_root_kind)}
								helperText={errors.old_root_kind?.message}
							/>
						)}
					/>
				) : (
					<Controller
						control={control}
						name="loom_group_id"
						render={({ field }) => (
							<SearchableOptionSelect
								label="From group"
								size="small"
								fullWidth
								placeholder="Hand-picked looms"
								disabled={submitting}
								options={groupOptions}
								value={field.value}
								onChange={(next) => field.onChange(next === "" ? "" : String(next))}
								error={Boolean(errors.loom_group_id)}
								helperText={
									errors.loom_group_id?.message ??
									(isAutoGroup
										? "Existing grouping: looms ticked, saved as hand-picked"
										: "Leave blank to pick looms below")
								}
							/>
						)}
					/>
				)}
			</Box>

			<Box sx={FORM_GRID_SX}>
				<Controller
					control={control}
					name="mod_date"
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="Date done"
							required
							size="small"
							fullWidth
							disabled={submitting}
							InputLabelProps={{ shrink: true }}
							error={Boolean(errors.mod_date)}
							helperText={errors.mod_date?.message}
						/>
					)}
				/>
				<Controller
					control={control}
					name="mod_to_date"
					render={({ field }) => (
						<TextField
							{...field}
							type="date"
							label="Completed on"
							size="small"
							fullWidth
							disabled={submitting}
							InputLabelProps={{ shrink: true }}
							error={Boolean(errors.mod_to_date)}
							helperText={errors.mod_to_date?.message ?? "Blank when done in one day"}
						/>
					)}
				/>
				<Controller
					control={control}
					name="settle_days"
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Settling days"
							required
							size="small"
							fullWidth
							disabled={submitting}
							inputProps={{ min: 0, step: 1 }}
							error={Boolean(errors.settle_days)}
							helperText={errors.settle_days?.message ?? "Days after the work the report ignores"}
						/>
					)}
				/>
			</Box>

			<Box sx={FORM_GRID_SX}>
				<Controller
					control={control}
					name="mod_category"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Category"
							required
							size="small"
							fullWidth
							disabled={submitting}
							options={categoryOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.mod_category)}
							helperText={
								errors.mod_category?.message ??
								(categoryValue === MOD_CATEGORY_SPEED_CHANGE
									? "Enter the new speed in Weaving Standards — the report detects it"
									: undefined)
							}
						/>
					)}
				/>
				<Controller
					control={control}
					name="title"
					render={({ field }) => (
						<TextField
							{...field}
							label="Title"
							required
							size="small"
							fullWidth
							disabled={submitting}
							inputProps={{ maxLength: 200 }}
							error={Boolean(errors.title)}
							helperText={errors.title?.message}
							sx={{ gridColumn: { xs: "auto", sm: "span 2" } }}
						/>
					)}
				/>
			</Box>

			<Box sx={FORM_GRID_2_SX}>
				<Controller
					control={control}
					name="description"
					render={({ field }) => (
						<TextField
							{...field}
							label="What was changed"
							size="small"
							fullWidth
							multiline
							minRows={2}
							disabled={submitting}
							error={Boolean(errors.description)}
							helperText={errors.description?.message}
						/>
					)}
				/>
				<Controller
					control={control}
					name="expected_effect"
					render={({ field }) => (
						<TextField
							{...field}
							label="Expected effect"
							size="small"
							fullWidth
							multiline
							minRows={2}
							disabled={submitting}
							error={Boolean(errors.expected_effect)}
							helperText={errors.expected_effect?.message}
						/>
					)}
				/>
			</Box>

			<Box sx={FORM_GRID_SX}>
				<Controller
					control={control}
					name="done_by"
					render={({ field }) => (
						<SearchableOptionSelect
							label="Done by"
							required
							size="small"
							fullWidth
							clearable={false}
							disabled={submitting}
							options={doneByOptions}
							value={field.value}
							onChange={(next) => field.onChange(next === "" ? "" : String(next))}
							error={Boolean(errors.done_by)}
							helperText={errors.done_by?.message}
						/>
					)}
				/>
				{isVendor ? (
					<Controller
						control={control}
						name="party_id"
						render={({ field }) => (
							<SearchableOptionSelect
								label="Party"
								required
								size="small"
								fullWidth
								disabled={submitting}
								options={partyOptions}
								value={field.value}
								onChange={(next) => field.onChange(next === "" ? "" : String(next))}
								error={Boolean(errors.party_id)}
								helperText={errors.party_id?.message ?? "Required when done by a vendor"}
							/>
						)}
					/>
				) : null}
				<Controller
					control={control}
					name="total_cost"
					render={({ field }) => (
						<TextField
							{...field}
							type="number"
							label="Cost"
							size="small"
							fullWidth
							disabled={submitting}
							inputProps={{ min: 0, step: "any" }}
							error={Boolean(errors.total_cost)}
							helperText={errors.total_cost?.message}
						/>
					)}
				/>
				<Controller
					control={control}
					name="remarks"
					render={({ field }) => (
						<TextField
							{...field}
							label="Remarks"
							size="small"
							fullWidth
							disabled={submitting}
							error={Boolean(errors.remarks)}
							helperText={errors.remarks?.message}
						/>
					)}
				/>
			</Box>

			<Divider />

			<Typography variant="subtitle2">
				Looms {mode === "edit" ? "— members as recorded" : ""}
			</Typography>
			{loaderError ? <Alert severity="error">{loaderError}</Alert> : null}
			<LoomChecklist
				rows={checklistRows}
				lines={setup.lines}
				value={members}
				onChange={(next) => {
					setMembers(next);
					if (memberError) setMemberError(null);
				}}
				withDates
				eventDate={modDateValue}
				eventToDate={modToDateValue}
				focusIds={focusIds}
				disabled={submitting || loadingRelated}
				error={memberError}
				caption={
					isFollowUpMode
						? "Ticked = looms of the previous stage; untick the ones not touched"
						: isAutoGroup
							? "Ticked = looms of the existing grouping; untick the ones not touched"
							: isSavedGroup
								? "Ticked = current members of the group; untick the ones not touched"
								: undefined
				}
			/>

			{!isSavedGroup ? (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<Controller
						control={control}
						name="save_as_group"
						render={({ field }) => (
							<FormControlLabel
								control={
									<Checkbox
										size="small"
										checked={field.value}
										onChange={(e) => field.onChange(e.target.checked)}
										disabled={submitting}
									/>
								}
								label="Save these looms as a group"
							/>
						)}
					/>
					{saveAsGroupValue ? (
						<Box sx={FORM_GRID_2_SX}>
							<Controller
								control={control}
								name="group_code"
								render={({ field }) => (
									<TextField
										{...field}
										label="Group code"
										required
										size="small"
										fullWidth
										disabled={submitting}
										inputProps={{ maxLength: 50 }}
										error={Boolean(errors.group_code)}
										helperText={errors.group_code?.message}
									/>
								)}
							/>
							<Controller
								control={control}
								name="group_name"
								render={({ field }) => (
									<TextField
										{...field}
										label="Group name"
										required
										size="small"
										fullWidth
										disabled={submitting}
										inputProps={{ maxLength: 100 }}
										error={Boolean(errors.group_name)}
										helperText={errors.group_name?.message}
									/>
								)}
							/>
						</Box>
					) : null}
				</Box>
			) : null}

			{submitError ? <Alert severity="error">{submitError}</Alert> : null}

			<Box sx={STICKY_ACTIONS_SX} justifyContent={{ xs: "stretch", sm: "flex-end" }}>
				{mode !== "create" ? (
					<Button
						variant="outlined"
						startIcon={<CancelIcon size={18} />}
						onClick={onCancelEdit}
						disabled={submitting}
						sx={{ minHeight: TOUCH_TARGET }}
					>
						Cancel
					</Button>
				) : null}
				<Button
					type="submit"
					variant="contained"
					startIcon={<SaveIcon size={18} />}
					disabled={submitting || loadingRelated}
					sx={{ minHeight: TOUCH_TARGET }}
				>
					{submitting ? "Saving…" : mode === "edit" ? "Update modification" : "Save modification"}
				</Button>
			</Box>
		</Box>
	);
}
