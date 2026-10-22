"use client";

import React from "react";
import GlobalStyles from "@mui/material/GlobalStyles";
import { printFrameCss } from "@/utils/printFrame";

export interface PrintFrameProps {
  /** The printed content (a print root's children). */
  children: React.ReactNode;
  /**
   * Top / bottom paper margin in mm, repeated on every printed page. Match the
   * margin the page used to get from `@page` (the `@page` margin is now 0).
   */
  marginMm: number;
}

/**
 * Keeps the paper's top / bottom margin on EVERY printed page of a live-page
 * `window.print()` report whose `@page` margin is 0 (zero page margin is what
 * makes the browser omit its own header / footer - see CLAUDE.md "Printing").
 *
 * Chrome repeats a table's `thead` / `tfoot` on every page, so the content is
 * wrapped in a one-cell layout table whose `thead` / `tfoot` hold spacers. On
 * screen the frame is invisible (0-high spacers, no borders or padding). The
 * left / right margin is still the print root's own padding / offset.
 * HTML-string print windows use `wrapInPrintFrame` from `@/utils/printFrame`.
 */
export default function PrintFrame({ children, marginMm }: PrintFrameProps) {
  return (
    <>
      <GlobalStyles styles={printFrameCss({ topMm: marginMm })} />
      <table className="print-frame" role="presentation">
        <thead>
          <tr>
            <td>
              <div className="print-frame-top" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className="print-frame-bottom" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td>{children}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
