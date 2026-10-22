"use client";

/**
 * Old address of Long Absenteeism. The page moved to the HRMS module
 * (owner 2026-10-12): /dashboardportal/hrms/longAbsenteeism. Bookmarks and
 * links to this path are sent there with their query string (tab, view,
 * case_id, branch_id) kept.
 */

import * as React from "react";
import { Suspense } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";

const LONG_ABSENTEEISM_PATH = "/dashboardportal/hrms/longAbsenteeism";

/** The new address with the same query string ("?a=1" or nothing). */
function longAbsenteeismHref(search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  return q ? `${LONG_ABSENTEEISM_PATH}?${q}` : LONG_ABSENTEEISM_PATH;
}

function Redirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  React.useEffect(() => {
    router.replace(longAbsenteeismHref(search));
  }, [router, search]);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, justifyContent: "center", py: 6 }}>
      <CircularProgress size={22} />
      <Typography variant="body2" color="text.secondary">
        Long Absenteeism has moved to HRMS — opening it…
      </Typography>
    </Box>
  );
}

export default function LongAbsenteeismMovedPage() {
  // useSearchParams() needs a Suspense boundary for `next build`.
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
