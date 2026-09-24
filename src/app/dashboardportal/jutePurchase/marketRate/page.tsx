"use client";

import * as React from "react";
import {
	Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { SearchableOptionSelect } from "@/components/ui/SearchableOptionSelect";
import { deriveRates, initialManual } from "./deriveRates";

// Jute Market Rate — daily market rate per raw-jute item, recorded per SOURCE (each source is
// optional for a day; several sources may be entered for the same day). Items with a rate
// difference (Jute Rate Difference master) auto-fill from their base item; typing a rate
// overrides, clearing it goes back to auto. Blank rows are not saved.

type Source = { source_id: number; source_name: string };
type EnteredSource = Source & { item_count: number };
type RateItem = {
	item_id: number;
	item_name: string;
	item_grp_id: number;
	item_grp_name: string;
	rate: number | null;
	base_item_id: number | null;
	diff_amount: number | null;
};

const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const RATE_RE = /^\d*\.?\d{0,3}$/;

export default function JuteMarketRatePage() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => setMounted(true), []);

	const { coId } = useSelectedCompanyCoId();
	const [sources, setSources] = React.useState<Source[]>([]);
	const [rateDate, setRateDate] = React.useState(todayLocal());
	const [sourceId, setSourceId] = React.useState<number | "">("");
	const [items, setItems] = React.useState<RateItem[]>([]);
	const [entered, setEntered] = React.useState<EnteredSource[]>([]);
	const [rates, setRates] = React.useState<Record<number, string>>({});
	const [manual, setManual] = React.useState<Set<number>>(new Set());
	const [loading, setLoading] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [info, setInfo] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!coId) return;
		void fetchWithCookie<{ data: { sources: Source[] } }>(`${apiRoutesPortalMasters.JUTE_MARKET_RATE_SETUP}?co_id=${coId}`, "GET").then(
			({ data, error: err }) => {
				if (err) setError(err);
				setSources(data?.data?.sources ?? []);
			}
		);
	}, [coId]);

	const load = React.useCallback(async () => {
		if (!coId || sourceId === "" || !rateDate) return;
		setLoading(true);
		setInfo(null);
		const params = new URLSearchParams({ co_id: String(coId), source_id: String(sourceId), rate_date: rateDate });
		const { data, error: err } = await fetchWithCookie<{ data: { items: RateItem[]; entered_sources: EnteredSource[] } }>(
			`${apiRoutesPortalMasters.JUTE_MARKET_RATES}?${params.toString()}`,
			"GET"
		);
		setLoading(false);
		setError(err);
		const list = data?.data?.items ?? [];
		const saved: Record<number, number | null> = {};
		const asText: Record<number, string> = {};
		for (const it of list) {
			saved[it.item_id] = it.rate;
			asText[it.item_id] = it.rate == null ? "" : String(it.rate);
		}
		const man = initialManual(list, saved);
		setItems(list);
		setEntered(data?.data?.entered_sources ?? []);
		setManual(man);
		setRates(deriveRates(list, asText, man));
	}, [coId, sourceId, rateDate]);

	React.useEffect(() => {
		void load();
	}, [load]);

	const handleRate = (item: RateItem, value: string) => {
		if (!RATE_RE.test(value)) return;
		const nextManual = new Set(manual);
		// A derived item cleared by the user goes back to auto; anything typed is an override.
		if (value === "" && item.base_item_id != null) nextManual.delete(item.item_id);
		else nextManual.add(item.item_id);
		setManual(nextManual);
		setRates(deriveRates(items, { ...rates, [item.item_id]: value }, nextManual));
	};

	const handleSave = async () => {
		if (!coId || sourceId === "") return;
		const payload = items
			.filter((it) => (rates[it.item_id] ?? "").trim() !== "")
			.map((it) => ({ item_id: it.item_id, rate: Number(rates[it.item_id]) }));
		if (payload.some((p) => !(p.rate > 0))) {
			setError("Rates must be greater than 0.");
			return;
		}
		setSaving(true);
		setError(null);
		const { error: err } = await fetchWithCookie(apiRoutesPortalMasters.JUTE_MARKET_RATES_SAVE, "POST", {
			co_id: Number(coId),
			rate_date: rateDate,
			source_id: Number(sourceId),
			rates: payload,
		});
		setSaving(false);
		if (err) {
			setError(err);
			return;
		}
		await load();
		setInfo(`Saved ${payload.length} rate(s).`);
	};

	const baseName = React.useMemo(() => new Map(items.map((i) => [i.item_id, i.item_name])), [items]);

	if (!mounted) return null;
	if (!coId) {
		return (
			<Alert severity="warning" sx={{ m: 2 }}>
				Select a company to continue.
			</Alert>
		);
	}

	let lastGroup = "";

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Typography variant="h5" sx={{ fontWeight: 600 }}>
				Jute Market Rate
			</Typography>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				Enter the day&apos;s market rate per item for a source. Each source is optional; several sources can be entered for the same
				day. Items with a rate difference fill in from their base item — type to override, clear to go back to auto.
			</Typography>

			<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
				<TextField
					type="date"
					size="small"
					label="Date"
					value={rateDate}
					onChange={(e) => setRateDate(e.target.value)}
					InputLabelProps={{ shrink: true }}
					inputProps={{ max: todayLocal() }}
				/>
				<SearchableOptionSelect
					label="Source"
					size="small"
					options={sources.map((s) => ({ value: s.source_id, label: s.source_name }))}
					value={sourceId}
					onChange={(v) => setSourceId(v === "" ? "" : Number(v))}
					sx={{ minWidth: 240 }}
				/>
				{entered.length ? (
					<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
						<Typography variant="caption" color="text.secondary">
							Entered on this date:
						</Typography>
						{entered.map((s) => (
							<Chip
								key={s.source_id}
								size="small"
								color={s.source_id === sourceId ? "primary" : "default"}
								label={`${s.source_name} (${s.item_count})`}
								onClick={() => setSourceId(s.source_id)}
							/>
						))}
					</Box>
				) : null}
			</Box>

			{sources.length === 0 ? (
				<Alert severity="info" sx={{ mb: 2 }}>
					No market rate sources yet — add one in Jute Procurement → Market Rate Source.
				</Alert>
			) : null}
			{error ? (
				<Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
					{error}
				</Alert>
			) : null}
			{info ? (
				<Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo(null)}>
					{info}
				</Alert>
			) : null}

			{sourceId !== "" && items.length > 0 ? (
				<>
					<TableContainer component={Paper} variant="outlined" sx={{ maxHeight: "65vh" }}>
						<Table size="small" stickyHeader>
							<TableHead>
								<TableRow>
									<TableCell>Item</TableCell>
									<TableCell>Rate Difference</TableCell>
									<TableCell sx={{ width: 180 }}>Rate</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{items.flatMap((it) => {
									const rows: React.ReactNode[] = [];
									if (it.item_grp_name !== lastGroup) {
										lastGroup = it.item_grp_name;
										rows.push(
											<TableRow key={`g-${it.item_grp_id}`}>
												<TableCell colSpan={3} sx={{ fontWeight: 600, bgcolor: "action.hover" }}>
													{it.item_grp_name}
												</TableCell>
											</TableRow>
										);
									}
									const derived = it.base_item_id != null;
									const auto = derived && !manual.has(it.item_id);
									rows.push(
										<TableRow key={it.item_id}>
											<TableCell>{it.item_name}</TableCell>
											<TableCell>
												{derived ? (
													<Typography variant="body2" color="text.secondary">
														{baseName.get(it.base_item_id!) ?? `#${it.base_item_id}`} {Number(it.diff_amount) >= 0 ? "+" : "−"}{" "}
														{Math.abs(Number(it.diff_amount))}
														<Chip size="small" sx={{ ml: 1 }} label={auto ? "auto" : "override"} color={auto ? "default" : "warning"} />
													</Typography>
												) : null}
											</TableCell>
											<TableCell>
												<TextField
													size="small"
													value={rates[it.item_id] ?? ""}
													onChange={(e) => handleRate(it, e.target.value)}
													inputProps={{ inputMode: "decimal", "aria-label": `Rate for ${it.item_name}` }}
													fullWidth
												/>
											</TableCell>
										</TableRow>
									);
									return rows;
								})}
							</TableBody>
						</Table>
					</TableContainer>
					<Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 2 }}>
						<Button onClick={() => void load()} disabled={loading || saving}>
							Reset
						</Button>
						<Button variant="contained" onClick={() => void handleSave()} disabled={loading || saving}>
							{saving ? "Saving…" : "Save"}
						</Button>
					</Box>
				</>
			) : null}
			{sourceId !== "" && !loading && items.length === 0 ? <Alert severity="info">No raw-jute items for this company.</Alert> : null}
		</Box>
	);
}
