# Bale Production (Bale Press) — Spec Sheet (pointer)

> **Full spec lives in the backend repo:**
> [`../../../../../vowerp3be/docs/bale-production-spec-sheet.md`](../../../../../vowerp3be/docs/bale-production-spec-sheet.md)
> (path: `vowerp3be/docs/bale-production-spec-sheet.md`).

**Status:** DRAFT for review (2026-09-16). Built from the mill's Google Sheet *"BALE PRODUCTION (Responses)"*
(BALE / REPACK form tabs, STD bale weight, Last Bale No, MR%, HY/LT and Daily Bale Sheet tabs).

## What it covers
- **Bale Production entry** — one row per bale (date, spell, Bale Press machine, quality, bale series,
  bale no pre-filled from the series counter, gross weight, trolley); PROD and REPACK rows.
- **Bale Series master** — the sheet's "Last Bale No" tab as data (state / FCI series for sacking, per-quality
  series for hessian), with optional links to `state_mst` / `party_mst`.
- **Finishing Quality Master** gains *Std MR %* and *Weft yarn* (std bale weight + packsheet already exist there).
- **Daily Bale Sheet** report (print) and **Bale Heavy/Light** report (observed vs standard vs moisture-corrected).
- MR% readings are **not** re-entered: the report reads the existing SQC *Packing MR* page's data.

## Frontend surface (planned — see full spec §8)
- `juteProduction/baleProduction/` — entry page (rapid weighing form + day grid)
- `juteProduction/masters/baleSeriesMaster/` — series master
- `juteProduction/masters/finishingQualityMaster/` — two extra fields
- `juteProduction/report/baleDailySheet/`, `juteProduction/report/baleHeavyLight/`
- Route constants in `src/utils/api.ts`: `BALE_PROD_*`, `BALE_SERIES_*`, `BALE_REPORT_*`

## Patterns to clone
- `juteProduction/wasteEntry/` (Zod + RHF + mutations hook), `juteProduction/winding/_components/DoffForm.tsx`
  (keep context, clear weight, Enter-advance), `src/components/reports/` (`useReportBranches`, `ReportGrid`,
  `exportRowsToExcel`), `juteSQC/_shared/printReport`.

See the backend spec for the data model, formulas (F0–F9), endpoints, menu seeds, open questions (§9) and
build sequence (§10).
