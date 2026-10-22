"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Paper,
	Snackbar,
	TextField,
	Typography,
} from "@mui/material";
import { Gauge as MetersIcon } from "lucide-react";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { PAGE_PADDING_SX } from "@/components/ui/responsiveEntry";
import { yesterdayIso } from "@/components/reports/reportDates";
import type { MechPowerReadingRow } from "@/utils/juteMechanicalService";
import MeterDialog from "./_components/MeterDialog";
import PowerReadingGrid from "./_components/PowerReadingGrid";
import { usePowerMeters } from "./hooks/usePowerMeters";
import { usePowerReadings } from "./hooks/usePowerReadings";
import { buildReadingsPayload, type PowerReadingFormValues } from "./types/powerTypes";
import { ddmmyyyy, isFutureDate } from "./utils/powerCalc";

/** The menu path this page is granted under (middleware + PortalPermissionBoundary). */
const MENU_PATH = "juteMechanical/powerReading";

/**
 * The "Whole day" choice of the Spell picker. The API uses null for whole day
 * (and stores 0), and the searchable select needs a numeric option value, so
 * the sentinel lives here and becomes null at the hook / payload boundary.
 */
const WHOLE_DAY_SPELL = 0;

/**
 * Power Readings — the daily log of main-meter kWh, DG hours / litres and max
 * demand, one row per meter (ITM-004).
 *
 * Smart container: it owns the company/branch scope, the date + spell, both
 * hooks and all state; the components under `_components/` render from props.
 *
 * There is NO approval workflow (spec: direct save — readings must be fast).
 *
 * Access levels on this menu (the server reads the same ordinal):
 *   view (1)   see the grid and the meters, change nothing
 *   create (3) key readings inside the 7-day window
 *   edit (4)   also change rows older than 7 days (the lock override, which the
 *              server resolves from the menu access level — not from role ids)
 *              and manage the meter master.
 * A locked date without edit renders the grid read-only and says so.
 */
