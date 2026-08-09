# Jute Production Planning — SPEC (v1)

**Status: APPROVED DESIGN — implementation in progress (2026-08-08).**
Owner request: a daily planning document for a jute mill, modeled on the mill's Excel
("S4 LOOM PRODUCTION PLANNING"): enter looms + shift-wise machine counts + target eff,
get live helpers (kg/machine/shift, kg/day), a department-wise breakup of production,
the backward material requirement down the chain, and machines required at every stage —
auto-calculated but always user-editable. Save + print. **No approval workflow**
(matches the jute-production module convention: direct CRUD, soft delete, `status_id=1`).
Plan-vs-actual comparison is a later phase, out of scope here.

---

## 1. Concepts and units (read this first)

- **Plan document**: one per `(co_id, branch_id, plan_date)` (enforced on save among
  `active=1` headers). Header + three line sections. `plan_no` generated `JPP-00001`
  style from `planning_id` after insert.
- **Shift grain, not spell**: the plan stores three fixed shift columns **A / B / C**
  (the derived grouping of spells A=(A1,A2), B=(B1,B2), C=(C) — see
  `vowerp3be/src/juteProduction/constants.py` A_SHIFT/B_SHIFT/C_SHIFT). Planning is
  the first feature to *store* shift-grain numbers; that is deliberate and documented here.
- **All machine rates are per machine per shift.** `kg_per_loom`, `kg_per_frame`,
  `kg_per_machine` = kg produced by one machine in one shift. Therefore
  `*_required` values are **machine-shifts per day** (`day_kg / kg_per_shift`), and the
  A/B/C allocation columns are machines running in that shift (their sum should cover
  `*_required`). Helper display: kg/machine/day = rate × shifts run.
- **Eff handling**: norms store the 100%-eff rate (`kg_per_loom_100`,
  `kg_per_frame_100`); the plan line stores `eff_pct` and the effective rate
  (`kg_per_loom = kg_per_loom_100 × eff_pct/100`), which stays editable (user override wins).
- **Material chain (backward explosion)**, flow order `stage_seq` 1→7:
  `BATCHING(1, Spreader) → CARDING(2) → DRAWING(3) → SPINNING(4) → WINDING(5) → BEAMING(6) → WEAVING(7)`.
  Requirement cascades backward from weaving: each stage's
  `input_kg_day = output_kg_day × (1 + waste_pct/100)`, and the upstream stage's
  `output_kg_day` defaults to the downstream stage's `input_kg_day`.
  BATCHING's `input_kg_day` is the headline **raw jute required per day**.
- **Naming**: everything is `jute_prod_planning*` / "Production Planning" — deliberately
  distinct from `jute_batch_plan` (raw-material blend recipe, Jute Purchase) and from the
  per-stage `*_target_map` norms.

## 2. Database (new tables, dev3 target; migration in `vowerp3be/dbqueries/migrations/`)

MySQL, follow module style (DECIMAL rates, `active INT default 1`, `updated_by`,
`updated_date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP`). Include rollback `DROP TABLE`
statements as comments. ORM: `vowerp3be/src/juteProduction/planning_models.py`
(SQLAlchemy 2.0 `Mapped`/`mapped_column` style, mirror `spinning_models.py`).

### 2.1 `jute_prod_planning` (header)
```sql
planning_id INT PK AI; co_id INT NOT NULL; branch_id INT NULL;
plan_date DATE NOT NULL; plan_no VARCHAR(30) NULL; plan_name VARCHAR(100) NULL;
remarks VARCHAR(500) NULL; status_id INT NOT NULL DEFAULT 1;
active INT NOT NULL DEFAULT 1; updated_by INT NULL;
updated_date_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
KEY idx_jpp_co_date (co_id, plan_date); KEY idx_jpp_branch (branch_id);
```

