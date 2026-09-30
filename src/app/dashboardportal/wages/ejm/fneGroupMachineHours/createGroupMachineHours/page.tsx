"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, Button, Card, CardContent, Snackbar, TextField, Typography } from "@mui/material";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { TransactionLineItems, useLineItems, type TransactionLineColumn } from "@/components/ui/transaction";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { ForthnightPeriod } from "../../efffneCodeEntry/types";
import { mcHoursSaveSchema, type McHoursLine, type McHoursSetup } from "../types";

const formatPeriod = (p: ForthnightPeriod) =>
	`${p.start_date} → ${p.end_date}${p.type_of_period === 1 ? " (1st half)" : " (2nd half)"}`;

const EMPTY_SETUP: McHoursSetup = Object.freeze({ machines: [], shifts: [] }) as McHoursSetup;

const createBlankLine = (): McHoursLine => ({
	id: `new-${Math.random().toString(36).slice(2)}`,
	savedId: null,
	machine_id: null,
	shift_id: null,
	mc_hours: "",
	idle_hours: "",
});
// Only saved rows count as data, so the next blank row appears after a save.
const isSaved = (l: McHoursLine) => l.savedId !== null;
const getLineId = (l: McHoursLine) => l.id;
const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const numText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function McHoursEntry() {
	const router = useRouter();
	// Opened from the index row: ?branch_id=&period_id= preselect the page.
	const searchParams = useSearchParams();
	const paramNum = (key: string) => {
		const v = Number(searchParams.get(key));
		return Number.isFinite(v) && v > 0 ? v : null;
	};
	const initialPeriodId = paramNum("period_id");

	// Branch scope comes from the sidebar; the picker only appears when more than
	// one branch is in scope (standing norm in CLAUDE.md).
	const { branches, initialBranchId } = useReportBranches();
	const [branchId, setBranchId] = useState<number | null>(paramNum("branch_id") ?? initialBranchId);

	const [periods, setPeriods] = useState<ForthnightPeriod[]>([]);
	const [period, setPeriod] = useState<ForthnightPeriod | null>(null);
	const [setup, setSetup] = useState<McHoursSetup>(EMPTY_SETUP);
	const [busyLine, setBusyLine] = useState<string | null>(null);
	const [snackbar, setSnackbar] = useState<{
		open: boolean;
		message: string;
		severity: "success" | "error";
	}>({ open: false, message: "", severity: "success" });

	const { items: lines, setItems: setLines, replaceItems } = useLineItems<McHoursLine>({
		createBlankItem: createBlankLine,
		hasData: isSaved,
		getItemId: getLineId,
	});

	useEffect(() => {
		if (branchId === null && initialBranchId !== null) setBranchId(initialBranchId);
	}, [initialBranchId, branchId]);

	const notify = useCallback(
		(message: string, severity: "success" | "error" = "success") =>
			setSnackbar({ open: true, message, severity }),
		[]
	);

	useEffect(() => {
		(async () => {
			const { data, error } = await fetchWithCookie(apiRoutesPortalMasters.FORTHNIGHT_PERIODS, "GET");
			if (error || !data) {
				notify(error || "Failed to load fortnight periods", "error");
				return;
			}
			const list: ForthnightPeriod[] = data.data || [];
			setPeriods(list);
			setPeriod(
				(current) =>
					current ?? list.find((p) => p.forthnight_id === initialPeriodId) ?? list[0] ?? null
			);
		})();
	}, [notify, initialPeriodId]);

	// Beaming / Press machines and shifts for the branch.
	useEffect(() => {
		if (branchId === null) return;
		(async () => {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_GROUP_MC_HOURS_SETUP}?branch_id=${branchId}`,
				"GET"
			);
			if (error || !data) {
				notify(error || "Failed to load machines", "error");
				return;
			}
			setSetup(data.data ?? EMPTY_SETUP);
		})();
	}, [branchId, notify]);

	const loadLines = useCallback(async () => {
		if (!period || branchId === null) {
			replaceItems([]);
			return;
		}
		const params = new URLSearchParams({
			period_id: String(period.forthnight_id),
			branch_id: String(branchId),
		});
		const { data, error } = await fetchWithCookie(
			`${apiRoutesPortalMasters.EJM_GROUP_MC_HOURS_ROWS}?${params}`,
			"GET"
		);
		if (error || !data) {
			notify(error || "Failed to load machine hours", "error");
			return;
		}
		replaceItems(
			(data.data || []).map((r: Record<string, unknown>) => ({
				id: `saved-${r.grp_mc_hrs_id}`,
				savedId: r.grp_mc_hrs_id as number,
				machine_id: (r.machine_id as number) ?? null,
				shift_id: (r.shift_id as number) ?? null,
				mc_hours: numText(r.mc_hours),
				idle_hours: numText(r.idle_hours),
			}))
		);
	}, [period, branchId, notify, replaceItems]);

	useEffect(() => {
		loadLines();
	}, [loadLines]);

	const updateLine = useCallback(
		(id: string, patch: Partial<McHoursLine>) =>
			setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))),
		[setLines]
	);

	const saveLine = useCallback(
		async (line: McHoursLine) => {
			const parsed = mcHoursSaveSchema.safeParse({
				period_id: period?.forthnight_id,
				branch_id: branchId,
				grp_mc_hrs_id: line.savedId,
				machine_id: line.machine_id,
				shift_id: line.shift_id,
				mc_hours: toNumberOrNull(line.mc_hours),
				idle_hours: toNumberOrNull(line.idle_hours),
			});
			if (!parsed.success) return notify(parsed.error.issues[0].message, "error");

			setBusyLine(line.id);
			try {
				const { data, error } = await fetchWithCookie(
					apiRoutesPortalMasters.EJM_GROUP_MC_HOURS_SAVE,
					"POST",
					parsed.data
				);
				if (error) throw new Error(error);
				notify((data?.message as string) || "Saved");
				await loadLines();
			} catch (err: unknown) {
				notify(err instanceof Error ? err.message : "Save failed", "error");
			} finally {
				setBusyLine(null);
			}
		},
		[period, branchId, notify, loadLines]
	);

	const busy = busyLine !== null;

	const columns = useMemo<TransactionLineColumn<McHoursLine>[]>(
		() => [
			{
				id: "machine",
				header: "Machine",
				minWidth: "280px",
				renderCell: ({ item }) => (
					<SearchableSelect
						variant="bare"
						options={setup.machines}
						value={setup.machines.find((m) => m.value === item.machine_id) ?? null}
						onChange={(opt) => updateLine(item.id, { machine_id: opt?.value ?? null })}
						getOptionLabel={(o) => o.label}
						isOptionEqualToValue={(o, v) => o.value === v.value}
						placeholder="Select machine"
						disabled={busy}
					/>
				),
			},
			{
				id: "dept",
				header: "Department",
				width: "180px",
				// Saved from the machine; shown so the user can see where it posts.
				renderCell: ({ item }) => (
					<Typography variant="body2">
						{setup.machines.find((m) => m.value === item.machine_id)?.dept_desc ?? ""}
					</Typography>
				),
			},
			{
				id: "shift",
				header: "Shift",
				width: "110px",
				renderCell: ({ item }) => (
					<SearchableSelect
						variant="bare"
						options={setup.shifts}
						value={setup.shifts.find((s) => s.value === item.shift_id) ?? null}
						onChange={(opt) => updateLine(item.id, { shift_id: opt?.value ?? null })}
						getOptionLabel={(o) => o.label}
						isOptionEqualToValue={(o, v) => o.value === v.value}
						placeholder="Shift"
						disabled={busy}
					/>
				),
			},
			...(["mc_hours", "idle_hours"] as const).map(
				(key): TransactionLineColumn<McHoursLine> => ({
					id: key,
					header: key === "mc_hours" ? "MC Hours" : "Idle Hours",
					width: "140px",
					renderCell: ({ item }) => (
						<TextField
							size="small"
							type="number"
							value={item[key]}
							onChange={(e) => updateLine(item.id, { [key]: e.target.value })}
							disabled={busy}
							fullWidth
						/>
					),
				})
			),
			{
				id: "net_hours",
				header: "Net Hours",
				width: "110px",
				// Display only: not stored, derived from the two inputs.
				renderCell: ({ item }) =>
					item.mc_hours === "" ? "" : (Number(item.mc_hours) - Number(item.idle_hours || 0)).toFixed(2),
			},
			{
				id: "actions",
				header: "",
				width: "90px",
				renderCell: ({ item }) => (
					<Button size="small" variant="outlined" disabled={busy} onClick={() => saveLine(item)}>
						Save
					</Button>
				),
			},
		],
		[setup, busy, updateLine, saveLine]
	);

	return (
		<Box className="flex flex-col gap-4 p-4">
			<Box className="flex items-center justify-between gap-3">
				<Typography variant="h5">EJM Group Machine Hours</Typography>
				<Button variant="outlined" onClick={() => router.push("/dashboardportal/wages/ejm/fneGroupMachineHours")}>
					Back
				</Button>
			</Box>

			<Card>
				<CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
					<BranchScopePicker branches={branches} value={branchId} onChange={setBranchId} />
					<Box className="w-full md:max-w-sm">
						<SearchableSelect
							variant="outlined"
							label="Fortnight Period"
							options={periods}
							value={period}
							onChange={setPeriod}
							getOptionLabel={formatPeriod}
							isOptionEqualToValue={(o, v) => o.forthnight_id === v.forthnight_id}
							clearable={false}
							disabled={busy}
						/>
					</Box>
				</CardContent>
			</Card>

			{period ? (
				<TransactionLineItems
					title="Machine Hours"
					items={lines}
					getItemId={getLineId}
					canEdit
					columns={columns}
					selectable={false}
				/>
			) : (
				<Typography variant="body2" color="text.secondary">
					Select a fortnight period to enter machine hours.
				</Typography>
			)}

			<Snackbar
				open={snackbar.open}
				autoHideDuration={4000}
				onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
				anchorOrigin={{ vertical: "top", horizontal: "center" }}
			>
				<Alert
					severity={snackbar.severity}
					onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
					sx={{ width: "100%" }}
				>
					{snackbar.message}
				</Alert>
			</Snackbar>
		</Box>
	);
}

export default function CreateGroupMachineHoursPage() {
	// useSearchParams (here and in useReportBranches) needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<McHoursEntry />
		</Suspense>
	);
}
