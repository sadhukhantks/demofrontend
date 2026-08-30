"use client";

import { Box } from "@mui/material";
import { ModuleMenuGrid } from "@/components/dashboard/ModuleMenuGrid";

export default function Page() {
	return (
		<Box sx={{ p: { xs: 2, md: 3 } }}>
			<ModuleMenuGrid modulePath="/dashboardportal/procurement" />
		</Box>
	);
}
