# Selection Trolley Weight — spec sheet

Date: 2026-09-22. Module: Jute Production (portal). Status: built 2026-09-22 on `claudehost` (migrations applied to dev3 only), awaiting owner review.

## 1. Business process

Raw jute issued to production (`jute_issue`) goes through a manual **selection** step. At the
end of selection the sorted jute is loaded on a trolley and the loaded trolley is weighed.
The operator picks the jute **quality**, the **trolley number**, and types the **gross**
scale reading. The system deducts the trolley's **tare** (stored on the trolley master) and
keeps the **net** weight. The tare is **snapshotted into every entry** because trolley
weights change over time and history must stay reproducible.

Owner decisions (2026-09-22):

| # | Decision |
|---|---|
| D1 | The trolley picker offers **only trolleys tagged to the "Selection" stage** in Trolly Master (`trolly_mst.machine_type_id` → `machine_type_mst.machine_type_name = 'Selection'`), type `T`, of the selected branch. |
| D2 | `net_wt = gross_wt − trolly_wt` (trolley tare only, basket weight is **not** deducted). |
| D3 | The report compares selection against jute issue **quality-wise**, with the **same quality identity on both sides** (`item_mst.item_id` of the raw-jute item). Issue side uses the settled attribution rule: MR-sourced `jute_issue` rows only (`jute_mr_li_id IS NOT NULL`, waste re-issues excluded), `status_id <> 4`, quality = `jute_mr_li.actual_item_id`, per branch. |
| D4 | The quality picker on the entry page offers **only qualities issued to that branch in the last 7 days** (window ends on the entry date: `issue_date > tran_date − 7 days AND issue_date <= tran_date`, same issue rule as D3). Constant `SELECTION_QUALITY_WINDOW_DAYS = 7`. |
| D5 | Each entry carries an **optional spell** (`spell_id`, from `spell_mst` via `shift_mst`, branch-scoped). |
| D6 | No approval workflow. Soft delete (`active = 0`). Audit = `updated_by` + `updated_date_time` only (triggers do the rest). |
| D7 | Each entry may carry an **optional gate entry number**. Gate entries live on `jute_mr` (`jute_mr.jute_gate_entry_no`, merged gate-entry + MR table), so the entry stores `jute_mr_id` (FK) and the number is joined for display. The picker offers only the gate entries whose lines were issued in the D4 window (same rule), filtered client-side to the chosen quality. |
| D8 | The page must be **responsive and usable on a phone** (the operator weighs at the trolley with a mobile): single-column stacked form on `xs`/`sm`, full-width touch-sized inputs/buttons, and the day's entries rendered as a card list below `md` (DataGrid on `md` and up). The report page wraps its KPI strip and lets grids scroll horizontally. |

## 2. Schema (dev3 first; migration `dbqueries/migrations/create_jute_prod_selection_trolly_wt.sql`)

Spelling follows the codebase: `trolly` (table `trolly_mst`).

