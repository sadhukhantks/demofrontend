"use client";

/**
 * Weaving Checklist — tabbed home for the checklist sheets.
 * "Loom" reuses the standalone Loom Checklist report body verbatim.
 */

import * as React from "react";
import { Box, CircularProgress, Tab, Tabs, Typography } from "@mui/material";
import LoomChecklistReport from "../report/loomChecklist/_components/LoomChecklistReport";

const TABS = ["Summary", "Loom"] as const;

export default function ChecklistPage() {
  const [tab, setTab] = React.useState(0);

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: "divider", px: { xs: 1.5, md: 3 } }}
      >
        {TABS.map((label) => (
          <Tab key={label} label={label} sx={{ minHeight: 44 }} />
        ))}
      </Tabs>

      {tab === 0 ? (
        <Box sx={{ p: 3 }}>
          <Typography color="text.secondary">Coming soon.</Typography>
        </Box>
      ) : null}

      {/* Unmount (not display:none) — DataGrid measures its container, a hidden mount breaks it.
          Suspense sits inside the tab so the tab bar isn't replaced by the spinner; it is
          mandatory — LoomChecklistReport reads useSearchParams(). */}
      {tab === 1 ? (
        <React.Suspense
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          }
        >
          <LoomChecklistReport />
        </React.Suspense>
      ) : null}
    </Box>
  );
}
