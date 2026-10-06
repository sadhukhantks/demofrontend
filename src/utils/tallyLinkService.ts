/**
 * Service layer for the Tally Link Master — maps ERP parties / raw-jute items / the company
 * default godown to the exact names in the company's Tally books (Tally imports fail otherwise).
 *
 * Backend: /api/tallyLinkMaster (vowerp3be src/masters/tallyLink.py), table tally_link_mst.
 */

import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

export type TallyLinkType = "PARTY" | "ITEM" | "GODOWN";

export interface TallyErpOption {
	ref_id: number;
	erp_name: string;
	item_grp_name?: string;
}

export interface TallyLinkSetup {
	link_types: TallyLinkType[];
	parties: TallyErpOption[];
	items: TallyErpOption[];
}

export interface TallyLinkRow {
	tally_link_id: number;
	co_id: number;
	link_type: TallyLinkType;
	ref_id: number;
	tally_name: string;
	active: number;
	erp_name: string | null;
}

export async function fetchTallyLinkSetup(coId: string | number) {
	const res = await fetchWithCookie<{ data: TallyLinkSetup }>(`${apiRoutesPortalMasters.TALLY_LINK_SETUP}?co_id=${coId}`, "GET");
	return { data: res.data?.data ?? null, error: res.error };
}

export async function fetchTallyLinks(coId: string | number) {
	const res = await fetchWithCookie<{ data: TallyLinkRow[] }>(`${apiRoutesPortalMasters.TALLY_LINK_LIST}?co_id=${coId}`, "GET");
	return { data: res.data?.data ?? [], error: res.error };
}

export async function createTallyLink(payload: { co_id: number; link_type: TallyLinkType; ref_id: number | null; tally_name: string }) {
	const res = await fetchWithCookie<{ data: { tally_link_id: number } }>(apiRoutesPortalMasters.TALLY_LINK_CREATE, "POST", payload);
	return { error: res.error };
}

export async function updateTallyLink(payload: { co_id: number; tally_link_id: number; tally_name: string; active: number }) {
	const res = await fetchWithCookie<{ data: { tally_link_id: number; active: number } }>(apiRoutesPortalMasters.TALLY_LINK_UPDATE, "POST", payload);
	return { error: res.error };
}
