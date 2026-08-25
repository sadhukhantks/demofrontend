"use client";

import * as React from "react";
import { Box, Paper, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

/**
 * Shared responsive primitives for data-entry screens that get used on a phone.
 *
 * Responsiveness here is CSS-only — `sx` breakpoints, never `useMediaQuery`. The
 * server render and the first client render therefore emit the same tree, so a
 * page cannot hydrate-mismatch, and the phone layout costs no extra JavaScript on
 * the mill floor where the connection is worst. This mirrors the convention
 * already established in the jute-issue edit screen; these constants were local
 * to that page and are lifted here so entry screens share one definition rather
 * than drifting apart.
 *
 * The other deliberate choice is that a table becomes a CARD LIST on a phone
 * rather than a horizontally-scrolling grid. A fitter standing at a stopped
 * machine cannot scroll a 12-column grid sideways one-handed; MUI's DataGrid also
 * does not reflow, so on a 360px screen it simply clips. Render the grid inside
 * DESKTOP_ONLY_SX and a stack of cards inside MOBILE_ONLY_SX.
 */

/**
 * Dialog paper that goes edge-to-edge on a phone.
 *
 * A 32px margin either side of a 360px screen spends nearly a fifth of the usable
 * width on whitespace, and a data-entry dialog needs every pixel. Above `sm` the
 * normal inset dialog returns.
 *
 * Pass as `PaperProps={MOBILE_FULL_BLEED_PAPER}`.
 *
 * MUI dialogs only. A Radix/shadcn dialog (ItemSelectionDialog, for one) has no
 * `PaperProps`, so it needs the equivalent as Tailwind on its `DialogContent`:
 * `max-sm:max-w-none max-sm:w-full max-sm:h-full max-sm:max-h-full max-sm:rounded-none`.
 */
export const MOBILE_FULL_BLEED_PAPER = {
  sx: {
    m: { xs: 0, sm: 4 },
    width: { xs: "100%", sm: "calc(100% - 64px)" },
    maxWidth: { xs: "100%", sm: undefined },
    maxHeight: { xs: "100%", sm: "calc(100% - 64px)" },
    height: { xs: "100%", sm: "auto" },
    borderRadius: { xs: 0, sm: 1 },
  },
} as const;

/**
 * Keeps a `<form>`-wrapped dialog scrolling in its content area rather than
 * scrolling the whole paper.
 *
 * MUI's dialog paper is a flex column and DialogContent is
 * `flex: 1 1 auto; overflow-y: auto` — but only while DialogContent is a direct
 * flex child. A `<form>` between the paper and the title/content/actions breaks
 * that chain, so the entire paper scrolls and the Save row scrolls away with it.
 * Barely noticeable in a small inset dialog; very noticeable in a full-bleed one
 * on a phone, where the dialog IS the screen and Save is the whole point.
 *
 * Making the form a flex column restores it: title pinned, buttons under the
 * thumb, only the fields scrolling. Above `sm` the paper stays content-height,
 * so desktop is unchanged.
 *
 * Pair with MOBILE_FULL_BLEED_PAPER on any form-wrapped dialog:
 * `<Dialog PaperProps={MOBILE_FULL_BLEED_PAPER} sx={DIALOG_FORM_SCROLL_SX}>`.
 */
export const DIALOG_FORM_SCROLL_SX = {
  "& .MuiDialog-paper > form": {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
  },
} satisfies SxProps<Theme>;

/**
 * Dialog action row sized for thumbs.
 *
 * 44px is the minimum comfortable touch target; MUI's default button is 36px. On
 * `xs` the buttons split the row evenly instead of hugging their text, so Save is
 * a large target at the bottom of the screen rather than a small one in a corner.
 */
export const DIALOG_ACTIONS_SX = {
  p: 2,
  gap: 1,
  "& .MuiButton-root": { flex: { xs: 1, sm: "none" }, minHeight: 44 },
} satisfies SxProps<Theme>;

/** Show only from `md` up — wrap a DataGrid in this and pair with MOBILE_ONLY_SX. */
export const DESKTOP_ONLY_SX = {
  display: { xs: "none", md: "block" },
  overflowX: "auto",
} satisfies SxProps<Theme>;

/** Show only below `md` — the card-list counterpart to DESKTOP_ONLY_SX. */
export const MOBILE_ONLY_SX = {
  display: { xs: "flex", md: "none" },
  flexDirection: "column",
  gap: 1.5,
} satisfies SxProps<Theme>;

/**
 * Form field grid: one column on a phone, two from `sm`, three from `md`.
 *
 * `minmax(0, 1fr)` rather than `1fr` so a long machine name or reason description
 * cannot force the column wider than the screen — the usual cause of a form that
 * scrolls sideways on a phone.
 */
export const FORM_GRID_SX = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    md: "repeat(3, minmax(0, 1fr))",
  },
} satisfies SxProps<Theme>;

/** Two-column variant, for forms whose fields pair naturally (from/to dates). */
export const FORM_GRID_2_SX = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
} satisfies SxProps<Theme>;

/** Minimum comfortable touch target, in px. */
export const TOUCH_TARGET = 44;

/** Icon button sized for a thumb rather than a mouse pointer. */
export const TOUCH_ICON_BUTTON_SX = {
  minWidth: TOUCH_TARGET,
  minHeight: TOUCH_TARGET,
} satisfies SxProps<Theme>;

/**
 * Action bar that sticks to the bottom of the viewport on a phone.
 *
 * A breakdown form is long enough that Save sits well below the fold, and the
 * entry is made under time pressure with a machine stopped. Sticky on `xs` keeps
 * it reachable; from `sm` up it returns to normal flow.
 */
export const STICKY_ACTIONS_SX = {
  display: "flex",
  gap: 1,
  flexWrap: "wrap",
  position: { xs: "sticky", sm: "static" },
  bottom: { xs: 0, sm: "auto" },
  zIndex: { xs: 2, sm: "auto" },
  bgcolor: "background.paper",
  py: { xs: 1.5, sm: 0 },
  px: { xs: 1.5, sm: 0 },
  mx: { xs: -1.5, sm: 0 },
  borderTop: { xs: 1, sm: 0 },
  borderColor: "divider",
  "& .MuiButton-root": { flex: { xs: 1, sm: "none" }, minHeight: TOUCH_TARGET },
} satisfies SxProps<Theme>;

/** Page padding: tighter on a phone, where 24px either side is real content width. */
export const PAGE_PADDING_SX = { p: { xs: 1.5, sm: 3 } } satisfies SxProps<Theme>;

/** One label/value pair inside a mobile card. */
export function CardStat({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <Box textAlign={align} minWidth={0}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap>
        {label}
      </Typography>
      {/* A <div>, not the default <p>: values are routinely chips or other block
          elements, and nesting those in a <p> is invalid HTML that React warns
          about at runtime. */}
      <Typography variant="body2" component="div" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Card shell for one record in a mobile list.
 *
 * `header` carries the identifying line (machine name, status chip, row actions);
 * children hold the CardStat grid.
 */
export function MobileCard({
  header,
  children,
}: {
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      {header != null && (
        <Box display="flex" alignItems="center" gap={1} mb={1} flexWrap="wrap">
          {header}
        </Box>
      )}
      <Box
        sx={{
          display: "grid",
          gap: 1,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}
