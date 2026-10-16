import { MR_STATUS_IDS, type MRStatusId } from "./mrConstants";

/**
 * Visibility of the MR-specific status actions (Reopen, Return lorry, Undo
 * return) from the MR's status and the user's menu access ALONE.
 *
 * Deliberately NOT gated on the page's `mode` ("view" / "edit"): the Jute MR
 * list gives the edit icon only to Draft / Open rows and opens every Pending
 * (13) / Approved (3) MR with `?mode=view`. Gating these buttons on edit mode
 * therefore hid Reopen — the only way back to Open or to QC after a wrong
 * Pending / approval — from everyone, and the owner asked for the "missing"
 * option twice (TKT-000229, TKT-000230, sls). Reopen and Return lorry are
 * status transitions, not edits of the form, so a read-only form must not hide
 * them. The backend remains the gate: reopen_mr re-checks edit access (403),
 * the status (400) and the transfer chain (409).
 */
export function canReopenMr(
	statusId: MRStatusId | null | undefined,
	hasEditAccess: boolean,
	qcDone = false,
): boolean {
	if (!hasEditAccess) return false;
	if (statusId === MR_STATUS_IDS.PENDING || statusId === MR_STATUS_IDS.APPROVED) return true;
	// TKT-000229 (2026-10-16): an Open MR whose QC is done can be rolled back to QC
	// (qc_check reset, status unchanged) — the only "reopen" that makes sense there.
	return statusId === MR_STATUS_IDS.OPEN && qcDone;
}

/**
 * On an Open MR the Reopen dialog offers only the QC rollback: "reopen for MR
 * edit" is meaningless when the MR is already Open.
 */
export function isQcRollbackOnly(statusId: MRStatusId | null | undefined): boolean {
	return statusId === MR_STATUS_IDS.OPEN;
}

/** Return lorry: Open / Pending MRs not yet marked Returned (owner ruling 2026-10-03). */
export function canReturnLorryMr(
	statusId: MRStatusId | null | undefined,
	isReturned: boolean,
	hasEditAccess: boolean,
): boolean {
	return hasEditAccess && !isReturned && (statusId === MR_STATUS_IDS.OPEN || statusId === MR_STATUS_IDS.PENDING);
}

/** Undo return: only while the flag is set and the MR is still Open / Pending. */
export function canUnreturnLorryMr(
	statusId: MRStatusId | null | undefined,
	isReturned: boolean,
	hasEditAccess: boolean,
): boolean {
	return hasEditAccess && isReturned && (statusId === MR_STATUS_IDS.OPEN || statusId === MR_STATUS_IDS.PENDING);
}
