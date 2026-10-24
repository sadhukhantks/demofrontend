/**
 * Opens the joining pass print window (browser side effect; the HTML is built
 * by the pure helpers in _utils.ts).
 *
 * openStyledPrintWindow already prints without the browser's own header / footer
 * (`@page { margin: 0 }`) and wraps the content in the print frame
 * (src/utils/printFrame.ts) that gives every page its margins.
 */

import { openStyledPrintWindow } from "@/utils/printUtils";
import type { JpLetter } from "@/utils/joiningPassService";
import { PASS_PRINT_CSS, buildPassesHtml } from "./_utils";

/** False when there was nothing to print or the popup was blocked. */
export function printPasses(letters: ReadonlyArray<JpLetter>, title: string): boolean {
  if (letters.length === 0) return false;
  const w = openStyledPrintWindow(buildPassesHtml(letters), title, PASS_PRINT_CSS);
  if (!w) return false;
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}
