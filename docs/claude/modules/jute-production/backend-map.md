# Jute Production Backend Map — Winding

Last verified: 2026-07-30

> Scope: the **shipped** winding routers under `../vowerp3be/src/juteProduction/` and the
> legacy → vowerp3 endpoint mapping. Winding is **built** — Portal persona
> (`Depends(get_tenant_db)` + `get_current_user_with_refresh`), `{"data": …}` responses, soft
> delete (`active = 0`), **no approval workflow**. Registered in `../vowerp3be/src/main.py:270`
> (`winding_entry_router`, prefix `/api/windingProd`) and `:284` (`winding_reports_router`, prefix
> `/api/juteProductionReports`). Entry is moving from machine-keyed to **person-keyed** (EB no) per
> the locked design `../vowerp3be/docs/winding-person-keyed-entry-spec.md` — read that spec first,
> it is the source of truth for the current contract. `../vowerp3be/docs/winding-production-design.md`
> is the historical record of the legacy formulas this replaced.

## Routers (actual)

| Router file | Prefix | Endpoints |
|---|---|---|
| `winding_entry.py` | `/api/windingProd` | **Workers:** GET `workers` (new — HRMS-sourced picker). **Doff:** GET `doff_setup`, `doff_prev_state` (renamed from `doff_machine_prev_state`), `doff_by_date`; POST `doff_create`; PUT `doff_edit/{id}`; DELETE `doff_delete/{id}`. **Jugar:** GET `jugar_setup`, `jugar_prev_state`, `jugar_by_date`; POST `jugar_save`; PUT `jugar_update/{id}`. **Quality:** GET `quality_setup` (per-person carry-forward auto-seed), `quality_by_date`; POST `quality_add` (new); DELETE `quality_delete/{id}` (new); PUT `quality_save/{id}` |
| `winding_reports.py` | `/api/juteProductionReports` | GET `winding_spell_report`, `winding_quality_wise` — production KG only, no target/efficiency math (no winding target master, no attendance link); each response carries an explicit `LIMITATION_NOTE`. Neither has a frontend yet |

Supporting files (mirror spreader/drawing): `winding_query.py` (SQL — already re-keyed to `eb_id`),
`services/winding_rules.py` (net calc, jugar carry-forward — already re-keyed, `compute_winding_net`
takes `(grosswt, trollywt, spoolwt)`, no `nomc`), `constants.py` (`WINDING_NET_MIN/MAX`,
`JUGAR_MIN/MAX`, `SPINDLE_MIN/MAX`, `WINDING_MACHINE_TYPE_NAME`).

**No `winding_masters.py` exists, and none is planned.** An earlier draft of this map proposed that
router (`winding_machine_attr_list/create/edit`) plus a `jute_prod_winding_machine_attr` table.
**Neither was ever built** — dropping the machine entirely from the doff row
(`docs/winding-person-keyed-entry-spec.md` D3) removes the only reason a per-machine winding
attribute master would exist. Treat both as fictional; do not scaffold them.

## Tables (tenant DB, `jute_prod_winding_`) — actual

`jute_prod_winding_doff` (replaces legacy `WINDING_SPELL_EB_PROD_QLTY`), `jute_prod_winding_jugar`
(replaces `WINDING_JUGAR_ENTRY`), `jute_prod_winding_daily_qlty` (replaces `WINDING_DAILY_SPELL_EB`
— the person → quality map). All scoped by `co_id` (+ `branch_id`); reuse `trolly_mst` for
trolly/spool (`trolly_type` 'T'/'S', replacing legacy `trollymst.process_type` 39/101).

Person-keyed migration (`dbqueries/migrations/winding_person_keyed_entry.sql`): `operator_id`
**renamed** `eb_id` on all three tables; `machine_id` (and `no_of_machines` on the doff table)
become NULL-able and are no longer written. Applied to dev3 and sls on 2026-07-30, and every
pre-change row was hard-deleted at the same time (dev3: 19 doff / 8 jugar / 25 quality, all
`eb_id IS NULL`; sls was already empty) — there is no legacy-row cohort keeping the old columns;
both tenants now hold zero winding rows under the new schema. No FK on `eb_id` (references
`hrms_ed_personal_details.eb_id`, consistent with the rest of jute production). Full column list:
`docs/winding-person-keyed-entry-spec.md` §3.

`jute_prod_winding_machine_attr` **was proposed in an earlier draft and never built.** It has no
replacement — see the router note above.

