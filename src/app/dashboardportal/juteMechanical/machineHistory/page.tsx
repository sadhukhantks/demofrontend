"use client";

import * as React from "react";
import { Alert, Box, CircularProgress, TextField, Typography } from "@mui/material";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import MachineHistoryPanels from "./_components/MachineHistoryPanels";
import { useMachineHistory, type MachineHistoryRange } from "./hooks/useMachineHistory";

/**
 * Machine History — smart container.
 *
 * One machine, everything: breakdowns, PM executions, overhauls and spares, led by
 * a summary strip. This is the screen a maintenance engineer opens before deciding
 * whether a machine is worth overhauling, so the decision numbers come first and
 * the raw event log second.
 *
 * `machine_id` is REQUIRED by `/machine-history`, so nothing is fetched until a
 * machine is chosen — the picker is the page.
 */
export default function MachineHistoryPage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const { coId } = useSelectedCompanyCoId();
	const { selectedBranches, selectedCompany } = useSidebarContext();

	// Branch resolution: one sidebar branch -> use it; several -> the user picks one.
	const sidebarBranchIds = React.useMemo(() => selectedBranches.map(Number), [selectedBranches]);
	const [pageBranchId, setPageBranchId] = React.useState<number | "">("");
	React.useEffect(() => {
		if (sidebarBranchIds.length === 1) {
			setPageBranchId(sidebarBranchIds[0]);
		} else if (sidebarBranchIds.length === 0) {
			setPageBranchId("");
		} else {
			setPageBranchId((prev) =>
				prev !== "" && sidebarBranchIds.includes(prev as number) ? prev : "",
			);
		}
	}, [sidebarBranchIds]);
	const branchId = pageBranchId === "" ? null : (pageBranchId as number);

	const branchOptions = React.useMemo(
		() =>
			(selectedCompany?.branches ?? []).filter((branch) =>
				sidebarBranchIds.includes(Number(branch.branch_id)),
			),
		[selectedCompany, sidebarBranchIds],
	);
	const selectedBranchName = branchOptions.find(
		(branch) => Number(branch.branch_id) === branchId,
	)?.branch_name;

	// ---- Selection ------------------------------------------------------------
	const [machineId, setMachineId] = React.useState<number | "">("");
	const [dateFrom, setDateFrom] = React.useState("");
	const [dateTo, setDateTo] = React.useState("");

	const range = React.useMemo<MachineHistoryRange>(
		() => ({ dateFrom, dateTo }),
		[dateFrom, dateTo],
	);

	const {
		machines,
		machinesLoading,
		machinesError,
		payload,
		summary,
		loading,
		error,
	} = useMachineHistory(coId, branchId, machineId === "" ? null : machineId, range);

	// A machine that is no longer in the branch's list must not stay selected.
	React.useEffect(() => {
		setMachineId((prev) =>
			prev !== "" && machines.some((machine) => machine.machine_id === prev) ? prev : "",
		);
	}, [machines]);

	/**
	 * Options are annotated with the machine's criticality and PM/overhaul due dates,
	 * so the engineer can spot the machine worth opening before opening it.
	 */
	const machineOptions = React.useMemo(
		() =>
			machines.map((machine) => {
				const label = machine.mech_code
					? `${machine.mech_code} — ${machine.machine_name}`
					: machine.machine_name;
				const notes = [
					machine.machine_type_name,
					machine.criticality ? `crit ${machine.criticality}` : null,
					machine.next_pm_due ? `PM due ${machine.next_pm_due}` : null,
				].filter((note): note is string => Boolean(note));
				return {
					value: machine.machine_id,
					label: notes.length > 0 ? `${label}  ·  ${notes.join(" · ")}` : label,
				};
			}),
		[machines],
	);

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
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Machine History
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Every breakdown, preventive-maintenance round, overhaul and spare booked against one
				machine.
			</Typography>

			{sidebarBranchIds.length > 1 ? (
				<SearchableOptionSelect
					label="Branch"
					size="small"
					options={branchOptions.map((branch) => ({
						value: Number(branch.branch_id),
						label: branch.branch_name,
					}))}
					value={pageBranchId}
					onChange={(next) => setPageBranchId(next === "" ? "" : Number(next))}
					sx={{ mb: 2, minWidth: 240 }}
				/>
			) : selectedBranchName ? (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Branch: {selectedBranchName}
				</Typography>
			) : null}

			{branchId == null ? (
				<Alert severity="info">Select a branch to choose a machine.</Alert>
			) : (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
					<Box
						sx={{
							display: "grid",
							gap: 2,
							gridTemplateColumns: {
								xs: "1fr",
								sm: "repeat(2, minmax(0, 1fr))",
								md: "2fr 1fr 1fr",
							},
						}}
					>
						<SearchableOptionSelect
							label="Machine"
							size="small"
							fullWidth
							required
							loading={machinesLoading}
							options={machineOptions}
							value={machineId}
							onChange={(next) => setMachineId(next === "" ? "" : Number(next))}
							helperText="Required — history is reported for one machine at a time"
						/>
						<TextField
							type="date"
							label="From"
							size="small"
							fullWidth
							value={dateFrom}
							onChange={(e) => setDateFrom(e.target.value)}
							InputLabelProps={{ shrink: true }}
							helperText="Blank = all time"
						/>
						<TextField
							type="date"
							label="To"
							size="small"
							fullWidth
							value={dateTo}
							onChange={(e) => setDateTo(e.target.value)}
							InputLabelProps={{ shrink: true }}
						/>
					</Box>

					{machinesError ? <Alert severity="error">{machinesError}</Alert> : null}
					{error ? <Alert severity="error">{error}</Alert> : null}

					{machineId === "" ? (
						<Alert severity="info">
							Pick a machine to see its full maintenance history.
						</Alert>
					) : loading && payload.machine === null ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<MachineHistoryPanels payload={payload} summary={summary} loading={loading} />
					)}
				</Box>
			)}
		</Box>
	);
}
