"use client";

import { ModuleDashboard } from "@/components/dashboard/ModuleDashboard";

export default function Page() {
	return (
		<div className="p-6">
			<ModuleDashboard modulePath="/dashboardportal/inventory" />
		</div>
	);
}
