# Jute PO settlement (closing) — design spec

Status: **approved by owner 2026-09-25, in build**. Both repos, `claudehost` branch. Read this
before touching any jute PO closing code; it is the contract the backend, PO page and
Outstanding PO Position page are built against.

## 1. Problem

A jute PO has transitions Draft → Open → Approved (or Rejected / Cancelled) and nothing after.
No receipt, inspection or bill-pass step ever changes the PO status, and there is no "Close PO"
action. Every approved PO stays open forever and shows as outstanding. The only CLOSED (5) POs
are migrated ones. On sls branch 29, 36 of the 44 live POs had received every lorry but only 8
reached 98 % of the nominal PO weight — real lorries run a few percent light, so a weight-equals
rule would settle almost nothing.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Settled** | Receipts against the PO meet the settlement rule; PO auto-closes with `close_type = 'AUTO'`. |
| **Short close** | A user closes a live PO that will not be fulfilled; `close_type = 'SHORT'` (single PO) or `'BULK'` (from the report). Sticky: the engine never reopens it. |
| **Migrated close** | Pre-existing CLOSED rows from the legacy import; `close_type = 'MIGRATED'`. Sticky. |
| **Live PO** | `status_id IN (1 OPEN, 3 APPROVED)`. Only live POs can be settled or short-closed. Drafts (2, 21), pending approval (17, 20), rejected (4), cancelled (6) are never touched by the engine. |
| **Receipt** | A `jute_mr` row with `po_id = <po>` and `jute_gate_entry_no IS NOT NULL` whose `status_id NOT IN JUTE_MR_STOCK_EXCLUDED_STATUSES` (4, 6, 21, 48 — rejected / cancelled / draft / returned). Same predicate as the stock reports and the PO list. |

`status_id` stays **5 = CLOSED** for every kind of close; the new columns say why. Nothing else
in the system needs to learn a new status.

## 3. Schema (one migration, `dbqueries/migrations/2026-09-25_jute_po_settlement.sql`)

```sql
ALTER TABLE jute_po
  ADD COLUMN closed_date  DATETIME     NULL,
  ADD COLUMN closed_by    INT          NULL,
  ADD COLUMN close_type   VARCHAR(10)  NULL,   -- AUTO | SHORT | BULK | MIGRATED
  ADD COLUMN close_remark VARCHAR(500) NULL;

CREATE TABLE jute_po_status_log (
  log_id        INT AUTO_INCREMENT PRIMARY KEY,
  jute_po_id    INT NOT NULL,
  old_status_id INT NULL,
  new_status_id INT NOT NULL,
  close_type    VARCHAR(10) NULL,
  source        VARCHAR(10) NOT NULL,          -- AUTO | MANUAL | BULK | BACKEND | MIGRATION
  trigger_ref   VARCHAR(100) NULL,             -- e.g. 'MR:28268 approve_mr', 'recompute co=2 br=29'
  remark        VARCHAR(500) NULL,
  user_id       INT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_po_status_log_po (jute_po_id, log_id)
);

CREATE TABLE jute_po_settle_rule (
  co_id                INT PRIMARY KEY,
  lorry_rule_enabled   TINYINT NOT NULL DEFAULT 1,
  weight_tolerance_pct DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  stale_days           INT NOT NULL DEFAULT 30,
  updated_by           INT NULL,
  updated_date_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Backfill: every existing CLOSED PO is a migrated close.
UPDATE jute_po SET close_type = 'MIGRATED' WHERE status_id = 5 AND close_type IS NULL;
```

Defaults apply when a company has no `jute_po_settle_rule` row (lorry rule on, 5 %, 30 days).
Rollback SQL goes in the script's footer (drop the two tables, drop the four columns).
Apply on **dev3 first**; sls only with the owner's explicit OK (the report must keep working on
a tenant that has not had the migration — see §6).

## 4. Settlement engine — `vowerp3be/src/juteProcurement/po_settlement.py`

