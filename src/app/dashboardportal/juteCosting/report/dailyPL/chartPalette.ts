/**
 * Chart colour for the Daily P&L report — the only hex in this route.
 *
 * The actual line takes the first categorical slot of the spinning trend
 * palette (spinningProductionTrend/chartPalette.ts SERIES_COLORS[0],
 * validated with the dataviz palette checker on a white surface) so the two
 * reports read as one system; the theme has no chart-series token yet, so
 * moving this slot into src/styles/tokens.ts is the integrator's call. The
 * std median line and the grid take theme tokens (text.secondary, divider)
 * in ContributionChart. The chart has a table twin (the day-by-day table),
 * so colour is never the only carrier of a figure.
 */

export const ACTUAL_COLOR = "#2a78d6";
