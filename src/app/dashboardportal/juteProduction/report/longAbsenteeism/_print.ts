/**
 * Opens the letter print window (browser side effect; the HTML itself is
 * built by the pure helpers in _utils.ts).
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