Pure decision + one DB entry point. Everything else calls the entry point; nobody writes
`jute_po.status_id = 5` anywhere else.

```python
@dataclass
class SettleRule: lorry_rule_enabled: bool = True; weight_tolerance_pct: float = 5.0; stale_days: int = 30

@dataclass
class PoReceipts: vehicle_quantity: int | None; po_weight: float | None; received_lorries: int; received_weight: float

def is_settled(r: PoReceipts, rule: SettleRule) -> bool:
    """(lorry rule on AND vehicle_quantity > 0 AND received_lorries >= vehicle_quantity)
       OR (po_weight > 0 AND received_weight >= po_weight * (1 - tol/100))."""

def load_rule(db, co_id) -> SettleRule          # row or defaults; tolerate a missing table (pre-migration tenant)
def recompute_po_settlement(db, jute_po_id, *, user_id, source, trigger_ref) -> Literal["closed","reopened","unchanged","skipped"]
def settle_after_mr_change(db, jute_mr_id, *, user_id, trigger_ref, previous_po_id=None) -> None
def recompute_branch(db, co_id, branch_id, *, user_id, source="BACKEND", trigger_ref) -> dict  # {"closed": n, "reopened": n, "unchanged": n}
```

`recompute_po_settlement` rules, in order:

1. PO not found or `status_id IN (2, 4, 6, 17, 20, 21)` → `skipped`.
2. `status_id = 5` and `close_type IN ('SHORT', 'BULK', 'MIGRATED')` → `skipped` (sticky).
3. Compute `PoReceipts` from `jute_mr` with the §2 receipt predicate.
4. Live and settled → set `status_id = 5, close_type = 'AUTO', closed_date = NOW(), closed_by = user_id, close_remark = 'Auto-settled: <lorries n/m, weight x/y>'`; log `(old, 5, 'AUTO', source, trigger_ref)` → `closed`.
5. `status_id = 5, close_type = 'AUTO'` and **not** settled any more (receipt rejected / cancelled / returned / weight edited / MR re-pointed to another PO) → reopen to the status recorded as `old_status_id` on the latest log row that closed it (fallback 3), clear the four close columns, log `(5, old, NULL, source, trigger_ref)` → `reopened`. **This is the rollback path**: an AUTO close is always a pure function of current receipts.
6. Otherwise `unchanged`, no log row (idempotent — calling it twice writes nothing).

Runs inside the caller's transaction (no commit of its own). Never raises for a missing
`jute_po_settle_rule` table or row — falls back to defaults.

### Hook points (all in the same transaction as the MR change, before commit)

| File | Endpoint | Call |
|---|---|---|
| `juteGateEntry.py` | `jute_gate_entry_create`, `jute_gate_entry_update` | `settle_after_mr_change(db, mr_id, ..., previous_po_id=<old po_id when it changed>)` — recompute both the old and new PO. |
| `mr.py` | `update_mr`, `change_status`, `approve_mr`, `reject_mr`, `cancel_mr`, `reopen_mr`, `return_mr`, `open_mr`, `pending_mr` | `settle_after_mr_change(db, mr_id, ..., trigger_ref="MR:<id> <endpoint>")` |

`mr.py` has an **uncommitted change from another session** (TKT-196, ~49 lines). Re-read the
file immediately before editing, make each hook a 2–3 line additive insertion right before the
existing commit, and do not reformat anything around it.

### New endpoints (`jutePO.py`, prefix `/api/jutePO`)