### 2.2 `jute_prod_planning_loom` (Section 1 — loom/weaving plan lines)
```sql
planning_loom_id INT PK AI; planning_id INT NOT NULL (KEY);
product_group VARCHAR(20) NOT NULL;        -- 'SACKING'|'HESSIAN'|'PACKSHEET'|'OTHER'
quality_item_id INT NULL;                  -- item_mst id (cloth quality, item_type 5); NULL = group-level row
quality_desc VARCHAR(120) NULL;            -- denormalized label as printed
looms_a DECIMAL(8,2) NOT NULL DEFAULT 0; looms_b ...; looms_c ...;
kg_per_loom_100 DECIMAL(10,3) NOT NULL DEFAULT 0;   -- per loom per shift @100% eff
eff_pct DECIMAL(5,2) NOT NULL DEFAULT 0;
kg_per_loom DECIMAL(10,3) NOT NULL DEFAULT 0;       -- effective per shift
prod_a DECIMAL(12,3) NOT NULL DEFAULT 0; prod_b ...; prod_c ...;   -- looms_x * kg_per_loom
warp_yarn_item_id INT NULL; weft_yarn_item_id INT NULL;
warp_pct DECIMAL(5,2) NULL; weft_pct DECIMAL(5,2) NULL;
line_order INT NOT NULL DEFAULT 0; remarks VARCHAR(255) NULL;
active INT NOT NULL DEFAULT 1; updated_by INT NULL; updated_date_time TIMESTAMP ...;
```

### 2.3 `jute_prod_planning_yarn` (Section 2 — yarn requirement + frame allocation)
```sql
planning_yarn_id INT PK AI; planning_id INT NOT NULL (KEY);
line_kind VARCHAR(10) NOT NULL;            -- 'CLOTH' (derived from loom plan) | 'SALE' (order-driven)
section VARCHAR(20) NOT NULL;              -- 'SACKING'|'HESSIAN'|'PACKSHEET'|'TWINE'|'SALE'|'OTHER'
yarn_item_id INT NULL; yarn_desc VARCHAR(120) NULL;
warp_weft VARCHAR(2) NULL;                 -- 'WP'|'WT'|NULL
pct_of_prod DECIMAL(5,2) NULL;             -- CLOTH+SACKING style: % of section cloth production
req_kg_a DECIMAL(12,3) NOT NULL DEFAULT 0; req_kg_b ...; req_kg_c ...;
req_kg_day DECIMAL(12,3) NOT NULL DEFAULT 0;
kg_per_frame_100 DECIMAL(10,3) NOT NULL DEFAULT 0;  -- per frame per shift @100%
eff_pct DECIMAL(5,2) NOT NULL DEFAULT 0;
kg_per_frame DECIMAL(10,3) NOT NULL DEFAULT 0;      -- effective per frame-shift
frames_required DECIMAL(8,2) NOT NULL DEFAULT 0;    -- frame-shifts/day = req_kg_day / kg_per_frame
frames_a DECIMAL(6,1) NOT NULL DEFAULT 0; frames_b ...; frames_c ...;
priority INT NULL;
order_mt DECIMAL(10,3) NULL;               -- SALE lines: order quantity (MT)
days_needed DECIMAL(8,2) NULL;             -- SALE: (order_mt*1000/kg_per_frame) / (frames_a+b+c)
delivery_date DATE NULL;                   -- SALE lines
line_order INT NOT NULL DEFAULT 0; remarks VARCHAR(255) NULL;
active INT NOT NULL DEFAULT 1; updated_by INT NULL; updated_date_time TIMESTAMP ...;
```

