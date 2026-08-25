"use client";

/**
 * Phone layout shell for the four maintenance-master list pages.
 *
 * The four list pages render their records twice: a DataGrid inside
 * `IndexWrapper` for `md` and up, and a stack of cards below `md`. MUI's DataGrid
 * does not reflow — at 360px it simply clips — so the card list is the readable
 * layout on a phone, and this shell carries everything the grid's chrome gives
 * the desktop user: title, search, filters, the create button and a pager.
 *
 * Which of the two layouts is visible is decided by CSS breakpoints alone
 * (`DESKTOP_ONLY_SX` / `MOBILE_ONLY_SX`), never by `useMediaQuery` or any other
 * JS width check: these pages hold their first render behind a `mounted` guard,
 * and a JS-driven layout would reintroduce exactly the server/client mismatch
 * that guard exists to prevent. Both trees render; CSS picks one.
 *
 * The shell owns no data. It is fed the same `rows`, `paginationModel` and
 * handlers the grid already uses, so the phone layout costs no extra fetch.
 */

import * as React from "react";
import { Box, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import type { GridPaginationModel } from "@mui/x-data-grid";
import { Edit, Eye } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSidebarContextSafe } from "@/components/dashboard/sidebarContext";
import { PAGE_PADDING_SX, TOUCH_ICON_BUTTON_SX } from "@/components/ui/responsiveEntry";

/** Debounce applied to the phone search box when a page does not pick one. */
const DEFAULT_SEARCH_DEBOUNCE_MS = 500;

/**
 * Portal action permissions for the current page.
 *
 * `IndexWrapper` resolves view / edit / create against `hasMenuAccess(pathname)`
 * before it draws the grid's action column and Create button. The phone layout
 * lives outside `IndexWrapper`, so it resolves them the same way here — a user
 * without edit permission must not get an edit button just because the screen
 * is narrow.
 */
export function useMasterMenuAccess(): {
	canView: boolean;
	canEdit: boolean;
	canCreate: boolean;
} {
	const sidebarContext = useSidebarContextSafe();
	const pathname = usePathname();
	const hasMenuAccess = sidebarContext?.hasMenuAccess;

	return React.useMemo(
		() => ({
			canView: hasMenuAccess ? hasMenuAccess(pathname, "view") : true,
			canEdit: hasMenuAccess ? hasMenuAccess(pathname, "edit") : true,
			canCreate: hasMenuAccess ? hasMenuAccess(pathname, "create") : true,
		}),
		[hasMenuAccess, pathname],
	);
}

export interface MasterCardActionProps<RowType> {
	/** The record this card shows. */
	row: RowType;
	/** Opens the master's dialog in edit mode. */
	onEdit: (row: RowType) => void;
	/** Opens the master's dialog read-only, when the user cannot edit. */
	onView: (row: RowType) => void;
}

/**
 * The edit (or view) button in a mobile card header.
 *
 * Mirrors the grid's action column: edit when the user may edit, otherwise the
 * eye, otherwise nothing at all. Sized to `TOUCH_ICON_BUTTON_SX` because it is
 * pressed with a thumb rather than clicked with a pointer.
 */
export function MasterCardAction<RowType>({ row, onEdit, onView }: MasterCardActionProps<RowType>) {
	const { canEdit, canView } = useMasterMenuAccess();

	if (canEdit) {
		return (
			<Tooltip title="Edit">
				<IconButton
					size="small"
					aria-label="Edit"
					onClick={() => onEdit(row)}
					sx={TOUCH_ICON_BUTTON_SX}
				>
					<Edit size={18} />
				</IconButton>
			</Tooltip>
		);
	}

	if (canView) {
		return (
			<Tooltip title="View">
				<IconButton
					size="small"
					aria-label="View"
					onClick={() => onView(row)}
					sx={TOUCH_ICON_BUTTON_SX}
				>
					<Eye size={18} />
				</IconButton>
			</Tooltip>
		);
	}

	return null;
}

export interface MasterMobileListProps {
	/** Same heading the grid shows, repeated because IndexWrapper is hidden here. */
	title: string;
	subtitle?: string;
	/** Bound to the page's `searchQuery`; typing is debounced before it reaches it. */
	search: {
		value: string;
		onChange: React.ChangeEventHandler<HTMLInputElement>;
		placeholder?: string;
		debounceDelayMs?: number;
	};
	/** The page's filter dropdowns — rendered full width, one per line. */
	filters?: React.ReactNode;
	createAction?: { label: string; onClick: () => void };
	loading: boolean;
	/** Rows on the current page — drives the empty message. */
	visibleCount: number;
	/** Total rows the server reports, for the pager. */
	rowCount: number;
	paginationModel: GridPaginationModel;
	onPaginationModelChange: (model: GridPaginationModel) => void;
	/** Shown when the current page has no rows. */
	emptyMessage: string;
	/** The `MobileCard`s themselves. */
	children: React.ReactNode;
}

