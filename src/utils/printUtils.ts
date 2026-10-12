/**
 * Utilities for opening print windows with full CSS styling.
 *
 * MUI / Emotion inserts styles via `CSSStyleSheet.insertRule()` in production,
 * which means `<style>` tags contain no text content — `cloneNode(true)` copies
 * empty tags. This utility reads every CSS rule from `document.styleSheets`
 * through the CSSOM API so that the print window receives the actual rules
 * regardless of how they were inserted.
 */

import { printFrameCss, wrapInPrintFrame } from "@/utils/printFrame";

/** Paper margin of every `openStyledPrintWindow` printout, mm. */
const PRINT_MARGIN_MM = 15;

/**
 * Collects all CSS rules from the current document's stylesheets into a
 * single string that can be injected into a print window.
 *
 * Cross-origin sheets (e.g. Google Fonts) are handled gracefully — if the
 * browser blocks access to their rules, the original `<link>` tag href is
 * included instead so the browser can re-fetch it.
 */
export function collectDocumentStyles(): {
  cssText: string;
  linkHrefs: string[];
} {
  const rules: string[] = [];
  const linkHrefs: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Try reading rules via CSSOM (works for same-origin & Emotion sheets)
      const cssRules = sheet.cssRules || sheet.rules;
      for (const rule of Array.from(cssRules)) {
        rules.push(rule.cssText);
      }
    } catch {
      // Cross-origin stylesheet — fall back to its href so the browser can
      // fetch it in the new window.
      if (sheet.href) {
        linkHrefs.push(sheet.href);
      }
    }
  }

  return { cssText: rules.join("\n"), linkHrefs };
}

/**
 * Opens a new browser window with the given inner HTML and all of the current
 * page's CSS rules, then returns the window reference.
 *
 * @param innerHTML  The HTML content to place inside `<div id="print-root">`
 *                   (itself wrapped in the repeating-margin print frame).
 * @param title      The document title for the print window.
 * @param extraCss   Optional extra CSS text appended after the document styles.
 * @returns The opened window, or `null` if popups are blocked.
 */
export function openStyledPrintWindow(
  innerHTML: string,
  title: string,
  extraCss?: string
): Window | null {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to print this document.");
    return null;
  }

  const { cssText, linkHrefs } = collectDocumentStyles();

  // Build <link> tags for any cross-origin stylesheets
  const linkTags = linkHrefs
    .map((href) => `<link rel="stylesheet" href="${href}" />`)
    .join("\n");

  // Default print helpers. `@page` margin 0 suppresses the browser's own
  // header/footer (date, title, URL, page number); the paper margin comes from
  // the print frame (src/utils/printFrame.ts) so it repeats on every page.
  const printHelpers = `
    @media print {
      @page { size: A4; margin: 0; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table { width: 100%; border-collapse: collapse; }
      #preview-left-pane { max-width: 25% !important; flex-basis: 25% !important; word-break: break-word; white-space: normal; }
    }
    ${printFrameCss({ sideMm: PRINT_MARGIN_MM, topMm: PRINT_MARGIN_MM })}
  `;

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  ${linkTags}
  <style>${cssText}</style>
  <style>${printHelpers}</style>
  ${extraCss ? `<style>${extraCss}</style>` : ""}
</head>
<body>
  ${wrapInPrintFrame(`<div id="print-root">${innerHTML}</div>`)}
</body>
</html>`);
  printWindow.document.close();

  return printWindow;
}