## Legacy → vowerp3 endpoint mapping

| Legacy controller method (code3i) | vowerp3 endpoint (actual, person-keyed) |
|---|---|
| `mcno1_data` / `getwndprvDoffData` | `doff_prev_state` (was `doff_machine_prev_state`; MC#1 lookup replaced by the chosen worker) |
| `trolly_data`, `spool_data`, dropdowns | folded into `doff_setup` (returns `workers`, not `machines`) |
| `savewnddoff_data` | `doff_create` — writes exactly **one** row (`eb_id`; no equal-split across machines) |
| `get_records` / `getwndDoffdata` | `doff_by_date` |
| `deleteRecord` | `doff_delete/{id}` |
| `mcno1_jugardata`, `jugmcno1_data` / `getwndprvjugarData` | `jugar_prev_state` (by `eb_id`) |
| `savejugdoff_data` | `jugar_save` |
| `updatejugdoff_data` | `jugar_update/{id}` |
| `get_jugarrecords` / `getjugDoffdata` | `jugar_by_date` |
| `getwndqcode_data` / `getwndqcData` (auto-seed per machine) | `quality_setup` (auto-seed per **person**, carried forward from the previous spell) |
| — (no legacy equivalent — legacy has no "add/remove one machine's row") | `quality_add` / `quality_delete/{id}` (new; needed because the person set changes day to day, unlike a fixed machine roster) |
| `savewndqc_data` | `quality_save/{id}` |
| `get_wndqcrecords` / `getwndqcrecorddata` | `quality_by_date` |
| `getfinishalldata`, `get_wndreprecords`, `get_wndqcwisereport` | `winding_spell_report`, `winding_quality_wise` |
| `get_wndperrecords`, `get_wndindreprecords` | **not built** — no `winding_performance` / `winding_individual` endpoint exists |

> Legacy report logic lives in views (`view_winding_all_data`, `view_winding_qualitywise_data`,
> `spellwindingdata`, `view_proc_spellwindingdata`); vowerp3 reimplements the reconciliation
> formula (§4.2 of `winding-production-design.md`, re-keyed to `eb_id` per the person-keyed spec
> §6) directly in `winding_query.py` rather than depending on those DB views.

## Status (2026-07-30) — person-keyed rework is complete

The whole winding stack is person-keyed and the tables above describe what the code actually
returns, not a target: `winding_models.py`, `winding_query.py`, `services/winding_rules.py`,
`winding_entry.py` (router/handlers), and `winding_reports.py` are all migrated, and the winding
block of the spinning day-slice in `spinning_query.py` was re-keyed in the same pass so
`winding_total` / `eff_winding` keep working. Frontend (page, components, hooks, types,
`src/utils/api.ts`) is wired to this contract.

Schema is live on **dev3 and sls**; any other tenant still needs
`dbqueries/migrations/winding_person_keyed_entry.sql` applied **before** this code deploys, because
`machine_id` is `NOT NULL` until the migration lands and the new insert leaves it NULL.

Contract source of truth: `docs/winding-person-keyed-entry-spec.md`.

## Bale Production (Bale Press) — added 2026-09-16

Spec: `../vowerp3be/docs/bale-production-spec-sheet.md`. Portal persona, no approval workflow,
soft delete, `{"data": …}`.

| Router file | Prefix | Endpoints |
|---|---|---|
| `bale_entry.py` (+ `bale_query.py`, `bale_models.py`, `services/bale_sync.py`) | `/api/baleProd` | GET `entry_setup`, `next_bale_no`, `entries_by_date`, `bale_search`, `series_setup`, `series_list`; POST `entry_create`, `series_create`; PUT `entry_edit/{id}?co_id`, `series_edit/{id}?co_id`; DELETE `entry_delete/{id}?co_id`, `series_delete/{id}?co_id`. 409 on a `(series, bale_no)` clash or unknown REPACK original unless `allow_duplicate`. Every save/edit/delete calls `sync_balepress_daily()` so `jute_prod_finishing_daily` (`process='balepress'`) mirrors the per-bale rows (spec F10). |
| `bale_reports.py` (+ `bale_reports_query.py`) | `/api/juteProductionReports` | GET `bale_daily_sheet?co_id&branch_id&tran_date[&spell_id][&entry_type]`, `bale_heavy_light?co_id&branch_id&date_from&date_to` (F1–F8; MR from `jute_sqc_packing_mr`, item → group → none fallback). |

Tables: `jute_prod_bale_series` (running counters — the sheet's "Last Bale No"), `jute_prod_bale_entry`
(one row per bale, `entry_type` PROD/REPACK, `original_bale_no`, snapshot `trolly_wt` / `packsheet_wt` /
`std_bale_wt`, `net_wt = gross − trolley − packsheet`). `jute_prod_finishing_quality` gained `std_mr_pct`,
`weft_yarn_item_id`. Migrations: `create_jute_prod_bale_tables.sql`, `seed_bale_series_dev3.sql` (optional),
`seed_bale_production_menus.sql`.

FE pages: `juteProduction/baleProduction` (entry), `juteProduction/masters/baleSeriesMaster`,
`juteProduction/report/baleDailySheet`, `juteProduction/report/baleHeavyLight`;
`juteProduction/finishing/balePress` now redirects to the entry page. Constants `BALE_PROD_*`,
`BALE_SERIES_*`, `BALE_REPORT_*` in `src/utils/api.ts`.

## Bale Stock & Inspection — added 2026-10-12

Spec: `../vowerp3be/docs/superpowers/specs/2026-10-12-bale-stock-inspection-design.md`. Portal persona, no
approval workflow. Bale stock is DERIVED from `jute_prod_bale_entry` (one row = one bale, PROD or REPACK);
a bale leaves stock when a REPACK names it as `original_bale_no` or when it is linked to a live sales
invoice. Everything is "as on" a date.

| BE file | Prefix | Endpoints |
|---|---|---|
| `bale_stock.py` (+ `bale_stock_query.py`, `bale_stock_models.py`) | `/api/baleStock` | GET `setup?co_id&branch_id` (qualities, series, statuses, `bale_source`), `bales?co_id&branch_id[&as_on][&status=STOCK\|INSPECTED\|NOT_INSPECTED\|DESPATCHED\|REPACKED\|ALL][&quality_type][&finishing_quality_id][&bale_series_id][&bale_no_from][&bale_no_to][&date_from][&date_to]` (cap 3000, `truncated`), `summary?co_id&branch_id[&as_on]`, `invoices?co_id&branch_id[&as_on][&days=120]`; POST `inspect` (sacking bales only, in stock), `uninspect`, `despatch` (link to a Regular / Hessian / Govt Sacking invoice of the branch; returns `uninspected_sacking`), `undespatch`. |
| `finishing_stock.py` (changed) | `/api/finishingStock` | `setup` + `rows_by_date` + `report` now carry `bale_source` (`BALE_PROD` when the branch has bale entries dated ≤ the day, else `MANUAL`); `rows_by_date` adds `derived_bales` (per-quality bales / inspected / kg / MT from Bale Production) and flags own-company manual BALE rows `superseded`; the report's own bale block is built from the derived lines in BALE_PROD mode and every bale line carries `inspected_bales`; `row_create` / `row_edit` 400 on an own-company BALE line in BALE_PROD mode. |

Tables: `jute_prod_bale_inspection` (bale_entry_id, inspection_date, inspection_ref, inspector, remarks;
one active row per bale, soft delete) and `jute_prod_bale_despatch` (bale_entry_id, invoice_id,
invoice_line_item_id NULL, despatch_date, remarks; a link to a Rejected/Cancelled invoice is void at read).
Migrations: `20261012_jute_prod_bale_inspection_despatch.sql`, `20261012_seed_bale_stock_menu.sql`
(menu 'Bale Stock & Inspection' → `juteProduction/baleStock`, role grants mirrored from 'Finishing Stock').
Applied on dev3 2026-10-12; sls pending.

FE: page `juteProduction/baleStock` (summary table, filters, range selector, checkbox grid, Mark inspected /
Undo / Link to invoice / Unlink); shared components `src/components/juteProduction/baleStock/`
(`BaleStockGrid`, `BaleRangeSelector`, `MarkInspectedDialog`, `LinkInvoiceDialog`, `BaleInspectQuickDialog`
— the last one is what `juteProduction/finishingStock` opens from a derived sacking line); service
`src/utils/baleStockService.ts`; constants `BALE_STOCK_*` in `src/utils/api.ts`. The Finishing Stock
entry grid shows "Bales · from Bale Production" with an Inspected column, and the Finishing Stock Report
gains an Inspected column in BALE_PROD mode.
