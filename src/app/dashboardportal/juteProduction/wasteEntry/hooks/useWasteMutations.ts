"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type { WasteEntryCreatePayload, WasteEntryEditPayload } from "../types/wasteTypes";

export type WasteMutationResult = {
	ok: boolean;
	/** Server error message, already flattened by fetchWithCookie. */
	error: string | null;
	/** PK of the created row, when the API returns one. */
	wasteEntryId: number | null;
};

/**
 * Write side of the Waste Entry page (SPEC §6): create, edit and soft delete.
 *
 * Every call goes through `fetchWithCookie` from here — components never touch
 * the network themselves. `co_id` and `branch_id` are supplied by the caller
 * from `SidebarContext` and travel on every request.
 */
export function useWasteMutations() {
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);

	const createEntry = React.useCallback(
		async (payload: WasteEntryCreatePayload): Promise<WasteMutationResult> => {
			setSaving(true);
			const { data, error } = await fetchWithCookie<{ data: { waste_entry_id: number } }>(
				apiRoutesPortalMasters.JUTE_WASTE_ENTRY_CREATE,
				"POST",
				payload
			);
			setSaving(false);
			return {
				ok: !error,
				error,
				wasteEntryId: data?.data?.waste_entry_id ?? null,
			};
		},
		[]
	);

	// PUT /entry_edit/{waste_entry_id}?co_id=… — the id is a PATH param and co_id
	// is a REQUIRED query param (SPEC §6.1). The row is located by
	// (waste_entry_id, co_id); omitting co_id is a 400 and a foreign co_id is a
	// 404, so co_id must always be the one from SidebarContext.
	const editEntry = React.useCallback(
		async (
			wasteEntryId: number,
			coId: number,
			payload: WasteEntryEditPayload
		): Promise<WasteMutationResult> => {
			setSaving(true);
			const url = `${apiRoutesPortalMasters.JUTE_WASTE_ENTRY_EDIT}/${wasteEntryId}?co_id=${coId}`;
			const { error } = await fetchWithCookie(url, "PUT", payload);
			setSaving(false);
			return { ok: !error, error, wasteEntryId };
		},
		[]
	);

	// DELETE /entry_delete/{waste_entry_id}?co_id=… — same by-id + co_id
	// company-scoping guard as edit (SPEC §6.1). Soft delete (active = 0).
	const deleteEntry = React.useCallback(
		async (wasteEntryId: number, coId: number): Promise<WasteMutationResult> => {
			setDeleting(true);
			const url = `${apiRoutesPortalMasters.JUTE_WASTE_ENTRY_DELETE}/${wasteEntryId}?co_id=${coId}`;
			const { error } = await fetchWithCookie(url, "DELETE");
			setDeleting(false);
			return { ok: !error, error, wasteEntryId };
		},
		[]
	);

	return { createEntry, editEntry, deleteEntry, saving, deleting };
}
