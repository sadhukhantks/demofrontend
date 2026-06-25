# Weaving Production — Mobile Entry Redesign

**Date:** 2026-06-25
**Scope:** `dashboardportal/juteProduction/weaving` — **Production Entry** and **Production Adjustment** tabs only. Other tabs (Loom → Quality, Beam Change, Planning Grid) untouched.

## Problem

Both tabs render an MUI `<Table>` with `overflowX: auto` + `minWidth` (640 / 700px). On a ~360px phone the columns run off-screen: loom names wrap to 3 lines, and the input fields + Save button sit beyond the right edge. The operator must scroll the table sideways for every row to enter cuts/jugar and save — unusable for fast field posting.

## Goal

Make both tabs comfortable for one-handed phone posting: quick search, large touch targets, no horizontal scroll, fast sequential entry. Desktop experience stays exactly as it is today.

## Approach — one-loom focus stepper (list + drill-in)

Phone (`<md`, ~<900px) gets a two-state mobile layout; desktop (`≥md`) keeps the current table verbatim. Both layouts are rendered and toggled by CSS (`sx={{ display: { xs: ..., md: ... } }}`) — **no `useMediaQuery`**, to avoid SSR hydration mismatch (per project memory).

### State 1 — List (default)
- Sticky search box on top (reuses existing filter: `mech_posting_code` / `mech_code` / `machine_name`).
- Progress line: Entry → `N done · M left`; Adjustment → `N adjusted`.
- One tappable row per loom: `#posting · mc_code · loom name` + a status badge.
- Tapping a loom opens the focused panel for it.

### State 2 — Focused panel
- Top bar: `‹ back`, `N of M` position within the filtered list.
- Loom identity (`mc_code · machine_name`) + quality chip (read-only, inherited from Loom → Quality map).
- Large numeric inputs (`inputMode="decimal"`, big touch targets).
- Derived value displayed read-only.
- Primary action pinned at the bottom of the panel.

## Per-tab specifics

| | Production Entry | Production Adjustment |
|---|---|---|
| Panel fields | **Cuts**, **Closing Jugar** (big inputs); derived **Jugar** shown read-only | **Reduce Jugar** (big input); quality chip |
| Primary action | **Save & Next** — saves via existing per-loom API (`WEAVING_ENTRY_CREATE` / `_EDIT`), then advances to the next loom in the filtered list | **Done** — applies the value to local edit state and returns to the list |
| Commit model | Per-loom (unchanged from today) | **Batch (unchanged)** — sticky `Save (N unsaved)` bar on the list commits all dirty rows via existing `WEAVING_ADJUSTMENT_SAVE`. No API change. |
| List badge | `✓ <cuts>` saved · `—` pending · `Not mapped` (warning) | reduce value + `Saved` / `Unsaved` chip · `Not mapped` (warning) |

Rationale: Entry is dense (every loom gets cuts → Save & Next chains through them). Adjustment is sparse (reduce a few looms → search/tap each, then one Save). The list + drill-in serves both; search provides jump-to for the sparse case.

## Unmapped looms
Existing guard preserved. List badge shows `Not mapped`; the focused panel disables inputs and shows the current "Map a quality to this loom on the Loom → Quality tab first" hint. No save possible (same as today).

## Code shape
- New shared component `MobileLoomStepper` (in `weaving/_components/`) owns the list/drill-in navigation, search box, and progress line — the chrome common to both tabs. It is parameterized by props:
  - `rows`, `filter` (search predicate), `progressLabel`
  - `renderBadge(row)` — status badge per list row
  - `renderFields(row)` — focused-panel field block
  - `primaryLabel`, `onPrimary(row)` — bottom action (and whether it advances vs returns)
  - optional `footer` — for Adjustment's sticky `Save (N unsaved)` bar
- `WeavingEntryGrid` and `WeavingAdjustmentGrid` each:
  - keep their existing `<Table>` wrapped in `display: { xs: "none", md: "block" }`
  - add `<MobileLoomStepper .../>` wrapped in `display: { xs: "block", md: "none" }`
  - the existing edit state / save handlers / derive logic are reused unchanged — only the presentation forks.
- No new dependencies (MUI + lucide only). No backend changes.

## Non-goals
- No change to desktop tables, other tabs, or any backend endpoint.
- No change to the calculation/derive logic (`effectiveJugar`, server-authoritative outputs).
- No offline / bulk-import / barcode features (YAGNI).

## Testing
- Manual: phone-width viewport (~360px) — verify no horizontal scroll, search filters list, drill-in saves, badges reflect state, desktop table unchanged at ≥md.
- One self-check on the shared component's filter/navigation logic (next-in-filtered-list resolution).
