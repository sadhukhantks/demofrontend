

# Jute Production Pages — Part 1: Winding Production (proposed)

Last verified: 2026-06-13

> Scope: the proposed **Winding Production** page and its winding-machine master. This is a
> **design catalog — no FE code exists yet**. It mirrors the spreader page's 3-tab layout and the
> drawing page's "client calc mirrors backend rules" pattern. Authoritative logic + formulas live
> in `../vowerp3be/docs/winding-production-design.md`.

## Winding Production — `juteProduction/winding/` (proposed)

Single `page.tsx` with **three tabs**, one per legacy screen:

### Tab 1 — Doff Entry
Weigh a wound trolly covering 1–3 machines that share one trolly + spool.

- Inputs: date, spell (auto by hour), no-of-machines (1–3), MC#1/#2/#3, trolly no, spool code,
  quality, gross weight.
- Lookups on the fly: trolly weight, spool weight; previous doff prefill (last entry for MC#1).
- Client formula (`utils/windingCalc.ts`, mirrors BE `services/winding_rules.py`):
  - `netwt = grosswt − trollywt − (nomc × spoolwt)` — must be `> 0` to enable Save.
  - `net/mc = round( round2(grosswt/nomc) − round2(trollywt/nomc) − spoolwt )` — same value to each
    active machine; one saved row per machine.
- Validation: trolly + MC#1 + spool + quality required; MC#2 if nomc≥2, MC#3 if nomc=3;
  `grosswt > 0`; `1 ≤ net/mc ≤ 500`.
- Day grid lists the date/spell/mc rows; row delete = soft delete.

### Tab 2 — Jugar Entry (open/close)
Spindle leftover weight at shift boundary, per machine, **Opening ('O')** and **Closing ('C')**.

- Inputs: date, spell, machine, open/close, jugar weight (`0 < wt ≤ 100`); a prev date/spell ref
  drives carry-forward.
- Carry-forward (BE `jugar_prev_state`): Opening defaults to the matching prior opening, else the
  most recent prior **closing** (last shift's leftover); Closing defaults to the prior closing.
  Existing record → form switches Save → Update.

### Tab 3 — Quality Entry
Assign yarn quality + no-of-spindles per machine for the date/spell.

- "Get Quality" auto-seeds one row per winding machine, inheriting the previous spell's quality +
  spindle count.
- Save updates quality + spindle for the selected machine; duplicate per machine/date/spell blocked.
- Spindle bounds: legacy view allows 1–30 (alert text says 1–16 — **to be resolved**, see design doc §3.3).

### Daily reconciliation (reports, not data entry)
Actual production is computed (not stored) as
`Σ(doff.production) − opening_jugar + closing_jugar`, and converted kg→bundles via `/14` when the
quality UOM = `'B'`. Target = `quality.target_prod / 8 × (working − idle hours)`;
efficiency = `prod / target × 100`. Full formulas: design doc §4.

### Proposed structure (mirror spreader/drawing)
- `hooks/`: `useWindingSetup` (machines/qualities/spells/trollies), `useDoffEntriesByDate`,
  `useDoffMachinePrevState`, `useJugarPrevState`, `useJugarByDate`, `useQualityByDate`.
- `_components/`: `DoffEntryForm`, `DailyDoffGrid`, `JugarEntryForm`, `DailyJugarGrid`,
  `QualityEntryForm`, `DailyQualityGrid`.
- `types/windingTypes.ts`; `utils/windingCalc.ts` (net-split + reconciliation), `utils/shift.ts`.
- Landing tile added in `juteProduction/page.tsx`.

### Proposed endpoints (BE `src/juteProduction/winding_entry.py`, prefix `/windingProd`)

| api.ts const (proposed) | URL | Purpose |
|---|---|---|
| `WINDING_DOFF_CREATE_SETUP` | `/windingProd/doff_entry_create_setup` | machines, qualities, trollies/spools, spells |
| `WINDING_DOFF_MACHINE_PREV_STATE` | `/windingProd/doff_machine_prev_state` | prefill from last doff of MC#1 |
| `WINDING_DOFF_CREATE` | `/windingProd/doff_entry_create` | insert 1–3 doff rows |
| `WINDING_DOFF_BY_DATE` | `/windingProd/doff_entries_by_date` | day/spell/mc grid |
| `WINDING_DOFF_EDIT` | `/windingProd/doff_entry_edit/{id}` | edit |
| `WINDING_DOFF_DELETE` | `/windingProd/doff_entry_delete/{id}` | soft delete |
| `WINDING_JUGAR_SETUP` | `/windingProd/jugar_setup` | machines/spells |
| `WINDING_JUGAR_PREV_STATE` | `/windingProd/jugar_prev_state` | open/close carry-forward |
| `WINDING_JUGAR_SAVE` | `/windingProd/jugar_save` | insert jugar |
| `WINDING_JUGAR_UPDATE` | `/windingProd/jugar_update/{id}` | update weight |
| `WINDING_JUGAR_BY_DATE` | `/windingProd/jugar_by_date` | jugar grid |
| `WINDING_QUALITY_SETUP` | `/windingProd/quality_setup` | auto-seed + machine list |
| `WINDING_QUALITY_SAVE` | `/windingProd/quality_save` | update quality + spindle |
| `WINDING_QUALITY_BY_DATE` | `/windingProd/quality_by_date` | quality grid |

## Winding Machine Master — `juteProduction/masters/windingMachineAttr/` (proposed)

Single-file list + create + edit page (no delete), mirroring `drawingMachineAttr`. Per-machine
winding attributes (e.g. default spool, capacity). Prefix `/windingMasters`.

| api.ts const (proposed) | URL | Purpose |
|---|---|---|
| `WINDING_MACHINE_ATTR_LIST` | `/windingMasters/winding_machine_attr_list` | list |
| `WINDING_MACHINE_ATTR_CREATE` | `/windingMasters/winding_machine_attr_create` | create |
| `WINDING_MACHINE_ATTR_EDIT` | `/windingMasters/winding_machine_attr_edit/{id}` | edit |

Winding **quality** master (target_prod + UOM + group) is an open question — may reuse/extend
`yarn_quality_param` or get its own master (design doc §6.1, §7).
