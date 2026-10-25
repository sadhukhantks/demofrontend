"use client";

import * as React from "react";
import { Box, Paper } from "@mui/material";
import type { JpLetter } from "@/utils/joiningPassService";
import { PASS_PRINT_CSS, buildPassHtml } from "../_utils";

interface PassPreviewProps {
  letter: JpLetter;
}

/**
 * On-screen preview of the pass letter, from the same HTML the print uses
 * (every value is HTML-escaped by buildPassHtml). Read-only by design: the
 * letter text is rendered by the server and never typed by hand.
 */
export default function PassPreview({ letter }: PassPreviewProps) {
  const html = React.useMemo(() => buildPassHtml(letter), [letter]);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 3 }, overflowX: "auto", bgcolor: "background.paper" }}>
      <style>{PASS_PRINT_CSS}</style>
      <Box sx={{ minWidth: 320 }} dangerouslySetInnerHTML={{ __html: html }} />
    </Paper>
  );
}
