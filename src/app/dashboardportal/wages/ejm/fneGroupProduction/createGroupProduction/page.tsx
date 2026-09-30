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
import {
	NUMBER_FIELDS,
	groupProductionSaveSchema,
	type GroupProductionLine,
	type GroupProductionSetup,
	type NumberField,
	type Option,
} from "../types";

const formatPeriod = (p: ForthnightPeriod) =>
	`${p.start_date} → ${p.end_date}${p.type_of_period === 1 ? " (1st half)" : " (2nd half)"}`;

const EMPTY_SETUP: GroupProductionSetup = Object.freeze({
	machines: [],
	shifts: [],
	qualities_by_dept: {},
}) as GroupProductionSetup;
const NO_QUALITIES: Option[] = [];

const createBlankLine = (): GroupProductionLine => ({
	id: `new-${Math.random().toString(36).slice(2)}`,
	savedId: null,
	machine_id: null,
	shift_id: null,
	quality_id: null,
	production: "",
	target_prod: "",
	max_target_production: "",
	conv_production: "",
});
// Only saved rows count as data, so the next blank row appears after a save.
const isSaved = (l: GroupProductionLine) => l.savedId !== null;
const getLineId = (l: GroupProductionLine) => l.id;
const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const numText = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function GroupProductionEntry() {
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
	const [setup, setSetup] = useState<GroupProductionSetup>(EMPTY_SETUP);
	const [busyLine, setBusyLine] = useState<string | null>(null);
	const [snackbar, setSnackbar] = useState<{
		open: boolean;
		message: string;
		severity: "success" | "error";
	}>({ open: false, message: "", severity: "success" });

	const { items: lines, setItems: setLines, replaceItems } = useLineItems<GroupProductionLine>({
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

	// Beaming / Press machines, shifts and per-department qualities for the branch.
	useEffect(() => {
		if (branchId === null) return;
		(async () => {
			const { data, error } = await fetchWithCookie(
				`${apiRoutesPortalMasters.EJM_FNE_GROUP_PROD_SETUP}?branch_id=${branchId}`,
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
			`${apiRoutesPortalMasters.EJM_FNE_GROUP_PROD_ROWS}?${params}`,
			"GET"
		);
		if (error || !data) {
			notify(error || "Failed to load group production", "error");
			return;
		}
		replaceItems(
			(data.data || []).map((r: Record<string, unknown>) => ({
				id: `saved-${r.grp_prod_id}`,
				savedId: r.grp_prod_id as number,
				machine_id: (r.machine_id as number) ?? null,
				shift_id: (r.shift_id as number) ?? null,
				quality_id: (r.quality_id as number) ?? null,
				production: numText(r.production),
				target_prod: numText(r.target_prod),
				max_target_production: numText(r.max_target_production),
				conv_production: numText(r.conv_production),
			}))
		);
	}, [period, branchId, notify, replaceItems]);

	useEffect(() => {
		loadLines();
	}, [loadLines]);

	const updateLine = useCallback(
		(id: string, patch: Partial<GroupProductionLine>) =>
			setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))),
		[setLines]
	);

	const qualitiesFor = useCallback(
		(machineId: number | null) => {
			const machine = setup.machines.find((m) => m.value === machineId);
			return machine ? setup.qualities_by_dept[String(machine.dept_id)] ?? NO_QUALITIES : NO_QUALITIES;
		},
		[setup]
	);

	const saveLine = useCallback(
		async (line: GroupProductionLine) => {
			const parsed = groupProductionSaveSchema.safeParse({
				period_id: period?.forthnight_id,
				branch_id: branchId,
				grp_prod_id: line.savedId,
				machine_id: line.machine_id,
				shift_id: line.shift_id,
				quality_id: line.quality_id,
				production: toNumberOrNull(line.production),
				target_prod: toNumberOrNull(line.target_prod),
				max_target_production: toNumberOrNull(line.max_target_production),
				conv_production: toNumberOrNull(line.conv_production),
			});
			if (!parsed.success) return notify(parsed.error.issues[0].message, "error");

			setBusyLine(line.id);
			try {
				const { data, error } = await fetchWithCookie(
					apiRoutesPortalMasters.EJM_FNE_GROUP_PROD_SAVE,
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

	const columns = useMemo<TransactionLineColumn<GroupProductionLine>[]>(
		() => [
			{
				id: "machine",
				header: "Machine",
				minWidth: "240px",
				renderCell: ({ item }) => (
					<SearchableSelect
						variant="bare"
						options={setup.machines}
						value={setup.machines.find((m) => m.value === item.machine_id) ?? null}
						// A different machine may mean a different department, so its quality resets.
						onChange={(opt) => updateLine(item.id, { machine_id: opt?.value ?? null, quality_id: null })}
						getOptionLabel={(o) => o.label}
						isOptionEqualToValue={(o, v) => o.value === v.value}
						placeholder="Select machine"
						disabled={busy}
					/>
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
			{
				id: "quality",
				header: "Quality",
				minWidth: "640px",
				renderCell: ({ item }) => {
					const options = qualitiesFor(item.machine_id);
					return (
						<SearchableSelect
							variant="bare"
							options={options}
							value={options.find((q) => q.value === item.quality_id) ?? null}
							onChange={(opt) => updateLine(item.id, { quality_id: opt?.value ?? null })}
							getOptionLabel={(o) => o.label}
							isOptionEqualToValue={(o, v) => o.value === v.value}
							placeholder={item.machine_id === null ? "Select machine first" : "Select quality"}
							noOptionsText="No qualities in this machine's department master"
							disabled={busy || item.machine_id === null}
						/>
					);
				},
			},
			...NUMBER_FIELDS.map(
				({ key, label, readOnly }): TransactionLineColumn<GroupProductionLine> => ({
					id: key,
					header: label,
					width: "130px",
					renderCell: ({ item }) => (
						<TextField
							size="small"
							type="number"
							value={item[key as NumberField]}
							onChange={(e) => updateLine(item.id, { [key]: e.target.value })}
							disabled={busy}
							slotProps={{ input: { readOnly } }}
							fullWidth
						/>
					),
				})
			),
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
		[setup, busy, qualitiesFor, updateLine, saveLine]
	);

	return (
		<Box className="flex flex-col gap-4 p-4">
			<Box className="flex items-center justify-between gap-3">
				<Typography variant="h5">EJM MC Group Production</Typography>
				<Button variant="outlined" onClick={() => router.push("/dashboardportal/wages/ejm/fneGroupProduction")}>
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
					title="Beaming & Press Production"
					items={lines}
					getItemId={getLineId}
					canEdit
					columns={columns}
					selectable={false}
				/>
			) : (
				<Typography variant="body2" color="text.secondary">
					Select a fortnight period to enter production.
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

export default function CreateGroupProductionPage() {
	// useSearchParams (here and in useReportBranches) needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<GroupProductionEntry />
		</Suspense>
	);
}