### 2.4 `jute_prod_planning_dept` (Section 3 — dept-wise breakup / machines required)
```sql
planning_dept_id INT PK AI; planning_id INT NOT NULL (KEY);
stage_seq INT NOT NULL;                    -- 1..7 (flow order above)
stage_code VARCHAR(20) NOT NULL;           -- 'BATCHING'|'CARDING'|'DRAWING'|'SPINNING'|'WINDING'|'BEAMING'|'WEAVING'
stage_label VARCHAR(50) NULL;
output_kg_day DECIMAL(14,3) NOT NULL DEFAULT 0;   -- required output/day
waste_pct DECIMAL(5,2) NOT NULL DEFAULT 0;
input_kg_day DECIMAL(14,3) NOT NULL DEFAULT 0;    -- output * (1 + waste_pct/100)
kg_per_machine DECIMAL(12,3) NOT NULL DEFAULT 0;  -- per machine per shift
machines_required DECIMAL(8,2) NOT NULL DEFAULT 0;-- machine-shifts/day = output_kg_day / kg_per_machine
machines_a DECIMAL(6,1) NOT NULL DEFAULT 0; machines_b ...; machines_c ...;
machines_installed INT NULL; machines_maint INT NULL; machines_ready INT NULL;
line_order INT NOT NULL DEFAULT 0; remarks VARCHAR(255) NULL;
active INT NOT NULL DEFAULT 1; updated_by INT NULL; updated_date_time TIMESTAMP ...;
```
Note: for WINDING, "machines" are effectively winders (winding is person-keyed in this
ERP and has no machine/target infrastructure by design) — the FE labels that row's count
"Machines / Workers".

### 2.5 `jute_prod_planning_norm` (norms master — same EAV shape as `*_target_map`)
```sql
planning_norm_id INT PK AI; co_id INT NOT NULL; branch_id INT NULL;
effective_date DATE NOT NULL;
ref_id INT NOT NULL;              -- qid: cloth item_id | yid: yarn item_id | stage: stage_seq (1..7)
id_type VARCHAR(8) NOT NULL;      -- 'qid' | 'yid' | 'stage'
value_role VARCHAR(10) NOT NULL DEFAULT 'standard';   -- fixed 'standard' in v1 (shape parity with *_target_map)
param VARCHAR(30) NOT NULL;
value DECIMAL(14,4) NOT NULL DEFAULT 0;
active INT NOT NULL DEFAULT 1; updated_by INT NULL; updated_date_time TIMESTAMP ...;
KEY idx_jppn (co_id, id_type, ref_id, param, effective_date);
```
Resolution rule (same as every target_map): among `active=1` rows matching
`(co_id, id_type, ref_id, param)`, take the row with `MAX(effective_date) <= on_date`.

**Params** —
`id_type='qid'` (cloth quality item): `kg_per_loom_100`, `warp_pct`, `weft_pct`,
`warp_yarn_item` (value = yarn item_id), `weft_yarn_item` (value = yarn item_id), `std_eff`.
`id_type='yid'` (yarn item): `kg_per_frame_100`, `std_eff`.
`id_type='stage'` (ref_id = stage_seq): `kg_per_machine`, `waste_pct`.

## 3. Backend (vowerp3be)

Files: `src/juteProduction/planning.py` (one APIRouter — plan + norms endpoints),
`src/juteProduction/planning_models.py`, optional `planning_query.py` for the bigger
SELECTs. Register in `src/main.py`:
`app.include_router(planning_router, prefix="/api/juteProdPlanning", tags=["jute-production-planning"])`
next to the other juteProduction routers. **Portal persona**: `Depends(get_tenant_db)` +
`Depends(get_current_user_with_refresh)`, plain `def` handlers (Sync Handler Policy;
JSON bodies via `parse_json_body(request)`), responses always `{"data": ...}`.
Validate `co_id` (400 if missing), type-cast every param, `None` (never "null") for SQL NULL.
Stage constants (`PLANNING_STAGES` list of `(stage_seq, stage_code, label, machine_type_name)`)
go in `src/juteProduction/constants.py`:
`(1,'BATCHING','Batching (Spreader)','Spreader'), (2,'CARDING','Carding','Carding'),
(3,'DRAWING','Drawing','Drawing'), (4,'SPINNING','Spinning','Spinning'),
(5,'WINDING','Winding','Winding'), (6,'BEAMING','Beaming','Beaming'), (7,'WEAVING','Weaving','Loom')`.
Machine-type resolution is by name, case-insensitive, like every other stage; a type
that doesn't exist in the tenant simply yields count 0.

