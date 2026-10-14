"use client";

import * as React from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import {
	ClipboardCheck as InspectIcon,
	Link2 as LinkIcon,
	Undo2 as UndoIcon,
	Unlink2 as UnlinkIcon,
} from "lucide-react";
import type { ActionCheck } from "@/components/juteProduction/baleStock/baleStockCalc";

export interface SelectionToolbarProps {
	count: number;
	inspect: ActionCheck;
	uninspect: ActionCheck;
	link: ActionCheck;
	unlink: ActionCheck;
	/** A mutation is running — every action disabled. */
	busy: boolean;
	onMarkInspected: () => void;
	onUndoInspection: () => void;
	onLinkInvoice: () => void;
	onUnlinkInvoice: () => void;
}

function ActionButton({
	label,
	icon,
	check,
	count,
	busy,
	onClick,
	variant = "outlined",
	color = "primary",
}: {
	label: string;
	icon: React.ReactNode;
	check: ActionCheck;
	count: number;
	busy: boolean;
	onClick: () => void;
	variant?: "outlined" | "contained";
	color?: "primary" | "warning";
}) {
	const disabled = busy || !check.ok;
	// A disabled button fires no events, so the tooltip needs a wrapper to hang on.
	return (
		<Tooltip title={disabled && count > 0 && check.reason ? check.reason : ""} arrow>
			<span>
				<Button
					variant={variant}
					color={color}
					startIcon={icon}
					onClick={onClick}
					disabled={disabled}
					sx={{ minHeight: 40 }}
				>
					{label}
				</Button>
			</span>
		</Tooltip>
	);
}

/**
 * Selection count plus the four bale actions. Each button is enabled only
 * when the whole selection qualifies (`canInspect` & co.); when it does not,
 * hovering the disabled button shows the first blocking reason. "Mark
 * despatched / Link to invoice" also accepts bales already despatched without
 * an invoice (they get linked), per `canLink`.
 */
export default function SelectionToolbar({
	count,
	inspect,
	uninspect,
	link,
	unlink,
	busy,
	onMarkInspected,
	onUndoInspection,
	onLinkInvoice,
	onUnlinkInvoice,
}: SelectionToolbarProps) {
	return (
		<Box
			sx={{
				display: "flex",
				gap: 1,
				flexWrap: "wrap",
				alignItems: "center",
				p: 1.5,
				borderRadius: 1,
				bgcolor: count > 0 ? "action.selected" : "action.hover",
			}}
		>
			<Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
				{count} selected
			</Typography>
			<ActionButton
				label="Mark inspected"
				icon={<InspectIcon size={16} />}
				check={inspect}
				count={count}
				busy={busy}
				onClick={onMarkInspected}
				variant="contained"
			/>
			<ActionButton
				label="Undo inspection"
				icon={<UndoIcon size={16} />}
				check={uninspect}
				count={count}
				busy={busy}
				onClick={onUndoInspection}
				color="warning"
			/>
			<ActionButton
				label="Mark despatched / Link to invoice"
				icon={<LinkIcon size={16} />}
				check={link}
				count={count}
				busy={busy}
				onClick={onLinkInvoice}
			/>
			<ActionButton
				label="Unlink invoice"
				icon={<UnlinkIcon size={16} />}
				check={unlink}
				count={count}
				busy={busy}
				onClick={onUnlinkInvoice}
				color="warning"
			/>
		</Box>
	);
}
