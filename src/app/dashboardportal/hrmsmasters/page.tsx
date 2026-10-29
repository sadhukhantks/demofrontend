"use client";

import { Box } from "@mui/material";
import { ModuleDashboard } from "@/components/dashboard/ModuleDashboard";

export default function Page() {
	return (
		<Box sx={{ p: { xs: 2, md: 3 } }}>
			<ModuleDashboard modulePath="/dashboardportal/hrmsmasters" />
		</Box>
	);
}