| Method + path | Body / params | Behaviour |
|---|---|---|
| `POST /close_jute_po/{jute_po_id}?co_id=` | `{ "remark": str (required, ≤500) }` | Live PO only (1, 3) → CLOSED, `close_type='SHORT'`, log source MANUAL. 400 otherwise. Returns `{data: {jute_po_id, status_id, close_type, closed_date}}`. |
| `POST /bulk_close_jute_po?co_id=&branch_id=` | `{ "jute_po_ids": [int], "remark": str }` | Same as above per PO, `close_type='BULK'`, source BULK. Skips non-live ids and reports them. Returns `{data: {closed: [...], skipped: [{jute_po_id, reason}]}}`. |
| `POST /reopen_jute_po/{jute_po_id}?co_id=` (existing) | — | **Extend**: also allowed from 5. Restores the pre-close status from the log (fallback 3), clears the close columns, logs MANUAL. Rejected/cancelled → Draft behaviour unchanged. |
| `POST /recompute_settlement?co_id=&branch_id=` | — | `recompute_branch(...)` over live + AUTO-closed POs of the branch; source BACKEND, `trigger_ref='recompute co=<> br=<> by user <>'`. Returns the counts. This is what you run after **any direct database change** to `jute_mr` / `jute_po` (the migration close-outs, repair scripts, imports). |
| `GET /settle_rule?co_id=` | — | `{data: SettleRule + "is_default": bool}` |
| `PUT /settle_rule?co_id=` | `{lorry_rule_enabled, weight_tolerance_pct (0–50), stale_days (1–365)}` | Upsert; then `recompute_branch` for **every** branch of the company so a rule change takes effect immediately; returns rule + counts. |
| `GET /status_log/{jute_po_id}?co_id=` | — | `{data: [log rows newest first, with status names and user name]}` |

Also a CLI for backend ops with no browser: `vowerp3be/scripts/recompute_po_settlement.py --db dev3 --co 1 --branch 2 [--dry-run]`
(pymysql via `env/database.env`; prints per-PO decisions; `--dry-run` writes nothing).

### Tests (`src/test/test_jute_po_settlement.py`)

Pure `is_settled` matrix (lorry rule on/off, tolerance edge, zero vehicle_quantity, zero weight);
`recompute_po_settlement` with a MagicMock/SQLite session for each of rules 1–6 including the
AUTO→reopen rollback and the sticky SHORT close; endpoint validation (400s) and one happy path
each for close / bulk / reopen-from-closed / recompute / settle_rule.

## 5. Rollbacks and backend-side changes — the guarantees

1. **AUTO closes are derived state.** They are recomputed from current receipts on every MR
   change, on `recompute_settlement`, and on every rule change. Reject/cancel/return an MR, edit
   its weight, or re-point it to another PO and the PO reopens by itself (rule 5). The status log
   shows the round trip.
2. **Manual closes are intent, not derived state.** SHORT / BULK / MIGRATED never reopen on
   their own; only the reopen action does, and it is logged with the user.
3. **Direct SQL is allowed but must be followed by a recompute.** Anyone fixing data with a
   script runs `recompute_settlement` (endpoint or CLI) for the branch afterwards. The
   Outstanding PO Position report flags drift (`settle_suggest`, §6) so a forgotten recompute is
   visible, not silent.
4. **Every status change has a log row** with source (AUTO / MANUAL / BULK / BACKEND /
   MIGRATION), trigger reference, user and timestamp. The report page and PO page surface it.
5. **The 2026-09-25 branch-29 close-out** (`close_migrated_jute_pos_before_2026_07_01.sql`,
   backup table `jute_po_status_backup_20260925`) is retro-logged by the migration as
   source MIGRATION, `close_type='MIGRATED'`; its rollback SQL stays valid.
6. **Reopen after AUTO close** restores the exact prior status (OPEN vs APPROVED), not a guess.

## 6. Outstanding PO Position report changes (`po_position.py`, `reportQueries.py`)

Query stays valid on a tenant **without** the migration (no reference to the new columns; the
rule is loaded through `load_rule`, which tolerates a missing table). Per detail row add:

| Field | Meaning |
|---|---|
| `last_receipt_date` | (exists) |
| `days_since_receipt` | as_on − last_receipt_date; null when none |
| `stale` | `overdue AND (no receipt OR days_since_receipt >= rule.stale_days)` |
| `settle_suggest` | `is_settled(receipts, rule)` is true although the PO is still live — the engine has not run since a backend change; "Re-evaluate" fixes it |
| `received_lorries`, `vehicle_quantity` | (exist) |

