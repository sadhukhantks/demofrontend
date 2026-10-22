"use client";

import { Box } from "@mui/material";
import { ModuleMenuGrid } from "@/components/dashboard/ModuleMenuGrid";

/**
 * Jute Costing hub (ITM-019): the menu tiles of `juteCosting/*` — Cost
 * Parameters (master) and the Daily P&L / cost-per-tonne report. Same shell
 * as the Jute Production landing page; the tiles come from the menu tree.
 */
export default function Page() {
	return (
		<Box sx={{ p: { xs: 2, md: 3 } }}>
			<ModuleMenuGrid modulePath="/dashboardportal/juteCosting" />
		</Box>
	);
}
