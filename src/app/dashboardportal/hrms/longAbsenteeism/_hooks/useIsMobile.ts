"use client";

import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

/**
 * Phone / portrait tablet (below `md`). The page body renders only after
 * mount (useMounted), so reading the media query on the client cannot cause
 * a hydration mismatch.
 */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
}
