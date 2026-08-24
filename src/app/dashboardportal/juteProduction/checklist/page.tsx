"use client";

/**
 * Weaving Checklist — tabbed home for the checklist sheets.
 * "Loom" reuses the standalone Loom Checklist report body verbatim.
 */

import * as React from "react";
import { Box, CircularProgress, Tab, Tabs, Typography } from "@mui/material";
import LoomChecklistReport from "../report/loomChecklist/_components/LoomChecklistReport";
import WindingChecklistReport from "./_components/WindingChecklistReport";
import BeamingChecklistReport from "./_components/BeamingChecklistReport";
import FinishingChecklistReport from "./_components/FinishingChecklistReport";
import AttendanceChecklistReport from "./_components/AttendanceChecklistReport";

const TABS = [
  "Summary",
  "Loom",
  "Winding",
  "Winding (A)",
  "Beaming",
  "Finishing",
  "Attendance",
] as const;

/** Body per tab index (0 = Summary, handled inline). */
const BODIES: Record<number, () => React.ReactElement> = {
  1: () => <LoomChecklistReport />,
  2: () => <WindingChecklistReport direction="attendance" />,
  3: () => <WindingChecklistReport direction="production" />,
  4: () => <BeamingChecklistReport />,
  5: () => <FinishingChecklistReport />,
  6: () => <AttendanceChecklistReport />,
};

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
          mandatory — the report bodies read useSearchParams(). key={tab} forces a remount:
          Winding and Winding (A) are the same component, so without it React would keep the
          previous tab's loaded rows and only swap the prop. */}
      {BODIES[tab] ? (
        <React.Suspense
          key={tab}
          fallback={
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          }
        >
          {BODIES[tab]()}
        </React.Suspense>
      ) : null}
    </Box>
  );
}