```sql
CREATE TABLE jute_prod_selection_trolly_wt (
    selection_wt_id    INT           NOT NULL AUTO_INCREMENT,
    co_id              INT           NOT NULL,
    branch_id          INT           NOT NULL,
    tran_date          DATE          NOT NULL,                 -- selection date (never in the future)
    spell_id           INT           NULL,                     -- D5, optional
    item_id            INT           NOT NULL,                 -- jute quality = raw-jute item (item_mst)
    trolly_id          INT           NOT NULL,
    jute_mr_id         BIGINT        NULL,                     -- D7, optional gate entry (jute_mr.jute_gate_entry_no; BIGINT to match jute_mr.jute_mr_id)
    trolly_wt          DECIMAL(10,3) NOT NULL DEFAULT 0,       -- snapshot of trolly_mst.trolly_weight (kg) at save
    gross_wt           DECIMAL(10,3) NOT NULL,                 -- scale reading (kg), > 0
    net_wt             DECIMAL(10,3) NOT NULL,                 -- gross_wt − trolly_wt (server-computed, D2), > 0
    weigh_time         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- business timestamp, orders the day grid
    remarks            VARCHAR(255)  NULL,
    active             TINYINT       NOT NULL DEFAULT 1,
    updated_by         INT           NULL,
    updated_date_time  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (selection_wt_id),
    KEY idx_stw_co_branch_date (co_id, branch_id, tran_date),
    KEY idx_stw_item_date      (item_id, tran_date),
    KEY idx_stw_trolly         (trolly_id),
    KEY idx_stw_spell          (spell_id),
    KEY idx_stw_mr             (jute_mr_id),
    CONSTRAINT fk_stw_mr     FOREIGN KEY (jute_mr_id) REFERENCES jute_mr    (jute_mr_id),
    CONSTRAINT fk_stw_item   FOREIGN KEY (item_id)   REFERENCES item_mst   (item_id),
    CONSTRAINT fk_stw_trolly FOREIGN KEY (trolly_id) REFERENCES trolly_mst (trolly_id),
    CONSTRAINT fk_stw_spell  FOREIGN KEY (spell_id)  REFERENCES spell_mst  (spell_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Same migration also seeds the stage tag (D1), idempotently:

```sql
INSERT INTO machine_type_mst (machine_type_name, updated_by, active)
SELECT 'Selection', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM machine_type_mst WHERE machine_type_name = 'Selection');
```

Menu seed (`dbqueries/migrations/seed_selection_trolley_weight_menus.sql`, tenant `menu_mst` only —
the juteProduction hub has no `portal_menu_mst` template row; see `seed_bale_production_menus.sql`):

| menu_name | menu_path | parent | order_by | report | icon | role_menu_map |
|---|---|---|---|---|---|---|
| Selection Trolley Weight | `juteProduction/selectionTrolleyWeight` | Jute Production hub | 187 | NULL | `scale` | mirror every role's grant on 'Bale Production' (MAX access) |
| Selection vs Jute Issue | `juteProduction/report/selectionVsIssue` | Production Reports hub | MAX(sibling)+1 | 1 | `compare_arrows` | mirror hub grants (as the bale reports seed does) |

## 3. Backend (`vowerp3be`)

Files: `src/juteProduction/selection_entry.py` (router, prefix **`/api/selectionProd`**),
`src/juteProduction/selection_query.py` (text() builders), `src/juteProduction/selection_reports.py`
(report router registered on the shared **`/api/juteProductionReports`** prefix),
`src/juteProduction/selection_models.py` (SQLAlchemy 2.0 `Mapped[]` model `JuteProdSelectionTrollyWt`),
constants in `src/juteProduction/constants.py`:
`SELECTION_MACHINE_TYPE_NAME = "Selection"`, `SELECTION_QUALITY_WINDOW_DAYS = 7`,
`SELECTION_GROSS_MIN, SELECTION_GROSS_MAX = 1, 5000`.

`spinning_masters.py` → `trolly_machine_types` also returns the `Selection` type (5 names) so
Trolly Master can tag trolleys to Selection with no frontend change.

Persona: Portal. Plain `def` handlers, `Depends(get_tenant_db)` + `Depends(get_current_user_with_refresh)`,
`{"data": ...}` envelope, params validated before the try (400 never 500), GET: HTTPException raise /
ValueError 400 / Exception 500; POST/PUT/DELETE: `db.rollback()` then raise / 500 — exactly like `bale_entry.py`.
Spell resolution imports `_resolve_spell` from `spinning_entry.py` (never copied).

### 3.1 Contract

`SelectionRow` =
```json
{"selection_wt_id": 1, "co_id": 1, "branch_id": 2, "tran_date": "2026-09-22", "spell_id": 1, "spell_code": "A1",
 "item_id": 269847, "item_code": "…", "item_name": "D TD 5", "trolly_id": 4, "trolly_name": "74",
 "jute_mr_id": 120, "gate_entry_no": 36, "gate_entry_date": "2026-01-20",
 "trolly_wt": 77.0, "gross_wt": 250.5, "net_wt": 173.5, "weigh_time": "2026-09-22 10:15:00", "remarks": null}