/**
 * @component MasterMobileList
 * @description Phone-width chrome (title, search, filters, create, pager) around
 * a card list that replaces the DataGrid below `md`.
 * @example
 * <Box sx={MOBILE_ONLY_SX}>
 *   <MasterMobileList title="Component Master" search={...} loading={loading} ...>
 *     {rows.map((row) => <MobileCard key={row.id} header={...}>...</MobileCard>)}
 *   </MasterMobileList>
 * </Box>
 */
export function MasterMobileList({
	title,
	subtitle,
	search,
	filters,
	createAction,
	loading,
	visibleCount,
	rowCount,
	paginationModel,
	onPaginationModelChange,
	emptyMessage,
	children,
}: MasterMobileListProps) {
	const { canCreate } = useMasterMenuAccess();

	// Local mirror of the search box so each keystroke does not fire a request;
	// the grid's own search box debounces the same way.
	const [searchInput, setSearchInput] = React.useState(search.value);
	const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const onChangeRef = React.useRef(search.onChange);

	React.useEffect(() => {
		onChangeRef.current = search.onChange;
	}, [search.onChange]);

	// A filter change (or a reset elsewhere) rewrites the query — follow it.
	React.useEffect(() => {
		setSearchInput((prev) => (prev === search.value ? prev : search.value));
	}, [search.value]);

	React.useEffect(
		() => () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		},
		[],
	);

	const delay = search.debounceDelayMs ?? DEFAULT_SEARCH_DEBOUNCE_MS;

	const handleSearchInput = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const nextValue = event.target.value;
			setSearchInput(nextValue);

			if (debounceRef.current) clearTimeout(debounceRef.current);

			const emit = () => {
				onChangeRef.current({
					target: { value: nextValue } as EventTarget & HTMLInputElement,
					currentTarget: { value: nextValue } as EventTarget & HTMLInputElement,
				} as React.ChangeEvent<HTMLInputElement>);
			};

			if (delay === 0) {
				emit();
				return;
			}
			debounceRef.current = setTimeout(emit, delay);
		},
		[delay],
	);

	const { page, pageSize } = paginationModel;
	const firstOnPage = rowCount === 0 ? 0 : page * pageSize + 1;
	const lastOnPage = Math.min(rowCount, page * pageSize + visibleCount);
	const hasPrev = page > 0;
	const hasNext = lastOnPage < rowCount;

	return (
		<Box sx={PAGE_PADDING_SX}>
			<Stack spacing={2}>
				<Stack spacing={0.5}>
					<Typography variant="h6" component="h1" sx={{ fontWeight: 600 }}>
						{title}
					</Typography>
					{subtitle ? (
						<Typography variant="body2" color="text.secondary">
							{subtitle}
						</Typography>
					) : null}
				</Stack>

				{createAction && canCreate ? (
					<Button size="lg" className="w-full" onClick={createAction.onClick}>
						{createAction.label}
					</Button>
				) : null}

				<TextField
					size="small"
					fullWidth
					value={searchInput}
					onChange={handleSearchInput}
					placeholder={search.placeholder ?? "Search"}
					inputProps={{ "aria-label": search.placeholder ?? "Search" }}
				/>

				{filters ? (
					<Stack spacing={2} sx={{ "& .MuiFormControl-root": { width: "100%" } }}>
						{filters}
					</Stack>
				) : null}

				{loading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress />
					</Box>
				) : visibleCount === 0 ? (
					<Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
						{emptyMessage}
					</Typography>
				) : (
					<Stack spacing={1.5}>{children}</Stack>
				)}

				{rowCount > 0 ? (
					<Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
						<Button
							variant="outline"
							size="lg"
							disabled={!hasPrev || loading}
							onClick={() => onPaginationModelChange({ ...paginationModel, page: page - 1 })}
						>
							Previous
						</Button>
						<Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
							{firstOnPage}–{lastOnPage} of {rowCount}
						</Typography>
						<Button
							variant="outline"
							size="lg"
							disabled={!hasNext || loading}
							onClick={() => onPaginationModelChange({ ...paginationModel, page: page + 1 })}
						>
							Next
						</Button>
					</Stack>
				) : null}
			</Stack>
		</Box>
	);
}

export default MasterMobileList;
