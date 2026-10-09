"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Box, Button, Card, CardContent, Chip, Snackbar, TextField, Typography } from "@mui/material";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { TransactionLineItems, useLineItems, type TransactionLineColumn } from "@/components/ui/transaction";
import { BranchScopePicker } from "@/components/reports/BranchScopePicker";
import { useReportBranches } from "@/components/reports/useReportBranches";
import type { ForthnightPeriod } from "../../efffneCodeEntry/types";
import {
	FNE_QUAL_TARGET_STATUS,
	fneQualTargetSaveSchema,
	type FneQualTargetLine,
	type QualityDepartmentOption,
	type QualityOption,
} from "../types";

const formatPeriod = (p: ForthnightPeriod) =>
	`${p.start_date} → ${p.end_date}${p.type_of_period === 1 ? " (1st half)" : " (2nd half)"}`;

const createBlankLine = (): FneQualTargetLine => ({
	id: `new-${Math.random().toString(36).slice(2)}`,
	savedId: null,
	quality_id: null,
	process: null,
	eff_pc: "",
	status_id: FNE_QUAL_TARGET_STATUS.DRAFT,
});
// Only saved rows count as data, so the next blank row appears after a save.
const isSaved = (l: FneQualTargetLine) => l.savedId !== null;
const isApproved = (l: FneQualTargetLine) => l.status_id === FNE_QUAL_TARGET_STATUS.APPROVED;
const getLineId = (l: FneQualTargetLine) => l.id;

