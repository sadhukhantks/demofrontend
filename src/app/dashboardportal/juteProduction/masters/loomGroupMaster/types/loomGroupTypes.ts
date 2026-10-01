/**
 * Types of the Loom Groups master (§6.1), in ONE file.
 *
 * The Zod schema is the single source of truth for the dialog form: code / name
 * non-blank (trimmed), purpose one of STUDY / CONTROL, at least one member. The
 * members are held as ids inside the form values so the schema can check them;
 * the tick-list itself is the register's shared `LoomChecklist`.
 *
 * Wire types come from `@/utils/loomModificationService`; the checklist member
 * type from the register's type module, so both pages speak the same shape.
 */

import { z } from "zod";
import type {
	LoomGroup,
	LoomGroupCreate,
	LoomGroupDetail,
	LoomGroupPatch,
	ModEnumLike,
} from "@/utils/loomModificationService";
import type { ChecklistMember } from "../../../loomModification/types/modificationTypes";

export const GROUP_PURPOSE_STUDY = "STUDY";
export const GROUP_PURPOSE_CONTROL = "CONTROL";

/** The two purposes a group may have (D2: groups are declared in the master). */
export const GROUP_PURPOSE_OPTIONS: ReadonlyArray<ModEnumLike> = Object.freeze([
	{ code: GROUP_PURPOSE_STUDY, label: "Study" },
	{ code: GROUP_PURPOSE_CONTROL, label: "Control" },
]);

const MAX_CODE = 50;
const MAX_NAME = 100;
const MAX_REMARKS = 500;

export const loomGroupSchema = z
	.object({
		group_code: z.string().max(MAX_CODE, `Code cannot exceed ${MAX_CODE} characters`),
		group_name: z.string().max(MAX_NAME, `Name cannot exceed ${MAX_NAME} characters`),
		group_purpose: z.string(),
		remarks: z.string().max(MAX_REMARKS, `Remarks cannot exceed ${MAX_REMARKS} characters`),
		machine_ids: z.array(z.number().int().positive()),
	})
	.superRefine((values, ctx) => {
		if (values.group_code.trim() === "") {
			ctx.addIssue({ code: "custom", path: ["group_code"], message: "Group code is required" });
		}
		if (values.group_name.trim() === "") {
			ctx.addIssue({ code: "custom", path: ["group_name"], message: "Group name is required" });
		}
		if (values.group_purpose !== GROUP_PURPOSE_STUDY && values.group_purpose !== GROUP_PURPOSE_CONTROL) {
			ctx.addIssue({ code: "custom", path: ["group_purpose"], message: "Purpose is required" });
		}
		if (values.machine_ids.length === 0) {
			ctx.addIssue({ code: "custom", path: ["machine_ids"], message: "Tick at least one loom" });
		}
	});

export type LoomGroupFormValues = z.infer<typeof loomGroupSchema>;

/** Blank group — Study, no members. */
export function buildDefaultLoomGroupFormValues(): LoomGroupFormValues {
	return {
		group_code: "",
		group_name: "",
		group_purpose: GROUP_PURPOSE_STUDY,
		remarks: "",
		machine_ids: [],
	};
}

/** Lift a saved group into the form (edit mode). Retired members stay in the list. */
export function toLoomGroupFormValues(detail: LoomGroupDetail): LoomGroupFormValues {
	return {
		group_code: detail.group_code ?? "",
		group_name: detail.group_name ?? "",
		group_purpose: detail.group_purpose ?? GROUP_PURPOSE_STUDY,
		remarks: detail.remarks ?? "",
		machine_ids: detail.members.map((member) => member.machine_id),
	};
}

/** Ids -> checklist members (a group carries no dates). */
export function idsToMembers(ids: ReadonlyArray<number>): ChecklistMember[] {
	return ids.map((id) => ({ machine_id: id, done_date: "", done_to_date: "" }));
}

/** Checklist members -> ids. */
export function membersToIds(members: ReadonlyArray<ChecklistMember>): number[] {
	return members.map((member) => member.machine_id);
}

/** Body for `POST /loom_group_create`. */
export function buildLoomGroupCreatePayload(
	values: LoomGroupFormValues,
	coId: number,
	branchId: number | null,
): LoomGroupCreate {
	return {
		co_id: coId,
		branch_id: branchId,
		group_code: values.group_code.trim(),
		group_name: values.group_name.trim(),
		group_purpose: values.group_purpose,
		remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
		machine_ids: [...values.machine_ids],
	};
}

/** Body for `PUT /loom_group_edit/{id}` — every field, members replaced. */
export function buildLoomGroupEditPayload(
	values: LoomGroupFormValues,
	branchId: number | null,
): LoomGroupPatch {
	return {
		branch_id: branchId,
		group_code: values.group_code.trim(),
		group_name: values.group_name.trim(),
		group_purpose: values.group_purpose,
		remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
		machine_ids: [...values.machine_ids],
	};
}

/** "Study" / "Control" from the code. */
export function purposeLabel(code: string): string {
	return GROUP_PURPOSE_OPTIONS.find((option) => option.code === code)?.label ?? code;
}

/** Delete-confirm text; names the member count so the user knows what goes. */
export function deleteConfirmText(group: Pick<LoomGroup, "group_code" | "group_name" | "member_count">): string {
	return `Delete loom group "${group.group_code} — ${group.group_name}" (${group.member_count} loom${group.member_count === 1 ? "" : "s"})? Groups referenced by a modification cannot be deleted.`;
}
