import type { SxProps, Theme } from "@mui/material/styles";

/**
 * Keeps a `<form>`-wrapped dialog scrolling in its content area.
 *
 * Every master dialog puts one `<form>` between the dialog paper and
 * DialogTitle / DialogContent / DialogActions. MUI's paper is a flex column and
 * DialogContent is `flex: 1 1 auto; overflow-y: auto`, but that only works when
 * DialogContent is a flex child — the plain `<form>` in between breaks the
 * chain, so the whole paper scrolls and the Save row scrolls away with it. That
 * is barely noticeable in a small inset dialog and very noticeable in a
 * full-bleed one on a phone, where the dialog is the whole screen.
 *
 * Making the form itself a flex column restores it: the title stays at the top,
 * the buttons stay under the thumb, and only the fields scroll. Above `sm` the
 * paper's height is still content-driven, so desktop is unchanged.
 *
 * Pass as `sx={DIALOG_FORM_SCROLL_SX}` on the `<Dialog>`.
 */
export const DIALOG_FORM_SCROLL_SX: SxProps<Theme> = {
	"& .MuiDialog-paper > form": {
		display: "flex",
		flexDirection: "column",
		flex: 1,
		minHeight: 0,
	},
};