function FneQualTargetEntry() {
	const router = useRouter();
	// Opened from the index row: ?branch_id=&period_id=&dept_id= preselect the page.
	const searchParams = useSearchParams();
	const paramNum = (key: string) => {
		const v = Number(searchParams.get(key));
		return Number.isFinite(v) && v > 0 ? v : null;
	};
	const initialPeriodId = paramNum("period_id");
	const initialDeptId = paramNum("dept_id");

	// Branch scope comes from the sidebar; the picker only appears when more than
	// one branch is in scope (standing norm in CLAUDE.md).
	const { branches, coId, initialBranchId } = useReportBranches();
	const [branchId, setBranchId] = useState<number | null>(paramNum("branch_id") ?? initialBranchId);

	const [periods, setPeriods] = useState<ForthnightPeriod[]>([]);
	const [period, setPeriod] = useState<ForthnightPeriod | null>(null);
	const [departments, setDepartments] = useState<QualityDepartmentOption[]>([]);
	const [dept, setDept] = useState<QualityDepartmentOption | null>(null);
	const [qualities, setQualities] = useState<QualityOption[]>([]);
	// The link page's process names (Hemming / Heracle / Handsewer / Press) — every row may pick one.
	const [processes, setProcesses] = useState<string[]>([]);
	const [busyLine, setBusyLine] = useState<string | null>(null);
	const [snackbar, setSnackbar] = useState<{
		open: boolean;
		message: string;
		severity: "success" | "error";
	}>({ open: false, message: "", severity: "success" });

	const { items: lines, setItems: setLines, replaceItems } = useLineItems<FneQualTargetLine>({
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

	// Only departments rated in ejm_wages_quality_rate — that table is the quality master here.
	useEffect(() => {
		if (coId === null || branchId === null) return;
		(async () => {
			const params = new URLSearchParams({ branch_id: String(branchId), rated: "1" });
			const { data, error } = await fetchWithCookie<{ data: { dept_id: number; dept_desc: string }[] }>(
				`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_DEPARTMENTS}?${params}`,
				"GET"
			);
			if (error || !data) {
				notify(error || "Failed to load departments", "error");
				return;
			}
			const list: QualityDepartmentOption[] = (data.data ?? []).map((d) => ({
				value: String(d.dept_id),
				label: d.dept_desc,
			}));
			setDepartments(list);
			setDept(list.find((d) => Number(d.value) === initialDeptId) ?? null);
		})();
	}, [coId, branchId, notify, initialDeptId]);

	const loadLines = useCallback(async () => {
		if (!period || !dept) {
			setQualities([]);
			replaceItems([]);
			return;
		}
		const params = new URLSearchParams({ period_id: String(period.forthnight_id), dept_id: dept.value });
		const { data, error } = await fetchWithCookie(
			`${apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_GRID}?${params}`,
			"GET"
		);
		if (error || !data) {
			notify(error || "Failed to load quality targets", "error");
			return;
		}
		setQualities(data.qualities || []);
		setProcesses(data.processes || []);
		replaceItems(
			(data.data || []).map((r: Record<string, unknown>) => ({
				id: `saved-${r.fne_qual_traget_id}`,
				savedId: r.fne_qual_traget_id as number,
				quality_id: r.quality_id as number,
				process: (r.process as string | null) ?? null,
				eff_pc: r.eff_pc === null || r.eff_pc === undefined ? "" : String(r.eff_pc),
				status_id: Number(r.status_id ?? FNE_QUAL_TARGET_STATUS.DRAFT),
			}))
		);
	}, [period, dept, notify, replaceItems]);

	useEffect(() => {
		loadLines();
	}, [loadLines]);

	const updateLine = useCallback(
		(id: string, patch: Partial<FneQualTargetLine>) =>
			setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))),
		[setLines]
	);

	/** Saves one line; approve=true also locks it. The next blank row appears on reload. */
	const saveLine = useCallback(
		async (line: FneQualTargetLine, approve: boolean) => {
			if (!period || !dept) return notify("Select a fortnight and department first", "error");
			if (line.quality_id === null) return notify("Select a quality", "error");
			if (line.eff_pc.trim() === "") return notify("Enter Target Prod/Eff(5)", "error");

			const parsed = fneQualTargetSaveSchema.safeParse({
				period_id: period.forthnight_id,
				dept_id: Number(dept.value),
				approve,
				lines: [{ id: line.savedId, quality_id: line.quality_id, process: line.process, eff_pc: Number(line.eff_pc) }],
			});
			if (!parsed.success) return notify(parsed.error.issues[0].message, "error");

			setBusyLine(line.id);
			try {
				const { data, error } = await fetchWithCookie(
					apiRoutesPortalMasters.EJM_FNE_QUAL_TARGET_SAVE,
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
		[period, dept, notify, loadLines]
	);

	const columns = useMemo<TransactionLineColumn<FneQualTargetLine>[]>(
		() => [
			{
				id: "quality",
				header: "Quality",
				minWidth: "560px",
				renderCell: ({ item }) => {
					// A quality may appear once per process (and once without) per fortnight + department.
					return (
						<SearchableSelect
							variant="bare"
							options={qualities}
							value={qualities.find((q) => q.value === item.quality_id) ?? null}
							onChange={(opt) => updateLine(item.id, { quality_id: opt?.value ?? null, process: null })}
							getOptionLabel={(o) => (o.ran ? `${o.label} ● ran this fortnight` : o.label)}
							isOptionEqualToValue={(o, v) => o.value === v.value}
							placeholder="Select quality"
							// Saved rows are keyed on their quality; change the target instead.
							disabled={isSaved(item) || busyLine !== null}
						/>
					);
				},
			},
			{
				id: "process",
				header: "Process",
				width: "180px",
				renderCell: ({ item }) => {
					const used = new Set(
						lines
							.filter((l) => l.id !== item.id && l.quality_id === item.quality_id)
							.map((l) => l.process)
					);
					const options = processes
						.filter((p) => !used.has(p) || p === item.process)
						.map((p) => ({ value: p, label: p }));
					return (
						<SearchableSelect
							variant="bare"
							options={options}
							value={options.find((o) => o.value === item.process) ?? null}
							onChange={(opt) => updateLine(item.id, { process: opt?.value ?? null })}
							getOptionLabel={(o) => o.label}
							isOptionEqualToValue={(o, v) => o.value === v.value}
							placeholder="Select process"
							disabled={isApproved(item) || busyLine !== null}
						/>
					);
				},
			},
			{
				id: "std_target",
				header: "Std Target Prod",
				width: "140px",
				renderCell: ({ item }) => (
					<Typography variant="body2">
						{qualities.find((q) => q.value === item.quality_id)?.target ?? ""}
					</Typography>
				),
			},
			{
				id: "eff_pc",
				header: "Target Prod/Eff(5)",
				width: "180px",
				renderCell: ({ item }) => (
					<TextField
						size="small"
						type="number"
						value={item.eff_pc}
						onChange={(e) => updateLine(item.id, { eff_pc: e.target.value })}
						disabled={isApproved(item) || busyLine !== null}
						fullWidth
					/>
				),
			},
			{
				id: "status",
				header: "Status",
				width: "120px",
				renderCell: ({ item }) =>
					isSaved(item) ? (
						<Chip
							size="small"
							label={isApproved(item) ? "Approved" : "Drafted"}
							color={isApproved(item) ? "success" : "default"}
						/>
					) : null,
			},
			{
				id: "actions",
				header: "",
				width: "200px",
				renderCell: ({ item }) =>
					isApproved(item) ? null : (
						<Box className="flex gap-2">
							<Button
								size="small"
								variant="outlined"
								disabled={busyLine !== null}
								onClick={() => saveLine(item, false)}
							>
								Save
							</Button>
							{isSaved(item) && (
								<Button
									size="small"
									variant="contained"
									color="success"
									disabled={busyLine !== null}
									onClick={() => saveLine(item, true)}
								>
									Approve
								</Button>
							)}
						</Box>
					),
			},
		],
		[lines, qualities, busyLine, updateLine, saveLine]
	);

	return (
		<Box className="flex flex-col gap-4 p-4">
			<Box className="flex items-center justify-between gap-3">
				<Typography variant="h5">Fortnightly Wages Quality Target (EJM)</Typography>
				<Button variant="outlined" onClick={() => router.push("/dashboardportal/wages/ejm/fnewagesEntry")}>
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
							disabled={busyLine !== null}
						/>
					</Box>
					<Box className="w-full md:max-w-sm">
						<SearchableSelect
							variant="outlined"
							label="Department"
							options={departments}
							value={dept}
							onChange={setDept}
							getOptionLabel={(o) => o.label}
							isOptionEqualToValue={(o, v) => o.value === v.value}
							noOptionsText="No departments with wages quality rates"
							disabled={busyLine !== null}
						/>
					</Box>
				</CardContent>
			</Card>

			{period && dept ? (
				<TransactionLineItems
					title="Quality Targets"
					items={lines}
					getItemId={getLineId}
					canEdit
					columns={columns}
					selectable={false}
				/>
			) : (
				<Typography variant="body2" color="text.secondary">
					Select a fortnight period and department to enter targets.
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

export default function CreateFneQualTargetPage() {
	// useSearchParams (here and in useReportBranches) needs a Suspense boundary.
	return (
		<Suspense fallback={null}>
			<FneQualTargetEntry />
		</Suspense>
	);
}
