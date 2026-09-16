"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert, Box } from "@mui/material";

const BALE_PRODUCTION_PATH = "/dashboardportal/juteProduction/baleProduction";

/**
 * Finishing › Bale Press now redirects to Bale Production (SPEC D4): bale press
 * output is entered per bale in exactly one place, and those saves maintain the
 * finishing balepress daily figure server-side.
 */
export default function BalePressPage() {
	const router = useRouter();
	React.useEffect(() => {
		router.replace(BALE_PRODUCTION_PATH);
	}, [router]);

	return (
		<Box sx={{ p: { xs: 1.5, md: 3 } }}>
			<Alert severity="info">Bale press output is now entered under Bale Production — redirecting…</Alert>
		</Box>
	);
}
