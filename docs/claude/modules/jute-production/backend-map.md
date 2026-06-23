# Jute Production Backend Map — Winding (proposed)

Last verified: 2026-06-13

> Scope: the **proposed** winding routers under `../vowerp3be/src/juteProduction/` and the
> legacy → vowerp3 endpoint mapping. **Nothing implemented yet.** Routers would be Portal persona
> (`Depends(get_tenant_db)` + `get_current_user_with_refresh`), `{"data": …}` responses, soft
> delete (`active = 0`), **no approval workflow**. Register in `../vowerp3be/src/main.py` after the
> spinning routers (`:197`). Full design: `../vowerp3be/docs/winding-production-design.md`.

## Proposed routers

| Router file | Prefix | Endpoints |
|---|---|---|
| `winding_entry.py` | `/api/windingProd` | **Doff:** GET `doff_entry_create_setup`, `doff_machine_prev_state`, `doff_entries_by_date`; POST `doff_entry_create`; PUT `doff_entry_edit/{id}`; DELETE `doff_entry_delete/{id}`. **Jugar:** GET `jugar_setup`, `jugar_prev_state`, `jugar_by_date`; POST `jugar_save`; PUT `jugar_update/{id}`. **Quality:** GET `quality_setup` (auto-seed), `quality_by_date`; POST `quality_save` |
| `winding_masters.py` | `/api/windingMasters` | GET `winding_machine_attr_list`; POST `winding_machine_attr_create`; PUT `winding_machine_attr_edit/{id}` (+ winding quality master CRUD if not folded into `yarn_quality_param`) |
| (extend) `reports.py` | `/api/juteProductionReports` | GET `winding_spell_report`, `winding_quality_wise`, `winding_performance`, `winding_individual` |

Supporting files (mirror spreader/drawing): `winding_query.py` (SQL), `services/winding_rules.py`
(net-split, jugar carry-forward, reconciliation), `constants.py` additions (`BUNDLE_KG = 14`,
winding machine type, spindle + net-weight bounds).

## Proposed tables (tenant DB, `jute_prod_winding_`)

`jute_prod_winding_doff` (replaces `WINDING_SPELL_EB_PROD_QLTY`), `jute_prod_winding_jugar`
(replaces `WINDING_JUGAR_ENTRY`), `jute_prod_winding_daily_qlty` (replaces
`WINDING_DAILY_SPELL_EB`), `jute_prod_winding_machine_attr` (new). Reuse `trolly_mst` for
trolly/spool (legacy overloads `trollymst.process_type` 39/101). All scoped by `co_id` (+ `branch_id`).
Column-level legacy→proposed mapping: design doc §6.1.

## Legacy → vowerp3 endpoint mapping

| Legacy controller method (code3i) | Proposed vowerp3 endpoint |
|---|---|
| `mcno1_data` / `getwndprvDoffData` | `doff_machine_prev_state` |
| `trolly_data`, `spool_data`, dropdowns | folded into `doff_entry_create_setup` |
| `savewnddoff_data` | `doff_entry_create` |
| `get_records` / `getwndDoffdata` | `doff_entries_by_date` |
| `deleteRecord` | `doff_entry_delete/{id}` |
| `mcno1_jugardata`, `jugmcno1_data` / `getwndprvjugarData` | `jugar_prev_state` |
| `savejugdoff_data` | `jugar_save` |
| `updatejugdoff_data` | `jugar_update/{id}` |
| `get_jugarrecords` / `getjugDoffdata` | `jugar_by_date` |
| `getwndqcode_data` / `getwndqcData` (auto-seed) | `quality_setup` |
| `savewndqc_data` | `quality_save` |
| `get_wndqcrecords` / `getwndqcrecorddata` | `quality_by_date` |
| `getfinishalldata`, `get_wndreprecords`, `get_wndperrecords`, `get_wndindreprecords`, `get_wndqcwisereport` | the four `winding_*` report endpoints |

> Legacy report logic lives in views (`view_winding_all_data`, `view_winding_qualitywise_data`,
> `spellwindingdata`, `view_proc_spellwindingdata`); vowerp3 should reimplement the §4.2–4.3
> formulas in `reportQueries.py` rather than depend on DB views.