### Endpoints
| Method+path | Purpose |
|---|---|
| `GET /planning_table?co_id&branch_id&from_date&to_date` | List headers (id, plan_no, plan_date, plan_name, branch, totals: total_cloth_kg = SUM(loom prod), raw_jute_kg = BATCHING input_kg_day, updated info). Newest first. |
| `GET /planning_setup?co_id&branch_id&plan_date` | Returns `{"data": {"cloth_qualities":[{item_id,item_name,grp_name}], "yarn_items":[{item_id,item_name,yarn_count}], "stages":[{stage_seq,stage_code,stage_label,machine_type_name,machines_installed}], "norms":[{id_type,ref_id,param,value}], "latest_planning_id": int|null}}`. cloth_qualities = item_mst joined item_grp_mst where item_type_id=5, active; yarn_items = item_type_id=4 items (LEFT JOIN jute_yarn_mst for yarn_count). machines_installed = COUNT(machine_mst m JOIN machine_type_mst t ON ... WHERE LOWER(t.machine_type_name)=LOWER(:name) AND m.active=1). norms resolved per §2.5 for plan_date. |
| `GET /planning_by_id/{planning_id}?co_id` | Full document: header + loom_lines + yarn_lines + dept_lines (active rows, line_order ASC). 404 if not found/inactive. |
| `GET /planning_latest?co_id&branch_id&before_date` | Same shape as planning_by_id for the newest active plan with `plan_date <= before_date` (used by "Copy latest plan"); `{"data": null}` if none. |
| `POST /planning_save` | Body: `{co_id, branch_id, planning_id?|null, plan_date, plan_name?, remarks?, loom_lines:[], yarn_lines:[], dept_lines:[], update_norms?:bool}`. Create or update. Uniqueness: another active header with same (co_id, branch_id, plan_date) → 400 "A plan already exists for this date". Lines are replaced wholesale (DELETE children of planning_id, re-INSERT with line_order) in one transaction. On insert, set `plan_no = CONCAT('JPP-', LPAD(planning_id,5,'0'))`. If `update_norms` true: upsert `jute_prod_planning_norm` rows at `effective_date=plan_date` from line values (qid: kg_per_loom_100/warp_pct/weft_pct/warp_yarn_item/weft_yarn_item/std_eff per quality line; yid: kg_per_frame_100/std_eff per yarn line with yarn_item_id; stage: kg_per_machine/waste_pct per dept line) — insert new row only when the resolved value differs. Returns `{"data": {"planning_id", "plan_no"}}`. |
| `POST /planning_delete` | Body `{planning_id, co_id}`. Soft delete header (`active=0`). |
| `GET /norms_grid?co_id&branch_id&on_date&id_type` | Resolved norm values for the norms page grid: rows = refs (qid → cloth qualities, yid → yarn items, stage → stages), cols = params for that id_type; include ref labels. |
| `GET /norms_list?co_id&id_type&ref_id` | Raw history rows for a ref (audit/history view). |
| `POST /norms_bulk_save` | Body `{co_id, branch_id, effective_date, entries:[{id_type, ref_id, param, value}]}`. Insert rows (skip when value equals currently-resolved value). Mirrors `target_map_bulk_save` in `spng_target_map.py`. |
| `POST /norms_delete` | Body `{planning_norm_id, co_id}` → soft delete. |

### Tests (`src/test/test_jute_production_planning.py`)
Mock `get_tenant_db` + `get_current_user_with_refresh` exactly like
`src/test/test_yarn_quality.py`. Cover: missing co_id → 400 on planning_setup /
planning_table / planning_save; planning_save happy path (verify header insert + line
inserts + plan_no update executed, returns planning_id); duplicate-date → 400;
planning_by_id not found → 404; norms_bulk_save happy path; norms_grid happy path.

## 4. Frontend (vowerp3ui)

### 4.1 Route constants — `src/utils/api.ts`, inside `apiRoutesPortalMasters`, new block
`// Jute Production — Production Planning` (place after the weaving target map block):
`JUTE_PROD_PLANNING_TABLE|_SETUP|_BY_ID|_LATEST|_SAVE|_DELETE|_NORMS_GRID|_NORMS_LIST|_NORMS_BULK_SAVE|_NORMS_DELETE`
→ `${API_URL}/juteProdPlanning/<path>` matching §3.