Response gains `rule: {lorry_rule_enabled, weight_tolerance_pct, stale_days, is_default}` and
`totals.stale_pos`, `totals.settle_suggest_pos`.

## 7. Frontend — PO page (`jutePurchase/po/…`)

- **Close PO** button in view mode for live POs (status 1 or 3) when the user has edit access on
  the PO menu: dialog with a required remark → `JUTE_PO_CLOSE`. Success toast, status refresh.
- **Reopen** for CLOSED POs (same permission) → existing `JUTE_PO_REOPEN`; label the confirm
  "Reopen closed PO — it goes back to <prior status>".
- View mode of a CLOSED PO shows a **Closed** panel: closed on, by, type (Auto-settled /
  Short-closed / Bulk-closed / Migrated), remark.
- **Status history** section (collapsible) from `JUTE_PO_STATUS_LOG`, newest first: when, from →
  to, source, trigger, remark, user.
- **Settlement rules** dialog reachable from the PO list header (gear icon, edit access only):
  the three fields, saved with `JUTE_PO_SETTLE_RULE` (PUT), shows the recompute counts returned.
- Use `SearchableSelect` for any dropdown, zod for the dialogs' forms, `fetchWithCookie` via a
  service function in `src/utils/jutePOService.ts` (extend the existing one if present).

## 8. Frontend — Outstanding PO Position page (`jutePurchase/reports/poOutstandingPosition/`)

