"use client";

/**
 * "Excel" / "PDF" / "Print" for a tab made of several grids (TKT-000190).
 * Each tab passes the sections it is showing — filtered rows and the columns
 * on screen — so the files and the print-out can never disagree with the
 * page. PDF is a direct download (works on a phone); Print opens the browser
 * dialog for paper.
 */

import React from "react";
import { Box, Button } from "@mui/material";
import { usePathname } from "next/navigation";
import type { ReportExportHeader } from "@/components/reports/exportExcel";
import {
  exportGridSectionsToExcel,
  exportGridSectionsToPdf,
  printGridSections,
  printHeaderLines,
  type GridSection,
} from "@/components/reports/gridSections";
import { resolveReportMenuId } from "@/utils/reportMenuService";

export default function ExportActions({
  sections,
  fileNamePrefix,
  header,
  disabled,
}: {
  sections: GridSection[];
  fileNamePrefix: string;
  header: ReportExportHeader;
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const [busy, setBusy] = React.useState(false);
  const empty = sections.every((s) => s.rows.length === 0);
  const title = header.reportName ?? "Report";

  const download = (
    fn: (s: GridSection[], prefix: string, h: ReportExportHeader) => Promise<void>,
  ) => {
    void (async () => {
      setBusy(true);
      try {
        await fn(sections, fileNamePrefix, {
          ...header,
          reportNo: await resolveReportMenuId(pathname),
        });
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
      <Button
        variant="outlined"
        size="small"
        disabled={disabled || empty || busy}
        onClick={() => download(exportGridSectionsToExcel)}
        sx={{ textTransform: "none" }}
      >
        Export to Excel
      </Button>
      <Button
        variant="outlined"
        size="small"
        disabled={disabled || empty || busy}
        onClick={() => download(exportGridSectionsToPdf)}
        sx={{ textTransform: "none" }}
      >
        Save as PDF
      </Button>
      <Button
        variant="outlined"
        size="small"
        disabled={disabled || empty}
        onClick={() => {
          const ok = printGridSections(
            { title, headerLines: printHeaderLines(header), landscape: true },
            sections,
          );
          if (!ok) window.alert("Please allow popups to print this report.");
        }}
        sx={{ textTransform: "none" }}
      >
        Print
      </Button>
    </Box>
  );
}