export default function PowerReadingPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany, hasMenuAccess } = useSidebarContext();

	// Branch resolution: 1 sidebar branch → auto-use it; several → user must pick one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) =>
				prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : ""
			);
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);
	const branchOptions = React.useMemo(
		() =>
			(selectedCompany?.branches ?? []).filter((b) =>
				sidebarBranchIds.includes(Number(b.branch_id))
			),
		[selectedCompany, sidebarBranchIds]
	);
	const selectedBranchName = branchOptions.find(
		(b) => Number(b.branch_id) === branchId
	)?.branch_name;

	// ------------------------------------------------------------- page state
	const [tranDate, setTranDate] = React.useState<string>(yesterdayIso());
	const [spellId, setSpellId] = React.useState<number>(WHOLE_DAY_SPELL);
	const apiSpellId = spellId === WHOLE_DAY_SPELL ? null : spellId;
	const [metersOpen, setMetersOpen] = React.useState(false);
	const [snack, setSnack] = React.useState<string | null>(null);
	const [warnings, setWarnings] = React.useState<string[]>([]);
	const [submitError, setSubmitError] = React.useState<string | null>(null);

	/** Write (3): may key readings inside the window. */
	const canKey = hasMenuAccess(MENU_PATH, "create");
	/** Edit (4): may change locked dates and manage the meter master. */
	const canEdit = hasMenuAccess(MENU_PATH, "edit");

	// ------------------------------------------------------------------ data
	const {
		meters,
		meterTypes,
		loading: metersLoading,
		error: metersError,
		refresh: refreshMeters,
		create: createMeter,
		update: updateMeter,
		saving: meterSaving,
	} = usePowerMeters(coId, branchId);

	const {
		day,
		loading: dayLoading,
		error: dayError,
		refresh: refreshDay,
		save,
		remove,
		saving,
		deleting,
	} = usePowerReadings({
		coId,
		branchId,
		tranDate,
		spellId: apiSpellId,
	});

	// --------------------------------------------------------------- derived
	const locked = !!day && day.lock.locked && !day.lock.can_override;
	const futureDate = !!day && isFutureDate(tranDate, day.today);
	const readOnly = !canKey || locked || futureDate;

	const spellOptions = React.useMemo(
		() => [
			{ value: WHOLE_DAY_SPELL, label: "Whole day" },
			...(day?.spells ?? []).map((spell) => ({
				value: spell.spell_id,
				label: spell.spell_name ? `${spell.spell_code} — ${spell.spell_name}` : spell.spell_code,
			})),
		],
		[day]
	);
	// No spells on the branch = nothing to choose: "Whole day" is shown as text,
	// never as a one-option dropdown (the state already defaults to it).
	const hasSpells = (day?.spells ?? []).length > 0;

	const activeMeterCount = React.useMemo(
		() => meters.filter((m) => m.active === 1).length,
		[meters]
	);

	// -------------------------------------------------------------- handlers
	const handleSubmit = React.useCallback(
		async (values: PowerReadingFormValues) => {
			if (!coId || branchId == null) return;
			setSubmitError(null);

			const payload = buildReadingsPayload(
				values,
				Number(coId),
				branchId,
				tranDate,
				apiSpellId
			);
			if (payload.rows.length === 0) {
				setSubmitError("Nothing to save — key at least one meter.");
				return;
			}

			const result = await save(payload);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			const n = result.result.saved;
			setSnack(`Saved ${n} reading${n === 1 ? "" : "s"} for ${ddmmyyyy(tranDate)}`);
			setWarnings(result.result.warnings);
			refreshDay();
		},
		[apiSpellId, branchId, coId, refreshDay, save, tranDate]
	);

	const handleDelete = React.useCallback(
		async (row: MechPowerReadingRow) => {
			if (row.power_reading_id == null) return;
			if (typeof window !== "undefined") {
				const confirmed = window.confirm(
					`Delete the ${row.meter_code} reading for ${ddmmyyyy(tranDate)}?`
				);
				if (!confirmed) return;
			}
			setSubmitError(null);
			const result = await remove(row.power_reading_id);
			if (!result.ok) {
				setSubmitError(result.error);
				return;
			}
			setSnack(`Deleted the ${row.meter_code} reading for ${ddmmyyyy(tranDate)}`);
			refreshDay();
		},
		[refreshDay, remove, tranDate]
	);

	const handleMeterSaved = React.useCallback(
		(message: string) => {
			setSnack(message);
			refreshMeters();
			// The grid's rows are one per active meter — reload them too.
			refreshDay();
		},
		[refreshDay, refreshMeters]
	);

	// ------------------------------------------------------------- rendering
	if (!mounted) return null;

	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	if (sidebarBranchIds.length === 0) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select at least one branch in the sidebar to continue.
			</Alert>
		);
	}

	return (
		<Box sx={PAGE_PADDING_SX}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Power Readings
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Key the main meter and DG readings once a day — kWh is closing minus opening;
				type kWh directly when a meter was reset. Yesterday&apos;s closing is offered as
				today&apos;s opening.
			</Typography>

			{sidebarBranchIds.length > 1 ? (
				<SearchableOptionSelect
					label="Branch"
					size="small"
					options={branchOptions.map((b) => ({
						value: Number(b.branch_id),
						label: b.branch_name,
					}))}
					value={pageBranchId}
					onChange={(selectedValue) =>
						setPageBranchId(selectedValue === "" ? "" : Number(selectedValue))
					}
					sx={{ mb: 2, minWidth: 240 }}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to key power readings.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
						<Box
							sx={{
								display: "flex",
								flexDirection: { xs: "column", sm: "row" },
								alignItems: { xs: "stretch", sm: "center" },
								gap: { xs: 1.5, sm: 2 },
								flexWrap: "wrap",
							}}
						>
							<TextField
								type="date"
								label="Date"
								size="small"
								value={tranDate}
								onChange={(event) => {
									setTranDate(event.target.value);
									setWarnings([]);
									setSubmitError(null);
								}}
								slotProps={{
									inputLabel: { shrink: true },
									htmlInput: { max: day?.today },
								}}
								sx={{ minWidth: { sm: 170 } }}
							/>
							{hasSpells ? (
								<SearchableOptionSelect
									label="Spell"
									size="small"
									clearable={false}
									options={spellOptions}
									value={spellId}
									onChange={(selectedValue) => {
										setSpellId(selectedValue === "" ? WHOLE_DAY_SPELL : Number(selectedValue));
										setWarnings([]);
										setSubmitError(null);
									}}
									sx={{ minWidth: { sm: 220 } }}
								/>
							) : (
								<Typography variant="body2" color="text.secondary">
									Spell: Whole day
								</Typography>
							)}
							<Box sx={{ flexGrow: 1 }} />
							{/* Always openable: without edit the dialog lists the meters read-only. */}
							<Button
								variant="outlined"
								startIcon={<MetersIcon size={16} />}
								onClick={() => setMetersOpen(true)}
								disabled={metersLoading}
								sx={{ minHeight: 44, textTransform: "none" }}
							>
								Meters{meters.length > 0 ? ` (${activeMeterCount})` : ""}
							</Button>
						</Box>
					</Paper>

					{metersError ? <Alert severity="error">{metersError}</Alert> : null}
					{dayError ? <Alert severity="error">{dayError}</Alert> : null}

					{day && locked ? (
						<Alert severity="warning">
							Readings older than {day.lock.lock_days} days are locked — changing them needs
							edit permission on this menu.
						</Alert>
					) : null}
					{day && futureDate ? (
						<Alert severity="warning">
							{ddmmyyyy(tranDate)} is after today ({ddmmyyyy(day.today)}) — readings cannot
							be keyed for a future date.
						</Alert>
					) : null}
					{!canKey ? (
						<Alert severity="info">
							You can view the readings but not key them (write permission needed).
						</Alert>
					) : null}

					{!metersLoading && meters.length > 0 && activeMeterCount === 0 ? (
						<Alert severity="info">
							Every meter of this branch is inactive — reactivate one from Meters.
						</Alert>
					) : null}
					{!metersLoading && meters.length === 0 ? (
						<Alert severity="info">
							No meters set up for this branch — add MAIN / DG meters first.
						</Alert>
					) : null}

					{warnings.length > 0 ? (
						<Alert severity="warning" onClose={() => setWarnings([])}>
							<Typography variant="body2" fontWeight={600}>
								Saved with warnings — check the readings:
							</Typography>
							<Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>
								{warnings.map((warning) => (
									<li key={warning}>
										<Typography variant="body2">{warning}</Typography>
									</li>
								))}
							</Box>
						</Alert>
					) : null}

					{dayLoading && !day ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : day ? (
						<Box sx={{ opacity: dayLoading ? 0.6 : 1, transition: "opacity 150ms" }}>
							<Typography variant="subtitle2" sx={{ mb: 1 }}>
								{ddmmyyyy(day.tran_date)}
								{day.spell_id == null
									? " · whole day"
									: ` · ${spellOptions.find((o) => o.value === day.spell_id)?.label ?? `spell ${day.spell_id}`}`}
							</Typography>
							<PowerReadingGrid
								rows={day.rows}
								day={day}
								readOnly={readOnly}
								submitting={saving}
								submitError={submitError}
								onSubmit={handleSubmit}
								onDelete={handleDelete}
								deleting={deleting}
							/>
						</Box>
					) : null}
				</Box>
			)}

			{branchId != null ? (
				<MeterDialog
					open={metersOpen}
					onClose={() => setMetersOpen(false)}
					coId={Number(coId)}
					branchId={branchId}
					meters={meters}
					meterTypes={meterTypes}
					onSaved={handleMeterSaved}
					canEdit={canEdit}
					create={createMeter}
					update={updateMeter}
					saving={meterSaving}
				/>
			) : null}

			<Snackbar
				open={!!snack}
				autoHideDuration={3000}
				onClose={() => setSnack(null)}
				message={snack ?? ""}
			/>
		</Box>
	);
}