- PO Detail tab gets **row checkboxes** (one PO can span several rows — select by PO, ticking
  any row ticks the PO's rows) and a **Close selected (n POs)** button → remark dialog →
  `JUTE_PO_BULK_CLOSE`; then reload. Edit access only.
- **Manual close per row** as well: a small "Close" action on each PO row in the PO Detail tab (one
  click → the same remark dialog → `JUTE_PO_CLOSE` for that PO). The owner asked explicitly for a
  manual close option; it must be reachable both here and on the PO page (§7).
- New columns: **Stale** (Yes/blank; row tint `report-perf-low` when stale, `report-perf-watch`
  when merely overdue) and **Settle?** (Yes when `settle_suggest`).
- KPI strip gains "Stale" and, when > 0, a "Not yet settled" tile that explains itself.
- A **Re-evaluate** button (edit access) calls `JUTE_PO_RECOMPUTE_SETTLEMENT` for the branch and
  reloads; shows "closed n, reopened n".
- **Supplier filter** (owner, 2026-09-25): a searchable, clearable Supplier dropdown in the filter bar
  (`SearchableSelect`), options = the suppliers present in the loaded report (from `by_supplier`), kept
  from the last unfiltered load so the list does not shrink after filtering. Applies client-side to all
  three tabs and the KPI strip: filter the detail rows by `party_name`, then re-aggregate By Quality /
  By Supplier / totals from the filtered detail rows (sums of qty/weight/value, PO and overdue counts as
  distinct POs, `avg_rate` balance-weighted, `balance_pct` = balance/ordered). Excel exports what is
  shown, with the supplier named in the header's `reportFor`. The existing drill-down chip and this
  filter are the same mechanism — selecting a supplier here sets the same filter.
- A one-line rule caption under the title: "Settles when all lorries are received or weight ≥
  95 % of PO · stale after 30 days without receipt" — from `data.rule`.
- **All weights in MT, rounded to 0** (owner, 2026-09-25): every weight the page shows — KPI tiles, the
  three grids, the three Excel sheets — is `kg / 1000` displayed with 0 decimals and the header says
  `(MT)`. The API keeps returning the stored kg; the page converts once when building grid rows (add
  `*_mt` fields on the grid-row types, e.g. `balance_mt`, `ordered_mt`, `received_mt`, `po_weight_mt`),
  so the Excel sheets carry the same MT numbers as the screen. Quantities (bales/drums), rates (₹ per
  quintal) and rupee values are not weights and stay as they are; values remain whole rupees.
  Legacy sls rows that stored quintals will read 10× low — that is a data issue, not a reason to
  detect units in code (see the `no unit conversion` rule in `reportQueries.py`; the conversion here
  is display-only and lives in the frontend).
- Utils + tests: PO-level selection helper, stale/suggest row classes, MT conversion, grand-total rows unchanged.

## 9. Route constants (already added to `src/utils/api.ts`, do not re-add)

```
JUTE_PO_CLOSE                 /jutePO/close_jute_po
JUTE_PO_BULK_CLOSE            /jutePO/bulk_close_jute_po
JUTE_PO_RECOMPUTE_SETTLEMENT  /jutePO/recompute_settlement
JUTE_PO_SETTLE_RULE           /jutePO/settle_rule
JUTE_PO_STATUS_LOG            /jutePO/status_log
```

## 10. Out of scope (later)

Auto-closing stale POs (owner wants a person to confirm); a settlement rule per supplier or per
quality; e-mail/notification on auto-settle.

## 11. Revision 2 (owner feedback, 2026-09-25 evening) — SUPERSEDES the matching parts above

### 11.1 Tolerance is half a lorry, not a percentage

`weight_tolerance_pct` is gone. New rule field `tolerance_lorry_fraction DECIMAL(4,2) NOT NULL DEFAULT 0.50`.

```
lorry_weight  = po_weight / vehicle_quantity            (only when vehicle_quantity > 0)
tolerance     = tolerance_lorry_fraction × lorry_weight  (0 when vehicle_quantity is NULL/0)
settled_by_wt = po_weight > 0 AND received_weight >= po_weight − tolerance
settled       = (lorry_rule_enabled AND vehicle_quantity > 0 AND received_lorries >= vehicle_quantity) OR settled_by_wt
```

Owner's examples: a 10 MT lorry → 5 MT tolerance; a 16 MT lorry → 8 MT tolerance. A PO for 5 lorries
of 14 MT (70 MT) settles by weight at ≥ 63 MT. `received_*` exclude returned lorries (§11.3).

Migration: `2026-09-25_jute_po_settlement.sql` (the base script, for tenants not yet migrated) is
rewritten to create `jute_po_settle_rule` with `tolerance_lorry_fraction` and without
`weight_tolerance_pct`. dev3, already migrated, gets a follow-up
`2026-09-25b_jute_po_settle_rule_lorry_fraction.sql` (ADD the new column, DROP the old one, then a
`recompute` per branch). `PUT settle_rule` validates `tolerance_lorry_fraction` in 0–1. The PO page's
Settlement rules dialog replaces the "% tolerance" field with "Tolerance (fraction of one lorry)",
shown to the user as e.g. "0.5 = half a lorry". Rule caption on the report: "Settles when all lorries
are received or weight is within half a lorry of the PO · stale after 30 days without receipt".

### 11.2 Lorry-and-weight columns: Order / Received / Returned / Balance

The owner reads a PO as N lorries of ~X MT. The PO Detail tab becomes **one row per PO** (the item
rows are grouped client-side by `jute_po_id`; a `qualities` text column lists the items, e.g.
"D TD 6 ×250 bl, D TD 5 ×83 bl"). Columns, in order:

| Column | Value (grid shows `n (MT)`; Excel has two numeric columns per pair) |
|---|---|
| PO #, PO Date, Supplier, Mukam, Qualities | as today |
| **Order Lorry (Wt)** | `vehicle_quantity (po_weight MT)` |
| **Recv Lorry (Wt)** | `received_lorries (po_received_weight MT)` — excludes returned |
| **Returned Lorry (Wt)** | `returned_lorries (returned_weight MT)`; blank when 0; cell in error colour when > 0 |
| **Bal Lorry (Wt)** | `pending_lorries (po_pending_weight MT)` — PO-level balance |
| Bal % | `po_pending_weight / po_weight` |
| Bal Value | Σ item `balance_value` of the PO |
| Due, Age (d), Stale, Settle?, Last Receipt, Close | as today |

`Ord Wt`/`Recv Wt`/`Bal Wt` item-level MT columns leave the detail grid (they stay in the By Quality
tab, which is inherently per quality and has no lorry notion). The By Supplier tab gains the four
lorry-and-weight columns, aggregated over the supplier's distinct POs. KPI "Balance" tile reads
"<MT> MT · <n> lorries"; a **Returned** tile appears when `totals.returned_lorries > 0`.

Backend (`po_position.py` / `reportQueries.py`): add per row `returned_lorries`, `returned_weight`
(MRs with `po_id`, a gate entry, `status_id = 48`, arrived ≤ `as_on`), and `totals.returned_lorries`,
`totals.returned_weight`, `totals.order_lorries`, `totals.received_lorries`, `totals.pending_lorries`.
The engine's `PoReceipts` gains `returned_lorries`, `returned_weight` (informational; never counted as
received).