### 4.2 Service — `src/utils/juteProductionPlanningService.ts`
All request/response types + one async function per endpoint via
`fetchWithCookie` (`@/utils/apiClient2`), throwing on `error`/missing `data`
(mirror `indentService.ts` style). No page/hook calls `fetchWithCookie` directly.

### 4.3 Pages (`src/app/dashboardportal/juteProduction/`)
```
productionPlanning/
  page.tsx                       # list: date-range filter, table (plan_no, date, name, cloth kg/day,
                                 # raw jute kg/day, updated), actions View/Edit/Print/Delete, "New Plan"
  components/ProductionPlanningPreview.tsx   # print preview (also used by list Print action)
  createProductionPlanning/
    page.tsx                     # <Suspense>; mode=create|edit|view + id via useSearchParams;
                                 # coId via useSelectedCompanyCoId(); branch defaulted from sidebar
    components/PlanningHeaderForm.tsx
    components/LoomPlanSection.tsx       # Section 1 grid, grouped by product_group
    components/YarnPlanSection.tsx       # Section 2 grid: CLOTH rows (auto) + SALE rows (manual)
    components/DeptBreakupSection.tsx    # Section 3 grid: 7 stage rows
    components/PlanningSummaryBar.tsx    # sticky helper chips (see 4.5)
    hooks/usePlanningSetup.ts            # fetch setup, resolve norms into lookup maps
    hooks/usePlanningDocState.ts         # document state + dirty tracking + load by id/copy-latest
    hooks/usePlanningCalc.ts             # orchestrates recalc pipeline on every edit
    types/productionPlanningTypes.ts     # ALL types in this one file
    utils/planningConstants.ts           # PRODUCT_GROUPS, STAGES, SECTIONS, frozen empties
    utils/planningFactories.ts           # blank line factories, default doc builder (from setup+norms)
    utils/planningCalc.ts                # PURE calculation engine (see 4.4) — unit-tested
    utils/planningCalc.test.ts           # vitest tests for every formula + cascade
    utils/planningMappers.ts             # API ⇄ UI mapping
masters/planningNorms/
  page.tsx + _components/…       # norms master: id_type tabs (Cloth / Yarn / Stages), grid rows=refs,
                                 # cols=params, effective-date picker + bulk save + history —
                                 # clone masters/spngTargetMap (TargetGrid/TargetMapEditor pattern)
```
Also: add two tiles to `juteProduction/page.tsx` landing grid (Production Planning,
Planning Norms). Styling: Tailwind layout + MUI inputs + theme tokens (no hardcoded
colors); compact editable tables in the style of the existing spinning/weaving
PlanningGrid components. Every grid cell is a small numeric input, disabled when
`mode==="view"`. Zod schema validates the document before save (non-negative numbers,
pct 0–100, required plan_date/branch).

### 4.4 Calculation engine (`planningCalc.ts`) — pure functions, the heart of the page
Auto vs manual: every derivable field carries an `auto` flag in UI state (types define
`CalcField = {value:number, auto:boolean}` or a parallel `overrides` set). Editing a
cell sets it manual; auto cells recompute on every upstream change; a per-section
"Recalculate" button resets manual flags to auto. Persistence stores plain numbers
(flags are UI-only; an edited plan reloads as all-manual until Recalculate).

1. **Loom line**: `kg_per_loom = round3(kg_per_loom_100 * eff_pct/100)`;
   `prod_x = looms_x * kg_per_loom` (x∈{a,b,c}); `prod_day = Σ prod_x`.
   Section totals per product_group and grand total cloth kg/day.
2. **Yarn CLOTH lines** (`deriveYarnLines`): for SACKING-style groups (group-level rows,
   `pct_of_prod` lines): `req_kg_x = group_prod_x * pct/100`. For HESSIAN/PACKSHEET
   quality rows: warp kg = `prod * warp_pct/100` aggregated by `warp_yarn_item_id`
   (warp_weft='WP'), weft likewise ('WT'). Derived rows merge into existing yarn lines
   by `(section, yarn_item_id, warp_weft)` preserving user-edited rate/allocation cells;
   removed sources drop their auto rows.
