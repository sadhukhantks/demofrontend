# Bale Stock & Inspection (pointer)

Canonical design: `../../../../../vowerp3be/docs/superpowers/specs/2026-10-12-bale-stock-inspection-design.md`
(decisions D1–D10, API contract §4, UI §6, build notes §9). Endpoint table: `backend-map.md` → "Bale Stock
& Inspection — added 2026-10-12".

One-paragraph version: bale stock is derived from Bale Production (`jute_prod_bale_entry`, one row per
bale) as on a date; a bale leaves stock when it is opened for a REPACK or linked to a live sales invoice
(`jute_prod_bale_despatch`); sacking bales can be marked inspected (`jute_prod_bale_inspection`) from the
page `juteProduction/baleStock` or straight from a derived line on `juteProduction/finishingStock`, which
no longer counts own-company bales by hand once the branch has bale entries (`bale_source = BALE_PROD`).

Additions 2026-10-12 (spec §7a): every stock view also shows the **sacking breakup by bale series**
(`summary.series_lines`, `day.derived_series`, report block `series` + `series_total`) — a clickable
"Sacking bales by series" table on the Bale Stock page (`_components/BaleSeriesSummaryTable.tsx`, click
= series filter), indented "↳ PUNJAB" child rows under each derived sacking quality in the Finishing Stock
grid (row model `finishingStock/utils/displayRows.ts`; children never feed a subtotal) and a
"Sacking bales by series" table after the own block's grand total in the Finishing Stock Report
(`SACKING BY SERIES` section in the Excel flatten). The Finishing Stock grid also carries a **Mark
despatched** (truck) action on every derived line, hessian and sacking, opening
`src/components/juteProduction/baleStock/BaleDespatchQuickDialog.tsx`; it shares the invoice form with
`LinkInvoiceDialog` through `useInvoiceLinkForm` + `InvoiceLinkFields` (schema `linkSchema.ts`).