### 11.3 Return logic — what was checked and what changes

Checked (`mr.py return_mr`): allowed from MR status Open (1) or Pending (13) only, refuses when
downstream documents exist, sets status 48 RETURNED, appends "[Returned: reason]" to remarks, and
calls the settlement hook. The engine and every stock report exclude status 48, so a returned lorry
never counts as received and the PO stays outstanding until a replacement lorry arrives or the PO is
short-closed. That matches the owner's intent. Gaps found:

1. **sls has no `status_mst` row 48** (dev3 does). `return_mr` on sls would write an unknown status
   and every status-name join would show a blank. The sls settlement migration must INSERT
   `status_mst (48, 'RETURNED')` guarded by NOT EXISTS. Do not run on sls without the owner's OK.
2. A returned lorry currently vanishes from every PO view. §11.2 makes it a visible column and tile,
   and the PO page's Closed/summary area should show "Returned lorries: n" when > 0.
3. `reopen_mr` from Returned: confirm it goes back to Open and the hook re-adds the receipt (test).
4. sls also has MRs in statuses 24 and 17 against POs with gate entries; find out what 24 is
   (`status_mst`) and decide whether it is a receipt — report it, do not guess.

### 11.4 Balance in lorries too

"Also do the same for bal wt": balance is shown as lorries and weight everywhere it appears on the
report (detail, supplier tab, KPI tile, Excel), per the table above.

### 11.5 Lorry count alone never settles (owner, while reviewing the sls branch-29 dry run)

Seeing "lorries 1/1, weight 1,380/14,000 → settled" the owner ruled: the PO stays open because it
does not meet the half-a-lorry weight criterion. So `lorry_rule_enabled` defaults to **0** (base script
rewritten; `2026-09-25c_jute_po_settle_rule_lorry_default_off.sql` applied on dev3 and sls). The
weight test is the deciding rule; the lorry-count OR remains available as a per-company opt-in.
Caption when off: "Settles when weight is within half a lorry of the PO · stale after N days".

### 11.6 Edit access is enforced server-side (owner, 2026-09-25)

Re-evaluate, Close (single and bulk), Reopen of a closed PO and saving the settlement rule are for
users with **edit** access only. The frontend hides the buttons behind `hasMenuAccess(path, "edit")`;
the backend now enforces the same: every one of those endpoints takes an optional `?menu_path=` (the
page the user acts from, sent automatically by the service layer), resolves it to a `menu_mst` row the
way the sidebar does (walking up the path, so the report page resolves to the Jute Report hub), falls
back to the Jute PO menu when the path matches nothing, and returns **403** unless
`role_menu_map.access_type_id >= 4` for the user on the PO's branch (rule save: any branch of the
company). Read endpoints (`GET settle_rule`, `status_log`, the report) stay open to view access.
Implementation: `edit_access_check` / `resolve_menu_id` in `po_settlement.py`, `_require_edit_access`
in `jutePO.py`; tests in `test_jute_po_settlement.py::TestEditAccessGuard`.
