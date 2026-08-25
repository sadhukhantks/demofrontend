"use client";

/**
 * Jute Mechanical & Maintenance — MASTERS HUB.
 *
 * The four maintenance masters sit at menu level 3, and the portal sidebar only
 * renders two levels, so they never appear in the sidebar tree. This hub is the
 * only navigation route to them: it is registered as the level-2 "Masters" page
 * of the module and links out to each master.
 */

import * as React from "react";
import Link from "next/link";
import { Box, Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import { AlertTriangle, ClipboardList, Cog, Puzzle } from "lucide-react";

/** One card on the hub. */
type MasterLink = {
	href: string;
	title: string;
	/** What the master controls, in the operator's words. */
	description: string;
	/** Why it matters downstream — the reason someone would open it. */
	impact: string;
	icon: React.ReactNode;
};

const ICON_SIZE = 22;

const MASTER_LINKS: readonly MasterLink[] = [
	{
		href: "/dashboardportal/juteMechanical/masters/reasonMaster",
		title: "Reason Master",
		description:
			"The breakdown reason codes (RF, BJ, DHGT …) that operators pick when logging an incident, each tied to a discipline and, optionally, a failure component.",
		impact:
			"Drives the reason pareto and the date × machine grid. Leave the machine type blank to make a code available on every machine.",
		icon: <AlertTriangle size={ICON_SIZE} />,
	},
	{
		href: "/dashboardportal/juteMechanical/masters/componentMaster",
		title: "Component Master",
		description:
			"The cross-section list of failure components — gear, chain, bearing, roller, motor — grouped by the kind of part they are.",
		impact:
			"Reason codes and breakdown entries point at these, so repeat-failure analysis groups incidents by the part that actually failed.",
		icon: <Puzzle size={ICON_SIZE} />,
	},
	{
		href: "/dashboardportal/juteMechanical/masters/machineAttribute",
		title: "Machine Attributes",
		description:
			"The maintenance record for each machine: make, model, serial, commissioning date, criticality, and the PM and overhaul intervals.",
		impact:
			"Setting an interval is what puts a machine on the maintenance-due report. Machines listed as Not configured are invisible to PM planning.",
		icon: <Cog size={ICON_SIZE} />,
	},
	{
		href: "/dashboardportal/juteMechanical/masters/pmSchedule",
		title: "PM Schedule",
		description:
			"The preventive-maintenance checklist template — one row per task, written either for a whole machine type or for a single machine.",
		impact:
			"Seeds the task grid on every PM execution, in seq. no. order, for the frequency being carried out.",
		icon: <ClipboardList size={ICON_SIZE} />,
	},
];

export default function JuteMechanicalMastersHubPage() {
	return (
		<Box sx={{ p: { xs: 2, md: 4 } }}>
			<Stack spacing={1} sx={{ mb: 3 }}>
				<Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
					Mechanical &amp; Maintenance Masters
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Reference data behind the breakdown log, preventive maintenance and overhaul
					register. These four masters sit below the two levels the sidebar renders, so
					this page is how you reach them.
				</Typography>
			</Stack>

			<Box
				sx={{
					display: "grid",
					gap: 2,
					gridTemplateColumns: {
						xs: "1fr",
						md: "repeat(2, minmax(0, 1fr))",
					},
				}}
			>
				{MASTER_LINKS.map((link) => (
					<Card
						key={link.href}
						variant="outlined"
						sx={{
							borderColor: "divider",
							bgcolor: "background.paper",
							height: "100%",
						}}
					>
						<CardActionArea
							component={Link}
							href={link.href}
							sx={{ height: "100%", p: 2.5, alignItems: "flex-start" }}
						>
							<Stack spacing={1.5} sx={{ height: "100%" }}>
								<Stack direction="row" spacing={1.5} alignItems="center">
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											width: 40,
											height: 40,
											borderRadius: 1.5,
											color: "primary.contrastText",
											bgcolor: "primary.main",
											flexShrink: 0,
										}}
									>
										{link.icon}
									</Box>
									<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
										{link.title}
									</Typography>
								</Stack>

								<Typography variant="body2" color="text.secondary">
									{link.description}
								</Typography>

								<Chip
									label={link.impact}
									size="small"
									variant="outlined"
									sx={{
										alignSelf: "flex-start",
										height: "auto",
										borderColor: "divider",
										color: "text.secondary",
										"& .MuiChip-label": {
											display: "block",
											whiteSpace: "normal",
											py: 0.75,
											lineHeight: 1.4,
										},
									}}
								/>
							</Stack>
						</CardActionArea>
					</Card>
				))}
			</Box>
		</Box>
	);
}
