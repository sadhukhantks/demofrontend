"use client";

import * as React from "react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import type {
	BaleEntryDeleteResponse,
	BaleEntryPayload,
	BaleEntrySaveResponse,
	BaleMutationResult,
} from "../types/baleTypes";

/**
 * Write side of the Bale Production page (SPEC §6): create, edit and soft
 * delete. Every result carries the HTTP `status` so the page can recognise the
 * backend's 409 ("bale no already used in this series" / "no such original bale
 * to repack"), show the confirm dialog and resend with `allow_duplicate: true`
 * (SPEC Q5). Components never touch the network themselves.
 */
export function useBaleMutations() {
	const [saving, setSaving] = React.useState(false);
	const [deleting, setDeleting] = React.useState(false);

	const createEntry = React.useCallback(
		async (payload: BaleEntryPayload): Promise<BaleMutationResult> => {
			setSaving(true);
			const { data, error, status } = await fetchWithCookie<{ data: BaleEntrySaveResponse }>(
				apiRoutesPortalMasters.BALE_PROD_ENTRY_CREATE,
				"POST",
				payload
			);
			setSaving(false);
			return {
				ok: !error,
				error,
				status,
				row: data?.data?.row ?? null,
				lastBaleNo: data?.data?.last_bale_no ?? null,
			};
		},
		[]
	);

	// PUT /entry_edit/{id}?co_id= — same body as create (the server scopes the row by the query co_id); the server recomputes the
	// trolley / packsheet / standard snapshots (SPEC §6).
	const editEntry = React.useCallback(
		async (baleEntryId: number, payload: BaleEntryPayload): Promise<BaleMutationResult> => {
			setSaving(true);
			const url = `${apiRoutesPortalMasters.BALE_PROD_ENTRY_EDIT}/${baleEntryId}?co_id=${payload.co_id}`;
			const { data, error, status } = await fetchWithCookie<{ data: BaleEntrySaveResponse }>(
				url,
				"PUT",
				payload
			);
			setSaving(false);
			return {
				ok: !error,
				error,
				status,
				row: data?.data?.row ?? null,
				lastBaleNo: data?.data?.last_bale_no ?? null,
			};
		},
		[]
	);

	// DELETE /entry_delete/{id}?co_id — co_id is the company-scoping guard on
	// the by-id route. Soft delete (active = 0); echoes the series' counter,
	// which winds back when the deleted bale was the top number.
	const deleteEntry = React.useCallback(
		async (baleEntryId: number, coId: number): Promise<BaleMutationResult<BaleEntryDeleteResponse>> => {
			setDeleting(true);
			const url = `${apiRoutesPortalMasters.BALE_PROD_ENTRY_DELETE}/${baleEntryId}?co_id=${coId}`;
			const { data, error, status } = await fetchWithCookie<{ data: BaleEntryDeleteResponse }>(
				url,
				"DELETE"
			);
			setDeleting(false);
			return { ok: !error, error, status, row: data?.data ?? null, lastBaleNo: data?.data?.last_bale_no ?? null };
		},
		[]
	);

	return { createEntry, editEntry, deleteEntry, saving, deleting };
}
