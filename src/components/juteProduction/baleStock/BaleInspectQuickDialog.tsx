"use client";

import * as React from "react";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from "@mui/material";
import { ClipboardCheck as InspectIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fetchBaleStockRows, markBalesInspected, type BaleStockRow } from "@/utils/baleStockService";
import BaleRangeSelector from "./BaleRangeSelector";
import BaleStockGrid from "./BaleStockGrid";
import { canInspect, latestPressDate, seriesOptionsFromRows, todayISO } from "./baleStockCalc";
import InspectFormFields from "./InspectFormFields";
import { buildInspectPayload, inspectDefaults, inspectSchema, type InspectFormValues } from "./inspectSchema";

/**
 * Prop contract consumed by the Finishing Stock page (it imports this exactly).
 * Do not rename or retype these without changing that page too.
 */
export interface BaleInspectQuickDialogProps {
	open: boolean;
	onClose: () => void;
	coId: number;
	branchId: number;
	/** The stock day being viewed — bales are loaded as on it and the inspection defaults to it. */
	asOn: string;
	finishingQualityId: number;
	/** Display name of the quality, for the title and the empty state. */
	qualityName: string;
	/** Called with the server's count after a successful save; the dialog then closes itself. */
	onMarked: (marked: number) => void;
}

/**
 * @component BaleInspectQuickDialog
 * @description The "Mark inspected" entry point on a Finishing Stock derived
 * sacking line: loads that quality's uninspected bales in stock as on the day
 * (GET /baleStock/bales?status=NOT_INSPECTED&finishing_quality_id), lets the
 * operator tick them (checkboxes or a bale-number range), captures the
 * inspection fields with the shared `inspectSchema` and saves in one POST.
 * The body is mounted only while open so each opening reloads and resets.
 */
export default function BaleInspectQuickDialog(props: BaleInspectQuickDialogProps) {
	return (
		<Dialog open={props.open} onClose={props.onClose} maxWidth="lg" fullWidth>
			{props.open ? <QuickBody {...props} /> : null}
		</Dialog>
	);
}

function QuickBody({ onClose, coId, branchId, asOn, finishingQualityId, qualityName, onMarked }: BaleInspectQuickDialogProps) {
	const today = todayISO();
	const [rows, setRows] = React.useState<BaleStockRow[]>([]);
	const [loading, setLoading] = React.useState(false);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [saveError, setSaveError] = React.useState<string | null>(null);
	const [selectedIds, setSelectedIds] = React.useState<number[]>([]);

	React.useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setLoadError(null);
		fetchBaleStockRows({ coId, branchId, asOn, status: "NOT_INSPECTED", finishingQualityId })
			.then((result) => {
				if (cancelled) return;
				setRows(result.rows);
				setSelectedIds([]);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setLoadError(err.message);
				setRows([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [coId, branchId, asOn, finishingQualityId]);

	const series = React.useMemo(() => seriesOptionsFromRows(rows), [rows]);
	const selectedRows = React.useMemo(() => {
		const wanted = new Set(selectedIds);
		return rows.filter((r) => wanted.has(r.bale_entry_id));
	}, [rows, selectedIds]);
	const gate = React.useMemo(() => canInspect(selectedRows), [selectedRows]);
	const minDate = React.useMemo(() => latestPressDate(selectedRows), [selectedRows]);

	const {
		control,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<InspectFormValues>({
		resolver: zodResolver(inspectSchema),
		// The day being viewed, so the marked bales read as inspected on it after the refresh.
		defaultValues: inspectDefaults(asOn <= today ? asOn : today),
		mode: "onTouched",
	});

	const addIds = (ids: number[]) =>
		setSelectedIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => next.add(id));
			return [...next];
		});

	const submit = async (values: InspectFormValues) => {
		if (!gate.ok) return;
		setSaveError(null);
		const result = await markBalesInspected(buildInspectPayload(values, { coId, branchId, baleEntryIds: selectedIds }));
		if (!result.ok) {
			setSaveError(result.error ?? "Could not mark the bales inspected");
			return;
		}
		onMarked(result.marked);
		onClose();
	};

	const empty = !loading && !loadError && rows.length === 0;

	return (
		<>
			<DialogTitle>Mark inspected — {qualityName}</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography variant="body2" color="text.secondary">
						Uninspected {qualityName} bales in stock as on {asOn}. Tick the bales (or pick a bale-number range),
						fill in the inspection and save.
					</Typography>
					{loadError ? <Alert severity="error">{loadError}</Alert> : null}
					{saveError ? <Alert severity="error">{saveError}</Alert> : null}
					{empty ? (
						<Alert severity="info">
							No uninspected {qualityName} bales in stock as on {asOn} — every bale of this quality is already
							inspected, despatched or repacked.
						</Alert>
					) : (
						<>
							<BaleRangeSelector
								series={series}
								rows={rows}
								selectedCount={selectedIds.length}
								onAddIds={addIds}
								onClearSelection={() => setSelectedIds([])}
								disabled={loading || isSubmitting}
							/>
							<BaleStockGrid
								rows={rows}
								loading={loading}
								selectedIds={selectedIds}
								onSelectionChange={setSelectedIds}
								compact
								emptyText="No uninspected bales"
							/>
							{selectedIds.length > 0 && !gate.ok ? <Alert severity="error">{gate.reason}</Alert> : null}
							<Box>
								<Typography variant="subtitle2" sx={{ mb: 1 }}>
									Inspection
								</Typography>
								<InspectFormFields
									control={control}
									errors={errors}
									disabled={isSubmitting}
									maxDate={today}
									minDate={minDate}
								/>
							</Box>
						</>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={isSubmitting}>
					{empty ? "Close" : "Cancel"}
				</Button>
				{!empty ? (
					<Button
						variant="contained"
						startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : <InspectIcon size={16} />}
						onClick={() => {
							void handleSubmit(submit)();
						}}
						disabled={!gate.ok || isSubmitting || loading}
						sx={{ minHeight: 40 }}
					>
						{isSubmitting ? "Saving…" : `Mark ${selectedIds.length} inspected`}
					</Button>
				) : null}
			</DialogActions>
		</>
	);
}