```

| Method + path | Params / body | Response `data` |
|---|---|---|
| `GET /api/selectionProd/entry_setup` | `co_id`, `branch_id` (both required), `tran_date` optional (default today) | `{"qualities": [{item_id, item_code, item_name, issued_kg}], "gate_entries": [{jute_mr_id, gate_entry_no, gate_entry_date, supplier_name, item_ids: [item_id, …], issued_kg}], "trollies": [{trolly_id, trolly_name, trolly_weight, trolly_posting_code}], "spells": [{spell_id, spell_code, spell_name}], "quality_window": {"date_from", "date_to", "days": 7}}` — qualities per D4 (ordered by item_name, `issued_kg` = SUM(weight) in the window); gate_entries per D7 (one row per `jute_mr` whose lines were issued in the window, `item_ids` = distinct `actual_item_id` of those issued lines, ordered by gate_entry_no desc; `supplier_name` via `jute_supplier_mst` LEFT JOIN, null-safe); trollies per D1; spells de-duplicated by `spell_code` |
| `GET /api/selectionProd/entries_by_date` | `co_id`, `branch_id`, `tran_date` required; `spell_id` optional | `{"rows": SelectionRow[] (ordered by weigh_time, id), "totals": {"trolleys", "gross_wt", "trolly_wt", "net_wt"}, "by_quality": [{item_id, item_name, trolleys, net_wt}]}` |
| `POST /api/selectionProd/entry_create` | body `{co_id, branch_id, tran_date, spell_id?, item_id, trolly_id, jute_mr_id?, gross_wt, remarks?}` | `{"row": SelectionRow}` |
| `PUT /api/selectionProd/entry_edit/{id}?co_id=` | same body | `{"row": SelectionRow}` |
| `DELETE /api/selectionProd/entry_delete/{id}?co_id=` | — | `{"selection_wt_id": id}` |
| `GET /api/juteProductionReports/selection_vs_issue` | `co_id`, `branch_id`, `date_from`, `date_to` (all required; `date_to >= date_from`, max 366 days) | see 3.3 |

### 3.2 Validation (400 unless stated)

- `tran_date` not in the future; branch must belong to `co_id` (reuse `verify_branch_co_query` from `gain_loss_query`).
- `item_id` must be one of the D4 window qualities for that branch/date ("Quality was not issued to this branch in the last 7 days").
- `trolly_id` must exist, be type `T`, belong to the branch, and be tagged Selection ("Trolley is not tagged to Selection in Trolly Master").
- `SELECTION_GROSS_MIN <= gross_wt <= SELECTION_GROSS_MAX`; `net_wt = gross_wt − trolly_wt` must be `> 0`.
- `spell_id`, when given, resolved through `_resolve_spell(db, spell_id, None, branch_id)`.
- `jute_mr_id`, when given, must be one of the D7 window gate entries for that branch/date AND carry the chosen `item_id` ("Gate entry has no issue of this quality in the last 7 days").
- **Tare snapshot rule:** on create, `trolly_wt` = current `trolly_mst.trolly_weight`. On edit, the stored snapshot is **kept** if `trolly_id` is unchanged; it is re-read from the master only when the trolley changes. Net is always recomputed from the (possibly kept) snapshot.
- Edit/delete: row must be active and belong to `co_id` (404 otherwise).

### 3.3 Report `selection_vs_issue`

```json
{"data": {"date_from": "…", "date_to": "…", "branch_id": 2, "branch_name": "Factory",
  "by_quality": [{"item_id", "item_code", "item_name", "issue_kg", "selection_kg", "trolleys", "diff_kg", "diff_pct"}],
  "by_day":     [{"tran_date", "item_id", "item_name", "issue_kg", "selection_kg", "trolleys", "diff_kg"}],
  "totals":     {"issue_kg", "selection_kg", "trolleys", "diff_kg", "diff_pct"}}}
