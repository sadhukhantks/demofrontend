"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Card, CircularProgress, Skeleton, TextField, Typography } from "@mui/material";
import { alpha, lighten, useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import { useSidebarContext } from "@/components/dashboard/sidebarContext";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import { normalisePortalPath } from "@/utils/portalPermissions";
import { brand } from "@/styles/brand";
import { resolveIcon } from "@/components/dashboard/ModuleMenuGrid";

type Monthly = { month: string; count: number; amount: number | null };
type Source = {
  label: string;
  unit: string | null;
  snapshot: boolean;
  /** Custom tile: the big number is `amount`, not `count`. */
  value_tile?: boolean;
  /** Custom tile caption (replaces the default "Total ₹ …" / "Records · …" line). */
  note?: string | null;
  count: number;
  amount: number | null;
  monthly: Monthly[];
  status: { status: string; count: number }[];
};
type Dashboard = { module: string; date_from: string; date_to: string; sources: Source[]; skipped: string[] };

// Validated categorical order (dataviz reference palette) — fixed slots, never cycled; max 4 series.
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500"],
};

const nf = new Intl.NumberFormat("en-IN");
const nf2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Indian short scale: 2.25 Cr, 4.3 L, 12,500. */
export function fmtShort(v: number, unit: string | null): string {
  const a = Math.abs(v);
  const n = a >= 1e7 ? `${nf2.format(v / 1e7)} Cr` : a >= 1e5 ? `${nf2.format(v / 1e5)} L` : nf.format(Math.round(v));
  if (unit === "₹") return `₹ ${n}`;
  return unit ? `${n} ${unit}` : n;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Every YYYY-MM between two ISO dates, so empty months plot as 0 instead of vanishing. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};