3. **Yarn line rates**: `kg_per_frame = round3(kg_per_frame_100 * eff_pct/100)`;
   `frames_required = req_kg_day / kg_per_frame` (guard ÷0 → 0);
   auto allocation suggestion `frames_x = ceil(frames_required/3 * 10)/10` (editable).
   SALE lines: `req_kg_day` is not cloth-driven; daily production commitment
   `= (frames_a+frames_b+frames_c) * kg_per_frame`;
   `days_needed = (order_mt*1000/kg_per_frame) / max(frames_a+b+c, ε)`.
4. **Dept cascade** (`buildDeptCascade`):
   - WEAVING: `output_kg_day` = grand total cloth kg/day; `machines_x` = Σ looms_x;
     `machines_required` = Σ machines_x; `kg_per_machine` = weighted avg kg_per_loom.
   - SPINNING: `output_kg_day` = Σ CLOTH `req_kg_day` + Σ SALE daily commitment;
     `machines_x` = Σ frames_x; `machines_required` = Σ frames_required (all yarn lines).
   - BEAMING: `output_kg_day` = Σ WP CLOTH req_kg_day.
   - WINDING: `output_kg_day` = Σ WT CLOTH req_kg_day + Σ SALE daily commitment.
   - DRAWING: `output_kg_day` = SPINNING `input_kg_day`.
   - CARDING: `output_kg_day` = DRAWING `input_kg_day`.
   - BATCHING: `output_kg_day` = CARDING `input_kg_day`.
   - Every stage: `input_kg_day = output_kg_day * (1 + waste_pct/100)`;
     `machines_required = output_kg_day / kg_per_machine` (÷0→0) except WEAVING/SPINNING
     (from sections above); `machines_ready = machines_installed − machines_maint` when
     both present.
5. **Warnings** (summary bar + row highlight): Σ allocated < required (frames or
   machines, per row); allocated machines > machines_ready×(shifts run); yarn pct sum
   for a sacking group ≠ 100; warp_pct+weft_pct ≠ 100 on a quality line.

### 4.5 Helper display (the "quick review")
Sticky `PlanningSummaryBar`: Total cloth kg/day • Total yarn kg/day • Frames needed vs
allocated vs ready • Raw jute required kg/day • per-line inline helpers under rate cells
("≈ X kg/loom/day", "Y frames/shift"). This is the at-a-glance review the user asked for.

### 4.6 Print
Pattern A (transaction preview print): `ProductionPlanningPreview` renders the whole
document as one printable sheet — company letterhead via `CompanyHeaderBlock`
(`src/app/dashboardportal/procurement/_shared/PrintHeader.tsx`), title
"PRODUCTION PLANNING", plan_no/date/branch, then Sections 1–3 as compact bordered
tables mirroring the Excel layout, plus a machine-availability summary box. Print via
`openStyledPrintWindow(previewRef.current.innerHTML, title)` from `src/utils/printUtils.ts`.

## 5. Menu wiring (SQL scripts only — DB unreachable from this environment)

`vowerp3be/dbqueries/migrations/20260808_jute_production_planning_menu.sql`:
INSERTs for `portal_menu_mst` (vowconsole3 template) and `menu_mst` + `role_menu_map`
(dev3) for two entries under the Jute Production module:
- "Production Planning" → `/dashboardportal/juteProduction/productionPlanning`
- "Planning Norms" → `/dashboardportal/juteProduction/masters/planningNorms`
Follow `.claude/skills/add-menu/SKILL.md` column conventions (parent menu, order,
module map, action levels view/print/create/edit). Script must be idempotent
(guard with NOT EXISTS selects). Table DDL + menu SQL are to be executed manually
against dev3 (documented in the migration header) since this sandbox has no MySQL egress.

## 6. Out of scope (v1) — recorded for the fast-follow
Plan-vs-actual review (targets vs `jute_prod_*_daily` actuals), approval workflow,
spell-level planning, linking SALE lines to sales orders, auto frame-to-quality map
push (`spg_quality_helper`), Excel/PDF export (print only for now).
