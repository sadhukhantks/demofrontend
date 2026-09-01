"use client";

import { ModuleMenuGrid } from "@/components/dashboard/ModuleMenuGrid";

export default function Page() {
	return (
		<div className="p-6">
			<ModuleMenuGrid modulePath="/dashboardportal/masters" />
		</div>
	);
}
