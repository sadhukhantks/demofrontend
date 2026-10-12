/**
 * Opens the letter print window (browser side effect; the HTML itself is
 * built by the pure helpers in _utils.ts).
 *
 * The shared openStyledPrintWindow already prints without the browser's own
 * header / footer (`@page { margin: 0 }`) and wraps the content in the print
 * frame (src/utils/printFrame.ts), whose repeated header / footer spacers give
 * EVERY page its 15 mm top and bottom margin — so no page CSS of our own here
 * (a body padding would double the top margin of page 1). Each letter starts on
 * a new page through the .la-page-break wrapper (LETTER_PRINT_CSS).
 */

import { openStyledPrintWindow } from "@/utils/printUtils";
import { LETTER_PRINT_CSS, buildLettersHtml, type Letterhead, type PrintableLetter } from "./_utils";

/**
 * One window with every letter on its own page, then the print dialog.
 * Returns false when there was nothing to print or the popup was blocked
 * (openStyledPrintWindow already told the user to allow popups).
 */
export function printLetters(head: Letterhead, letters: ReadonlyArray<PrintableLetter>, title: string): boolean {
  if (letters.length === 0) return false;
  const w = openStyledPrintWindow(buildLettersHtml(head, letters), title, LETTER_PRINT_CSS);
  if (!w) return false;
  w.focus();
  // Let the copied stylesheets / logo settle before the dialog opens.
  setTimeout(() => w.print(), 400);
  return true;
}