export function ModuleDashboard({ modulePath }: { modulePath: string }) {
  const { selectedCompany, selectedBranches, parentMenus } = useSidebarContext();
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const navy = dark ? lighten(brand.navyInk, 0.55) : brand.navyInk;
  const green = dark ? brand.greenLight : brand.green;
  const colors = dark ? SERIES.dark : SERIES.light;
  const grid = theme.palette.divider;

  const key = normalisePortalPath(modulePath).split("/")[0];
  const title =
    (Array.isArray(parentMenus) ? parentMenus : []).find((p) => normalisePortalPath(p.menu_path) === key)
      ?.menu_name ?? key;

  const [mounted, setMounted] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    const now = new Date();
    setTo(ymd(now));
    setFrom(ymd(new Date(now.getFullYear(), now.getMonth() - 11, 1)));
    setMounted(true);
  }, []);

  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const coId = selectedCompany?.co_id;
  const branchKey = selectedBranches.join(",");
  useEffect(() => {
    if (!mounted || !coId || !from || !to) return;
    let stale = false;
    setLoading(true);
    const qs = new URLSearchParams({ co_id: String(coId), branch_ids: branchKey, date_from: from, date_to: to });
    fetchWithCookie<{ data: Dashboard }>(`${apiRoutesPortalMasters.MODULE_DASHBOARD}/${key}?${qs}`).then(
      ({ data: res, error: err }) => {
        if (stale) return;
        setError(err);
        setData(res?.data ?? null);
        setLoading(false);
      },
    );
    return () => { stale = true; };
  }, [mounted, coId, branchKey, from, to, key]);

  const charts = useMemo(() => {
    if (!data) return null;
    const months = monthsBetween(data.date_from, data.date_to);
    const dated = data.sources.filter((s) => !s.snapshot);
    // Trend plots one unit only (one axis): the first measured unit, else document counts.
    const unit = dated.find((s) => s.unit)?.unit ?? null;
    const trend = (unit ? dated.filter((s) => s.unit === unit) : dated).slice(0, 4);
    const series = trend.map((s, i) => {
      const byMonth = new Map(s.monthly.map((r) => [r.month, unit ? r.amount ?? 0 : r.count]));
      return {
        id: `s${i}`,
        label: s.label,
        color: colors[i],
        data: months.map((m) => byMonth.get(m) ?? 0),
        valueFormatter: (v: number | null) => (v == null ? "—" : unit ? fmtShort(v, unit) : nf.format(v)),
      };
    });
    const statusSrc = data.sources.find((s) => s.status.length > 0) ?? null;
    return { months, unit, series, statusSrc };
  }, [data, colors]);

  if (!mounted) return null;

  const chartSx = {
    "& .MuiChartsGrid-line": { stroke: grid },
    "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: grid },
    "& .MuiLineElement-root": { strokeWidth: 2 },
  } as const;

  const cardSx = {
    borderRadius: "10px",
    borderColor: dark ? "divider" : "#e3e8f0",
    boxShadow: `0 1px 2px ${alpha(brand.navyInk, 0.06)}`,
  } as const;

  const panel = (heading: string, sub: string, body: React.ReactNode) => (
    <Card variant="outlined" sx={{ ...cardSx, p: 2, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700, color: navy, fontSize: "0.95rem" }}>{heading}</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>{sub}</Typography>
      <Box sx={{ mt: 1 }}>{body}</Box>
    </Card>
  );

  const counts = data?.sources ?? [];
  const records = counts.filter((s) => !s.value_tile && !s.note);
  const range = data ? `${monthLabel(data.date_from.slice(0, 7))} – ${monthLabel(data.date_to.slice(0, 7))}` : "";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Header + filters in one row */}
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: "-0.01em", color: navy }}>
            {title}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {selectedCompany?.co_name ?? ""} · {selectedBranches.length} branch
            {selectedBranches.length === 1 ? "" : "es"}
          </Typography>
        </Box>
        {loading && <CircularProgress size={20} sx={{ color: green }} />}
        <TextField size="small" type="date" label="From" value={from}
          onChange={(e) => e.target.value && setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={to}
          onChange={(e) => e.target.value && setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {!coId && <Alert severity="info">Select a company in the sidebar to see the dashboard.</Alert>}
      {data && data.skipped.length > 0 && (
        <Alert severity="info">Not set up for this company: {data.skipped.join(", ")}</Alert>
      )}

      {/* KPI tiles */}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        {!data && coId && !error
          ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} variant="rounded" height={104} />)
          : counts.map((s) => {
              const Icon = resolveIcon(s.label, key);
              return (
                <Card key={s.label} variant="outlined" sx={{ ...cardSx, borderLeft: `3px solid ${green}`, p: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "text.secondary" }}>
                    <Icon size={16} aria-hidden />
                    <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {s.label}
                    </Typography>
                  </Box>
                  <Typography sx={{ mt: 1, fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.1, color: navy, fontVariantNumeric: "tabular-nums" }}>
                    {s.value_tile ? fmtShort(s.amount ?? 0, s.unit) : nf.format(s.count)}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                    {s.note
                      ? s.note
                      : s.value_tile
                      ? range
                      : s.amount != null
                      ? `${s.unit === "₹" ? "Total" : "Qty"} ${fmtShort(s.amount, s.unit)}`
                      : s.snapshot ? "Total records" : `Records · ${range}`}
                  </Typography>
                </Card>
              );
            })}
      </Box>

      {/* Charts */}
      {data && charts && (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" } }}>
          {charts.series.length > 0 &&
            panel(
              charts.unit === "₹" ? "Monthly value" : charts.unit ? `Monthly quantity (${charts.unit})` : "Monthly records",
              range,
              <LineChart
                height={300}
                sx={chartSx}
                grid={{ horizontal: true }}
                xAxis={[{ scaleType: "point", data: charts.months.map(monthLabel) }]}
                yAxis={[{ valueFormatter: (v: number) => (charts.unit ? fmtShort(v, null) : nf.format(v)), width: 64 }]}
                series={charts.series.map((s) => ({ ...s, showMark: charts.months.length <= 13, area: false }))}
                hideLegend={charts.series.length < 2}
                slotProps={{ legend: { direction: "horizontal", position: { vertical: "bottom", horizontal: "center" } } }}
                margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
              />,
            )}

          {records.length > 1 &&
            panel(
              "Records by type",
              charts.series.length ? range : "All time",
              <BarChart
                layout="horizontal"
                height={Math.max(180, records.length * 40 + 40)}
                sx={chartSx}
                grid={{ vertical: true }}
                yAxis={[{ scaleType: "band", data: records.map((s) => s.label), width: 120 }]}
                xAxis={[{ valueFormatter: (v: number) => fmtShort(v, null) }]}
                series={[{ data: records.map((s) => s.count), color: navy, label: "Records", valueFormatter: (v) => nf.format(v ?? 0) }]}
                borderRadius={4}
                hideLegend
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              />,
            )}

          {charts.statusSrc &&
            panel(
              `${charts.statusSrc.label} by status`,
              range,
              <BarChart
                layout="horizontal"
                height={Math.max(180, Math.min(charts.statusSrc.status.length, 8) * 36 + 40)}
                sx={chartSx}
                grid={{ vertical: true }}
                yAxis={[{ scaleType: "band", data: charts.statusSrc.status.slice(0, 8).map((s) => s.status), width: 140 }]}
                xAxis={[{ valueFormatter: (v: number) => fmtShort(v, null) }]}
                series={[{ data: charts.statusSrc.status.slice(0, 8).map((s) => s.count), color: green, label: "Documents", valueFormatter: (v) => nf.format(v ?? 0) }]}
                borderRadius={4}
                hideLegend
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              />,
            )}
        </Box>
      )}
    </Box>
  );
}

export default ModuleDashboard;