```
- Issue side: D3 rule, grouped by (`issue_date`, `actual_item_id`).
- Selection side: `jute_prod_selection_trolly_wt` active rows, `SUM(net_wt)`, `COUNT(*)` as trolleys, grouped by (`tran_date`, `item_id`).
- Extra section `by_gate_entry`: selection rows that carry a `jute_mr_id`, grouped by (`jute_mr_id`, `gate_entry_no`, `item_id`) → `{jute_mr_id, gate_entry_no, gate_entry_date, item_id, item_name, selection_kg, trolleys}`, plus the MR's issued kg of that quality in the range (`issue_kg`) and `diff_kg` — same D3 rule restricted to that MR.
- Merge in Python on the (date, item) key (a quality present on only one side still appears, the other side 0).
- `diff_kg = selection_kg − issue_kg`; `diff_pct = diff_kg / issue_kg × 100` rounded to 2, `null` when `issue_kg = 0`.
- Ordered by item_name (by_quality) and by tran_date, item_name (by_day). Weights rounded to 3.
- The merge is a pure function `build_selection_vs_issue(issue_rows, selection_rows)` tested DB-free.

### 3.4 Tests

`src/test/test_jute_production_selection_entry.py` and `src/test/test_jute_production_selection_report.py` —
TestClient + `app.dependency_overrides` for `get_tenant_db` / `get_current_user_with_refresh` (see
`test_jute_production_bale_entry.py`). Cover: setup shape, 400s for missing params / future date / gross out
of range / untagged trolley / quality outside window, create net computation and snapshot, edit keeps the
snapshot when trolley unchanged, delete soft-deletes, report merge (both-sided, issue-only, selection-only,
`diff_pct` null on zero issue).

## 4. Frontend (`vowerp3ui`)

Route constants already exist in `src/utils/api.ts` (`apiRoutesPortalMasters`): `SELECTION_TW_ENTRY_SETUP`,
`SELECTION_TW_ENTRIES_BY_DATE`, `SELECTION_TW_ENTRY_CREATE`, `SELECTION_TW_ENTRY_EDIT`, `SELECTION_TW_ENTRY_DELETE`,
`SELECTION_VS_ISSUE_REPORT`.

### 4.1 Entry page `src/app/dashboardportal/juteProduction/selectionTrolleyWeight/`

Skeleton copied from `juteProduction/baleProduction/` (page.tsx smart container; `_components/` presentational;
`hooks/` with `fetchWithCookie`; `types/selectionTypes.ts`; `utils/selectionSchema.ts` (zod, string-held fields)
and `utils/selectionCalc.ts` + `selectionCalc.test.ts` (net = gross − tare, totals, by-quality roll-up)).

Header (page state, not the form): branch per the sidebar norm (picker only when > 1 branch in scope, else plain
text), date (`type="date"`, max today), spell (`SearchableOptionSelect`, optional, clearable).
Form: quality (`SearchableOptionSelect`, required; label `item_name` with issued kg in the window as secondary
text or appended, e.g. `D TD 5 · 21,480 kg issued`), gate entry (`SearchableOptionSelect`, optional, clearable;
options = setup `gate_entries` filtered to those whose `item_ids` include the chosen quality; label
`GE 36 · 20-Jan-2026 · <supplier>`; cleared automatically if the quality changes to one the gate entry lacks),
trolley (`SearchableOptionSelect`, required; label `trolly_name (tare 77.000 kg)`), gross weight (number, step 0.001, autofocus after each save), read-only tare +
net preview (net turns error-coloured via theme tokens when ≤ 0), remarks. Enter submits. After save keep
quality + trolley, clear gross, refocus gross, refresh grid, snackbar. If the setup returns no qualities show an
info alert: "No jute issued to this branch in the 7 days up to <date>". Trolley list empty → info alert pointing
to Trolly Master ("Tag trolleys to the Selection stage in Trolly Master").
Grid (`DataGrid` compact, `md` and up): time, spell, quality, gate entry, trolley, tare, gross, net, remarks,
actions (edit/delete with `window.confirm`). Below `md` (`useMediaQuery(theme.breakpoints.down("md"))`) render
the same rows as a stacked card list (`_components/SelectionEntryCards.tsx`): quality + net kg prominent,
trolley / gross / tare / gate entry / spell / time as secondary text, edit + delete icon buttons ≥ 40 px.
Footer: trolleys, gross, tare, net totals + by-quality chips/table (wraps on small screens). Editing a row loads
it into the form (date/spell locked while editing), Cancel returns to create mode.
Responsive layout (D8): MUI `Grid`/`Stack` with `xs=12` for every field and `md` sizing for desktop; the form
sits above the list on phones; no fixed widths; header controls wrap; the Save button is full width on `xs`.

### 4.2 Report page `src/app/dashboardportal/juteProduction/report/selectionVsIssue/page.tsx`

Uses the shared report kit (`useReportBranches`, `useMounted`, `ReportGrid` + `numCol`, `exportRowsToExcel`,
`currentMonthRange`, `BackToReports`), wrapped in `<Suspense>`. Filters: branch (norm), From / To, Submit.
Sections: KPI strip (issued kg, selected kg, trolleys, difference kg / %; wraps 2-per-row on phones), "By quality"
grid (with a Grand Total row), "Day-wise" grid, "By gate entry" grid (only when non-empty). Excel export (one
flattened sheet or per-grid). No print needed. Grids must scroll horizontally on small screens (D8).

## 5. QA

Test tenant `dev3`, company 1 (Empire), branch 2 (Factory). jute_issue for branch 2 has data from
2025-12-01 to 2026-01-24 only, so for the 7-day quality window use an entry date on/before 2026-01-24
(e.g. `2026-01-24` → qualities D TD 5, D TD 6, J TD 6/7/8 (US), M6 (B.BOT)). Trolleys must first be tagged to
Selection in Trolly Master (`juteProduction/masters/trollyMaster`).

Preview URLs: `http://dev3.187-77-145-36.nip.io:3000/dashboardportal/juteProduction/selectionTrolleyWeight`
and `…/dashboardportal/juteProduction/report/selectionVsIssue` (re-login once so the sidebar picks up the new menus).
