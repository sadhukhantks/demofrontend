"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type {
	SelectionEntryDeleteResponse,
	SelectionEntryPayload,
	SelectionEntrySaveResponse,
	SelectionMutationResult,
} from "../types/selectionTypes";

/**
 * Write side of the Selection Trolley Weight page (spec §3.1): create, edit
 * and soft delete. `fetchWithCookie` never throws on 4xx, so a validation 400
 * comes back as `error` = the backend `detail` string for the page to show
 * verbatim. Components never touch the network themselves.
 */
export function useSelectionMutations() {
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);

	const createEntry = React.useCallback(async (payload: SelectionEntryPayload): Promise<SelectionMutationResult> => {
		setSaving(true);
		const { data, error, status } = await fetchWithCookie<{ data: SelectionEntrySaveResponse }>(
			apiRoutesPortalMasters.SELECTION_TW_ENTRY_CREATE,
			"POST",
			payload
		);
		setSaving(false);
		return { ok: !error, error, status, row: data?.data?.row ?? null };
	}, []);

	// PUT /entry_edit/{id}?co_id= — same body as create; the server keeps the
	// tare snapshot unless the trolley changed (spec §3.2).
	const editEntry = React.useCallback(
		async (selectionWtId: number, payload: SelectionEntryPayload): Promise<SelectionMutationResult> => {
			setSaving(true);
			const url = `${apiRoutesPortalMasters.SELECTION_TW_ENTRY_EDIT}/${selectionWtId}?co_id=${payload.co_id}`;
			const { data, error, status } = await fetchWithCookie<{ data: SelectionEntrySaveResponse }>(url, "PUT", payload);
			setSaving(false);
			return { ok: !error, error, status, row: data?.data?.row ?? null };
		},
		[]
	);

	// DELETE /entry_delete/{id}?co_id= — soft delete (active = 0, D6).
	const deleteEntry = React.useCallback(
		async (selectionWtId: number, coId: number): Promise<SelectionMutationResult<SelectionEntryDeleteResponse>> => {
			setDeleting(true);
			const url = `${apiRoutesPortalMasters.SELECTION_TW_ENTRY_DELETE}/${selectionWtId}?co_id=${coId}`;
			const { data, error, status } = await fetchWithCookie<{ data: SelectionEntryDeleteResponse }>(url, "DELETE");
			setDeleting(false);
			return { ok: !error, error, status, row: data?.data ?? null };
		},
		[]
	);

	return { createEntry, editEntry, deleteEntry, saving, deleting };
}
