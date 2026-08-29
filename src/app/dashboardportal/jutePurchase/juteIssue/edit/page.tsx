"use client";

import React, { useId, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  TextField,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  Radio,
  RadioGroup,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { Trash2, Plus, RefreshCw } from "lucide-react";
import { fetchWithCookie } from "@/utils/apiClient2";
import { apiRoutesPortalMasters } from "@/utils/api";
import useSelectedCompanyCoId from "@/hooks/use-selected-company-coid";
import { useBranchOptions } from "@/utils/branchUtils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

import type {
  JuteIssueMode,
  EditableLineItem,
  JuteIssueLineItem,
  JuteIssueSummary,
  StockOutstandingItem,
  Option,
} from "./types/juteIssueTypes";
import { useJuteIssueSetup } from "./hooks/useJuteIssueSetup";
import { useStockOutstanding } from "./hooks/useStockOutstanding";
import { useJuteIssueLineItems } from "./hooks/useJuteIssueLineItems";
import {
  mapApiLineItemsToEditable,
  mapJuteItemsToOptions,
  mapYarnTypesToOptions,
  mapBranchesToOptions,
  mapStockToOption,
  mapEditableToCreatePayload,
  describeStockOrigin,
  buildLabelMap,
  createLabelResolver,
  buildItemFilterOptions,
  createLineFromStock,
} from "./utils/juteIssueMappers";
import { JUTE_ISSUE_STATUS_IDS, JUTE_ISSUE_STATUS_LABELS } from "./utils/juteIssueConstants";
import { calculateIssueValue } from "./utils/juteIssueFactories";

/**
 * @component JuteIssueEditPage
 * @description Transaction page for viewing/editing/creating jute issues.
 * Shows available stock from MR and allows creating issue line items.
 */

const getStatusColor = (statusId: number): "success" | "error" | "warning" | "info" | "default" => {
  if (statusId === JUTE_ISSUE_STATUS_IDS.APPROVED) return "success";
  if (statusId === JUTE_ISSUE_STATUS_IDS.REJECTED) return "error";
  if (statusId === JUTE_ISSUE_STATUS_IDS.OPEN) return "warning";
  return "info"; // Draft
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const trimmed = value.trim();
  const ymdMatch = trimmed.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }
  return trimmed;
};

// ponytail: responsiveness is CSS-only (sx breakpoints), no useMediaQuery — the
// server and the first client render then emit the same tree, so nothing here
// can hydrate-mismatch, and the phone layout costs no extra JS on the floor.

// Both dialogs go edge-to-edge on a phone: a 32px margin on a 360px screen is
// a tenth of the usable width.
const MOBILE_FULL_BLEED_PAPER = {
  sx: {
    m: { xs: 0, sm: 4 },
    width: { xs: "100%", sm: "calc(100% - 64px)" },
    maxHeight: { xs: "100%", sm: "calc(100% - 64px)" },
    borderRadius: { xs: 0, sm: 1 },
  },
} as const;

// Thumb-sized buttons; on xs they split the row evenly instead of hugging text.
const DIALOG_ACTIONS_SX = {
  p: 2,
  gap: 1,
  "& .MuiButton-root": { flex: { xs: 1, sm: "none" }, minHeight: 44 },
} as const;

const DESKTOP_ONLY_SX = { display: { xs: "none", md: "block" }, overflowX: "auto" } as const;
const MOBILE_ONLY_SX = {
  display: { xs: "flex", md: "none" },
  flexDirection: "column",
  gap: 1.5,
} as const;

/** One label/value pair inside a mobile card. */
function CardStat({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <Box textAlign={align} minWidth={0}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

// Compact dd-mm-yy for the stock picker, where the row is already column-heavy.
const formatDateShort = (value?: string | null) => {
  if (!value) return "-";
  const ymd = value.trim().match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})/);
  if (!ymd) return value.trim();
  const [, year, month, day] = ymd;
  return `${day}-${month}-${year.slice(2)}`;
};

export default function JuteIssueEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      }
    >
      <JuteIssueEditPage />
    </Suspense>
  );
}

function JuteIssueEditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { coId } = useSelectedCompanyCoId();
  const sidebarBranches = useBranchOptions();

  // Parse URL params
  const modeParam = searchParams.get("mode") as JuteIssueMode | null;
  const dateParam = searchParams.get("date");
  const branchIdParam = searchParams.get("branch_id");

  const mode: JuteIssueMode = modeParam || "create";
  const isViewMode = mode === "view";
  const isCreateMode = mode === "create";

  // State
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>("");
  const [issueDate, setIssueDate] = React.useState<string>(
    dateParam || new Date().toISOString().slice(0, 10)
  );
  const [summary, setSummary] = React.useState<JuteIssueSummary | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Stock selection dialog state
  const [stockDialogOpen, setStockDialogOpen] = React.useState(false);
  const [filterItemId, setFilterItemId] = React.useState<Option | null>(null);
  const [filterItemName, setFilterItemName] = React.useState<Option | null>(null);
  const [selectedStockId, setSelectedStockId] = React.useState<string>("");

  // Add item dialog state (quantity/weight input after selecting stock)
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [selectedStock, setSelectedStock] = React.useState<StockOutstandingItem | null>(null);
  const [newYarnTypeId, setNewYarnTypeId] = React.useState<string>("");
  const [newQuantity, setNewQuantity] = React.useState<string>("");

  // Line item selection state (for bulk actions)
  const [selectedLineIds, setSelectedLineIds] = React.useState<Set<string>>(new Set());

  // Refetch counter - increment to trigger data reload
  const [refreshCounter, setRefreshCounter] = React.useState(0);

  // Selection handlers for checkbox column
  const handleToggleLineSelection = React.useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }, []);

  // Calculate weight per unit from selected stock (actual_weight / actual_qty)
  const wtPerUnit = React.useMemo(() => {
    if (!selectedStock || !selectedStock.actual_qty) return 0;
    return selectedStock.actual_weight / selectedStock.actual_qty;
  }, [selectedStock]);

  // Setup data
  const { juteGroups, yarnTypes, branches, loading: setupLoading, error: setupError } = useJuteIssueSetup({
    coId,
  });

  // Line items management - must be before stockItems filter that uses lineItems
  const {
    lineItems,
    removeLineItem,
    replaceItems,
    calculateTotals,
  } = useJuteIssueLineItems({ mode });

  // Stock data - fetch when branch is selected (filtered client-side by jute type/item)
  const { stockItems: allStockItems, loading: stockLoading, refetch: refetchStock } = useStockOutstanding({
    coId,
    branchId: selectedBranchId,
    itemId: undefined, // Fetch all, filter client-side
    issueDate, // Filter stock by issue date
  });

  // Calculate how much of each stock has already been entered in draft items.
  // Keyed on stock_key, NOT jute_mr_li_id: waste lines have no MR line, so
  // keying on it would collapse every waste draft into one bucket and net them
  // against each other's balances.
  //
  // Only UNSAVED lines count here: the stock view already subtracts every saved
  // issue (status <> 4), so netting a saved draft again would subtract it twice.
  const draftQuantityByStockKey = React.useMemo(() => {
    const draftItems = lineItems.filter((l) => !l.jute_issue_id);

    const map = new Map<string, number>();
    draftItems.forEach((item) => {
      const key = item.stock_key;
      const currentQty = map.get(key) || 0;
      const qty = Number(item.quantity) || 0;
      map.set(key, currentQty + qty);
    });
    return map;
  }, [lineItems]);

  // Get adjusted balqty for display (API balqty - already entered in drafts)
  const getAdjustedBalQty = React.useCallback(
    (stock: StockOutstandingItem): number => {
      const draftQty = draftQuantityByStockKey.get(stock.stock_key) || 0;
      const adjusted = stock.balqty - draftQty;
      return Math.max(0, adjusted); // Don't show negative values
    },
    [draftQuantityByStockKey]
  );

  // Get adjusted weight for display
  const getAdjustedBalWeight = React.useCallback(
    (stock: StockOutstandingItem): number => {
      const draftQty = draftQuantityByStockKey.get(stock.stock_key) || 0;
      if (stock.actual_qty === 0) return stock.balweight;
      const wtPerUnit = stock.actual_weight / stock.actual_qty;
      const adjusted = stock.balweight - draftQty * wtPerUnit;
      return Math.max(0, adjusted); // Don't show negative values
    },
    [draftQuantityByStockKey]
  );

  // Filter stock items by selected jute type and item, and drop anything with
  // nothing left to issue.
  //
  // The backend already excludes lines whose stored balance rounds to zero, but
  // it cannot see the DRAFT lines sitting unsaved on this page — draft a line's
  // whole balance and the row stayed in the picker showing "0.00". Judge on the
  // same rounded, draft-netted number the row prints, so the list only ever
  // offers stock the operator can actually draw.
  const stockItems = React.useMemo(() => {
    let filtered = allStockItems.filter((s) => getAdjustedBalQty(s).toFixed(2) !== "0.00");
    if (filterItemId) {
      filtered = filtered.filter((s) => String(s.item_grp_id) === filterItemId.value);
    }
    if (filterItemName) {
      filtered = filtered.filter((s) => String(s.item_id) === filterItemName.value);
    }
    return filtered;
  }, [allStockItems, filterItemId, filterItemName, getAdjustedBalQty]);

  // Auto-calculate weight based on quantity * wt_per_unit
  // When issuing the full remaining balance, use bal_weight directly to absorb rounding differences
  const calculatedWeight = React.useMemo(() => {
    const qty = Number(newQuantity) || 0;
    if (qty <= 0 || !selectedStock) return 0;

    const adjustedBalQty = getAdjustedBalQty(selectedStock);
    // If issuing the entire remaining balance, use bal_weight directly
    // This absorbs any 1-2 kg rounding difference from MR weight distribution
    if (qty >= adjustedBalQty && adjustedBalQty > 0) {
      return getAdjustedBalWeight(selectedStock);
    }

    return qty * wtPerUnit;
  }, [newQuantity, wtPerUnit, selectedStock, getAdjustedBalQty, getAdjustedBalWeight]);

  // Max weight based on balance quantity (adjusted for drafts)
  const maxWeight = React.useMemo(() => {
    if (!selectedStock) return 0;
    const adjustedBalQty = getAdjustedBalQty(selectedStock);
    return adjustedBalQty * wtPerUnit;
  }, [selectedStock, wtPerUnit, getAdjustedBalQty]);

  // Quantity validation - check if entered quantity exceeds available balance (adjusted for drafts)
  const quantityExceedsBalance = React.useMemo(() => {
    const qty = Number(newQuantity) || 0;
    if (!selectedStock) return false;
    const adjustedBalQty = getAdjustedBalQty(selectedStock);
    return qty > adjustedBalQty;
  }, [newQuantity, selectedStock, getAdjustedBalQty]);

  // Item filter options cascade from the selected jute type (group).
  const itemNameOptions = React.useMemo(
    () => buildItemFilterOptions(allStockItems, filterItemId?.value),
    [allStockItems, filterItemId]
  );

  // Get selectable lines (saved items that are not draft - i.e., Open status for approve/reject)
  const selectableOpenLines = React.useMemo(
    () => lineItems.filter((l) => l.jute_issue_id && l.status_id === JUTE_ISSUE_STATUS_IDS.OPEN),
    [lineItems]
  );

  // Get selectable draft lines (for Open action)
  const selectableDraftLines = React.useMemo(
    () => lineItems.filter((l) => l.jute_issue_id && l.status_id === JUTE_ISSUE_STATUS_IDS.DRAFT),
    [lineItems]
  );

  const handleSelectAllOpen = React.useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedLineIds(new Set(selectableOpenLines.map((l) => l.id)));
      } else {
        setSelectedLineIds(new Set());
      }
    },
    [selectableOpenLines]
  );

  const handleSelectAllDraft = React.useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedLineIds(new Set(selectableDraftLines.map((l) => l.id)));
      } else {
        setSelectedLineIds(new Set());
      }
    },
    [selectableDraftLines]
  );

  // Memoized options
  const juteItemOptions = React.useMemo(() => mapJuteItemsToOptions(juteGroups), [juteGroups]);
  const yarnTypeOptions = React.useMemo(() => mapYarnTypesToOptions(yarnTypes), [yarnTypes]);
  const branchOptions = React.useMemo(() => {
    // If sidebar has only one branch selected, use it
    if (sidebarBranches.length === 1) {
      return sidebarBranches;
    }
    // Otherwise use branches from setup
    return mapBranchesToOptions(branches);
  }, [sidebarBranches, branches]);

  const selectedBranchOption = React.useMemo(
    () => branchOptions.find((opt) => opt.value === selectedBranchId) ?? null,
    [branchOptions, selectedBranchId]
  );

  const stockOptions = React.useMemo(
    () => stockItems.map(mapStockToOption),
    [stockItems]
  );

  // Label resolvers
  const yarnTypeLabelMap = React.useMemo(
    () => buildLabelMap(yarnTypes, (t) => String(t.jute_yarn_type_id), (t) => t.jute_yarn_type_name),
    [yarnTypes]
  );
  const getYarnTypeLabel = React.useMemo(() => createLabelResolver(yarnTypeLabelMap), [yarnTypeLabelMap]);

  const juteItemLabelMap = React.useMemo(
    () => buildLabelMap(juteGroups, (i) => String(i.item_grp_id), (i) => i.item_grp_desc),
    [juteGroups]
  );
  const getJuteItemLabel = React.useMemo(() => createLabelResolver(juteItemLabelMap), [juteItemLabelMap]);

  // Auto-select branch if only one is available
  React.useEffect(() => {
    if (!selectedBranchId && sidebarBranches.length === 1) {
      setSelectedBranchId(sidebarBranches[0].value);
    } else if (!selectedBranchId && branchIdParam) {
      setSelectedBranchId(branchIdParam);
    }
  }, [selectedBranchId, sidebarBranches, branchIdParam]);

  // Fetch max date and set default date to max+1 for create mode
  React.useEffect(() => {
    if (!isCreateMode || !coId || !selectedBranchId || dateParam) return;

    const fetchMaxDate = async () => {
      try {
        const params = new URLSearchParams({
          co_id: coId,
          branch_id: selectedBranchId,
        });
        const url = `${apiRoutesPortalMasters.JUTE_ISSUE_MAX_DATE}?${params.toString()}`;
        const { data, error: fetchError } = await fetchWithCookie(url, "GET");

        if (fetchError) {
          console.warn("Failed to fetch max date:", fetchError);
          return;
        }

        const response = data as { max_date: string | null };
        if (response.max_date) {
          // Set date to max_date + 1 day
          const maxDate = new Date(response.max_date);
          maxDate.setDate(maxDate.getDate() + 1);
          setIssueDate(maxDate.toISOString().slice(0, 10));
        }
        // If no max_date, keep the current date (today)
      } catch (err) {
        console.warn("Error fetching max date:", err);
      }
    };

    fetchMaxDate();
  }, [isCreateMode, coId, selectedBranchId, dateParam]);

  // Load existing issues for any mode when date/branch changes
  React.useEffect(() => {
    if (!coId || !selectedBranchId || !issueDate) return;

    const fetchIssues = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          co_id: coId,
          branch_id: selectedBranchId,
          issue_date: issueDate,
        });
        const url = `${apiRoutesPortalMasters.JUTE_ISSUES_BY_DATE}?${params.toString()}`;
        const { data, error: fetchError } = await fetchWithCookie(url, "GET");

        if (fetchError) {
          throw new Error(fetchError);
        }

        const response = data as {
          data: JuteIssueLineItem[];
          summary: JuteIssueSummary;
        };

        const mapped = mapApiLineItemsToEditable(response.data || []);
        replaceItems(mapped);
        setSummary(response.summary || null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load issues";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchIssues();
  }, [coId, selectedBranchId, issueDate, replaceItems, refreshCounter]);

  // Handle stock selection dialog
  const handleOpenStockDialog = () => {
    setFilterItemId(null);
    setFilterItemName(null);
    setSelectedStockId("");
    refetchStock();
    setStockDialogOpen(true);
  };

  const handleCloseStockDialog = () => {
    setStockDialogOpen(false);
  };

  const handleStockRadioChange = (stockId: string) => {
    setSelectedStockId(stockId);
  };

  const handleConfirmStockSelection = () => {
    const stock = stockItems.find((s) => s.stock_key === selectedStockId);
    if (stock) {
      setSelectedStock(stock);
      setNewYarnTypeId("");
      setNewQuantity(String(stock.balqty || 0)); // Pre-fill with available balance qty
      // Weight is auto-calculated based on quantity * wt_per_unit
      setStockDialogOpen(false);
      setAddDialogOpen(true);
    }
  };

  // Handle add item dialog (quantity/weight input)
  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setSelectedStock(null);
  };

  // Each entry saves to the backend the moment "Save" is pressed in the dialog.
  // The old flow parked entries unsaved in React state until a separate Save
  // button looped one POST per line and aborted on the first failure — every
  // line after the failing one was silently lost (and any date/branch change
  // wiped the unsaved drafts). The create endpoint is per-line anyway, so
  // there is nothing to batch.
  const handleAddItem = async () => {
    if (!selectedStock || !newYarnTypeId) return;

    const quantity = Number(newQuantity) || 0;
    const weight = calculatedWeight; // Use auto-calculated weight

    if (quantity <= 0 || weight <= 0) {
      setError("Quantity and weight must be greater than 0");
      return;
    }

    if (quantity > getAdjustedBalQty(selectedStock)) {
      setError("Cannot issue more than available balance quantity");
      return;
    }

    if (!coId || !selectedBranchId || !issueDate) {
      setError("Please select branch and date");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const line = createLineFromStock(selectedStock, newYarnTypeId, quantity, weight);
      const payload = mapEditableToCreatePayload(line, Number(selectedBranchId), issueDate);
      const url = `${apiRoutesPortalMasters.JUTE_ISSUE_CREATE}?co_id=${coId}`;
      const { error: createError } = await fetchWithCookie(url, "POST", payload);

      if (createError) {
        throw new Error(createError);
      }

      setSuccessMessage("Issue line saved");
      handleCloseAddDialog();
      // Reload saved lines and stock balances from the server (source of truth)
      setRefreshCounter((c) => c + 1);
      refetchStock();
    } catch (err) {
      // Keep the dialog open so the entry is not lost — the error shows inside
      // the dialog and the operator can correct and retry.
      setError(err instanceof Error ? err.message : "Failed to save issue line");
    } finally {
      setSaving(false);
    }
  };

  // Handle delete line item
  const handleDeleteLine = async (line: EditableLineItem) => {
    if (isViewMode) return;

    if (line.jute_issue_id) {
      // Delete from backend
      try {
        const url = `${apiRoutesPortalMasters.JUTE_ISSUE_DELETE}/${line.jute_issue_id}?co_id=${coId}`;
        const { error: deleteError } = await fetchWithCookie(url, "DELETE");
        if (deleteError) {
          throw new Error(deleteError);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete";
        setError(message);
        return;
      }
    }

    removeLineItem(line.id);
    refetchStock();
  };

  // Handle approval actions
  const handleOpen = async () => {
    if (!coId) return;

    // Get selected draft items, or if none selected, use all draft items
    const selectedDraftItems = lineItems.filter(
      (l) => l.jute_issue_id && l.status_id === JUTE_ISSUE_STATUS_IDS.DRAFT &&
        (selectedLineIds.size === 0 || selectedLineIds.has(l.id))
    );

    if (selectedDraftItems.length === 0) {
      setError("No draft items to open");
      return;
    }

    const issueIds = selectedDraftItems.map((l) => l.jute_issue_id).filter(Boolean) as number[];

    setSaving(true);
    try {
      const url = `${apiRoutesPortalMasters.JUTE_ISSUE_OPEN}?co_id=${coId}`;
      const { error: openError } = await fetchWithCookie(url, "POST", {
        issue_ids: issueIds,
        status_id: 1,
      });

      if (openError) throw new Error(openError);
      setSuccessMessage(`${issueIds.length} issue(s) opened for approval`);
      setSelectedLineIds(new Set());
      // Trigger refetch to reflect status changes
      setRefreshCounter((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open issues");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!coId) return;

    // Get selected open items, or if none selected, use all open items
    const selectedOpenItems = lineItems.filter(
      (l) => l.jute_issue_id && l.status_id === JUTE_ISSUE_STATUS_IDS.OPEN &&
        (selectedLineIds.size === 0 || selectedLineIds.has(l.id))
    );

    if (selectedOpenItems.length === 0) {
      setError("No open items to approve");
      return;
    }

    const issueIds = selectedOpenItems.map((l) => l.jute_issue_id).filter(Boolean) as number[];

    setSaving(true);
    try {
      const url = `${apiRoutesPortalMasters.JUTE_ISSUE_APPROVE}?co_id=${coId}`;
      const { error: approveError } = await fetchWithCookie(url, "POST", {
        issue_ids: issueIds,
        status_id: 3,
      });

      if (approveError) throw new Error(approveError);
      setSuccessMessage(`${issueIds.length} issue(s) approved`);
      setSelectedLineIds(new Set());
      // Trigger refetch to reflect status changes
      setRefreshCounter((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve issues");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!coId) return;

    // Get selected open items, or if none selected, use all open items
    const selectedOpenItems = lineItems.filter(
      (l) => l.jute_issue_id && l.status_id === JUTE_ISSUE_STATUS_IDS.OPEN &&
        (selectedLineIds.size === 0 || selectedLineIds.has(l.id))
    );

    if (selectedOpenItems.length === 0) {
      setError("No open items to reject");
      return;
    }

    const issueIds = selectedOpenItems.map((l) => l.jute_issue_id).filter(Boolean) as number[];

    setSaving(true);
    try {
      const url = `${apiRoutesPortalMasters.JUTE_ISSUE_REJECT}?co_id=${coId}`;
      const { error: rejectError } = await fetchWithCookie(url, "POST", {
        issue_ids: issueIds,
        status_id: 4,
      });

      if (rejectError) throw new Error(rejectError);
      setSuccessMessage(`${issueIds.length} issue(s) rejected`);
      setSelectedLineIds(new Set());
      // Trigger refetch to reflect status changes
      setRefreshCounter((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject issues");
    } finally {
      setSaving(false);
    }
  };

  // Calculate totals
  const totals = calculateTotals();

  // Loading state
  if (setupLoading || loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  const statusId = summary?.status_id || JUTE_ISSUE_STATUS_IDS.DRAFT;
  // Allow adding items in create mode OR edit mode (not view mode)
  const canAddItems = !isViewMode;
  const canEdit = !isViewMode && selectableDraftLines.length > 0;
  // Show Open button if there are any draft items that can be opened
  const canOpen = selectableDraftLines.length > 0;
  // Show Approve/Reject buttons if there are any open items that can be approved
  const canApprove = selectableOpenLines.length > 0;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, pb: { xs: 10, md: 3 } }}>
      {/* Header */}
      <Box
        display="flex"
        flexDirection={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        gap={{ xs: 1.5, sm: 2 }}
        mb={{ xs: 2, md: 3 }}
      >
        <Box minWidth={0}>
          <Typography variant="h5" fontWeight={600} sx={{ fontSize: { xs: "1.25rem", md: "1.5rem" } }}>
            {isCreateMode ? "Create Jute Issue" : isViewMode ? "View Jute Issue" : "Edit Jute Issue"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isCreateMode
              ? "Issue jute stock to production"
              : `Issue for ${formatDate(issueDate)}`}
          </Typography>
        </Box>
        <Box display="flex" gap={2} alignItems="center" flexShrink={0}>
          {summary && (
            <Chip
              label={summary.status || "Draft"}
              color={getStatusColor(statusId)}
              size="medium"
            />
          )}
          <Button
            variant="outlined"
            onClick={() => router.push("/dashboardportal/jutePurchase/juteIssue")}
            sx={{ ml: "auto", minHeight: 44 }}
          >
            Back to List
          </Button>
        </Box>
      </Box>

      {/* Errors and Success */}
      {(error || setupError) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error || setupError}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Header Form */}
      <Paper sx={{ p: { xs: 2, md: 3 }, mb: { xs: 2, md: 3 } }}>
        <Box
          display="flex"
          gap={{ xs: 2, md: 3 }}
          flexWrap="wrap"
          sx={{ "& > *": { flex: { xs: "1 1 100%", sm: "0 1 auto" } } }}
        >
          {/* Branch Selection */}
          {sidebarBranches.length === 1 ? (
            <TextField
              id="jute-issue-branch-readonly"
              label="Branch"
              value={sidebarBranches[0].label}
              disabled
              sx={{ minWidth: { sm: 200 } }}
            />
          ) : (
            <SearchableSelect<Option>
              variant="outlined"
              size="medium"
              label="Branch"
              className="min-w-50"
              fullWidth={false}
              clearable={false}
              disabled={!isCreateMode}
              options={branchOptions}
              value={selectedBranchOption}
              onChange={(option) => setSelectedBranchId(option?.value ?? "")}
              getOptionLabel={(option) => option.label}
              getOptionKey={(option) => option.value}
              isOptionEqualToValue={(option, selected) => option.value === selected.value}
            />
          )}

          {/* Date */}
          <TextField
            id="jute-issue-date"
            label="Issue Date"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            disabled={!isCreateMode}
            sx={{ minWidth: { sm: 200 } }}
            InputLabelProps={{ shrink: true }}
          />

          {/* Add Stock Button */}
          {canAddItems && selectedBranchId && (
            <Button
              variant="contained"
              startIcon={<Plus size={18} />}
              onClick={handleOpenStockDialog}
              disabled={stockLoading}
              sx={{ minHeight: 48 }}
            >
              Add from Stock
            </Button>
          )}
        </Box>
      </Paper>

      {/* Issue Line Items */}
      <Paper sx={{ p: { xs: 2, md: 3 }, mb: { xs: 2, md: 3 } }}>
        <Typography variant="h6" mb={2}>
          Issue Items
        </Typography>

        {lineItems.length === 0 ? (
          <Typography color="text.secondary">No issue items added yet</Typography>
        ) : (
          <Box sx={DESKTOP_ONLY_SX}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {/* Checkbox column - only show if there are selectable items */}
                {(selectableDraftLines.length > 0 || selectableOpenLines.length > 0) && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={
                        selectedLineIds.size > 0 &&
                        (selectableDraftLines.every((l) => selectedLineIds.has(l.id)) ||
                          selectableOpenLines.every((l) => selectedLineIds.has(l.id)))
                      }
                      indeterminate={
                        selectedLineIds.size > 0 &&
                        !selectableDraftLines.every((l) => selectedLineIds.has(l.id)) &&
                        !selectableOpenLines.every((l) => selectedLineIds.has(l.id))
                      }
                      onChange={(e) => {
                        // If we have draft lines pending, select those; otherwise select open lines
                        if (selectableDraftLines.length > 0) {
                          handleSelectAllDraft(e.target.checked);
                        } else {
                          handleSelectAllOpen(e.target.checked);
                        }
                      }}
                    />
                  </TableCell>
                )}
                <TableCell>Status</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Yarn Type</TableCell>
                <TableCell>Gate Entry / Dept</TableCell>
                <TableCell>Unit</TableCell>
                <TableCell>Jute Type</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Bale/Drum</TableCell>
                <TableCell align="right">Weight (kg)</TableCell>
                <TableCell align="right">Rate/Qtl</TableCell>
                <TableCell align="right">Issue Value</TableCell>
                {canEdit && <TableCell align="center">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {lineItems.map((line) => {
                const lineStatusId = line.status_id ?? JUTE_ISSUE_STATUS_IDS.DRAFT;
                const isSelectable = line.jute_issue_id && 
                  (lineStatusId === JUTE_ISSUE_STATUS_IDS.DRAFT || lineStatusId === JUTE_ISSUE_STATUS_IDS.OPEN);
                return (
                  <TableRow key={line.id}>
                    {/* Checkbox cell */}
                    {(selectableDraftLines.length > 0 || selectableOpenLines.length > 0) && (
                      <TableCell padding="checkbox">
                        {isSelectable ? (
                          <Checkbox
                            size="small"
                            checked={selectedLineIds.has(line.id)}
                            onChange={() => handleToggleLineSelection(line.id)}
                          />
                        ) : null}
                      </TableCell>
                    )}
                    {/* Status chip */}
                    <TableCell>
                      <Chip
                        label={JUTE_ISSUE_STATUS_LABELS[lineStatusId] || "Unknown"}
                        size="small"
                        color={getStatusColor(lineStatusId)}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={line.source === "WASTE" ? "Waste" : "MR"}
                        size="small"
                        color={line.source === "WASTE" ? "secondary" : "default"}
                        variant={line.source === "WASTE" ? "filled" : "outlined"}
                      />
                    </TableCell>
                    <TableCell>{getYarnTypeLabel(line.yarn_type_id)}</TableCell>
                    <TableCell>
                      {line.source === "WASTE"
                        ? line.dept_name || "-"
                        : line.gate_entry_num ?? line.jute_gate_entry_no ?? "-"}
                    </TableCell>
                    <TableCell>{line.unit_conversion}</TableCell>
                    <TableCell>{line.jute_group_name || getJuteItemLabel(line.item_grp_id)}</TableCell>
                    <TableCell>{line.item_name || "-"}</TableCell>
                    <TableCell align="right">{Number(line.quantity).toFixed(2)}</TableCell>
                    <TableCell align="right">{Number(line.weight).toFixed(2)}</TableCell>
                    <TableCell align="right">{line.actual_rate?.toFixed(2)}</TableCell>
                    <TableCell align="right">{line.issue_value?.toFixed(2)}</TableCell>
                    {canEdit && (
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteLine(line)}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </Box>
        )}

        {/* Mobile: the same lines as cards — a 13-column table on a phone is
            a horizontal scroll nobody reads on the floor. */}
        {lineItems.length > 0 && (
          <Box sx={MOBILE_ONLY_SX}>
            {lineItems.map((line) => {
              const lineStatusId = line.status_id ?? JUTE_ISSUE_STATUS_IDS.DRAFT;
              const isSelectable =
                line.jute_issue_id &&
                (lineStatusId === JUTE_ISSUE_STATUS_IDS.DRAFT ||
                  lineStatusId === JUTE_ISSUE_STATUS_IDS.OPEN);
              return (
                <Paper key={line.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    {isSelectable && (
                      <Checkbox
                        checked={selectedLineIds.has(line.id)}
                        onChange={() => handleToggleLineSelection(line.id)}
                        sx={{ p: 1 }}
                      />
                    )}
                    <Chip
                      label={JUTE_ISSUE_STATUS_LABELS[lineStatusId] || "Unknown"}
                      size="small"
                      color={getStatusColor(lineStatusId)}
                    />
                    <Chip
                      label={line.source === "WASTE" ? "Waste" : "MR"}
                      size="small"
                      color={line.source === "WASTE" ? "secondary" : "default"}
                      variant={line.source === "WASTE" ? "filled" : "outlined"}
                    />
                    {canEdit && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteLine(line)}
                        sx={{ ml: "auto" }}
                      >
                        <Trash2 size={18} />
                      </IconButton>
                    )}
                  </Box>

                  <Typography variant="subtitle2" fontWeight={700}>
                    {line.item_name || "-"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {line.jute_group_name || getJuteItemLabel(line.item_grp_id)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    {getYarnTypeLabel(line.yarn_type_id)} ·{" "}
                    {line.source === "WASTE"
                      ? line.dept_name || "-"
                      : line.gate_entry_num ?? line.jute_gate_entry_no ?? "-"}
                  </Typography>

                  <Box
                    display="grid"
                    gridTemplateColumns="repeat(2, minmax(0, 1fr))"
                    rowGap={1}
                    columnGap={2}
                  >
                    <CardStat
                      label={`Qty (${line.unit_conversion || "-"})`}
                      value={Number(line.quantity).toFixed(2)}
                    />
                    <CardStat
                      label="Weight (kg)"
                      value={Number(line.weight).toFixed(2)}
                      align="right"
                    />
                    <CardStat label="Rate/Qtl" value={line.actual_rate?.toFixed(2) ?? "-"} />
                    <CardStat
                      label="Issue Value"
                      value={`₹ ${line.issue_value?.toFixed(2) ?? "0.00"}`}
                      align="right"
                    />
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* Totals */}
        <Box
          display="flex"
          flexWrap="wrap"
          justifyContent={{ xs: "space-between", sm: "flex-end" }}
          mt={3}
          gap={{ xs: 2, sm: 4 }}
        >
          <Box textAlign={{ xs: "left", sm: "right" }}>
            <Typography variant="body2" color="text.secondary">
              Total Issue Weight
            </Typography>
            <Typography variant="h6">{totals.totalWeight.toFixed(2)} kg</Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="body2" color="text.secondary">
              Average Rate
            </Typography>
            <Typography variant="h6">
              {totals.totalWeight > 0
                ? ((totals.totalValue / totals.totalWeight) * 100).toFixed(2)
                : "0.00"}{" "}
              /Qtl
            </Typography>
          </Box>
          <Box textAlign="right" sx={{ flexBasis: { xs: "100%", sm: "auto" } }}>
            <Typography variant="body2" color="text.secondary">
              Total Issue Value
            </Typography>
            <Typography variant="h6">₹ {totals.totalValue.toFixed(2)}</Typography>
          </Box>
        </Box>
      </Paper>

      {/* Action Buttons — pinned to the bottom of the viewport on a phone so the
          operator never has to scroll past a long item list to save. */}
      <Box
        display="flex"
        flexWrap="wrap"
        justifyContent={{ xs: "stretch", sm: "flex-end" }}
        gap={{ xs: 1, sm: 2 }}
        alignItems="center"
        sx={{
          position: { xs: "sticky", md: "static" },
          bottom: 0,
          zIndex: 2,
          bgcolor: { xs: "background.paper", md: "transparent" },
          mx: { xs: -1.5, md: 0 },
          px: { xs: 1.5, md: 0 },
          py: { xs: 1.5, md: 0 },
          borderTop: { xs: 1, md: 0 },
          borderColor: "divider",
          "& .MuiButton-root": { flex: { xs: "1 1 45%", sm: "0 0 auto" }, minHeight: 48 },
        }}
      >
        {/* Selection indicator */}
        {selectedLineIds.size > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ flexBasis: { xs: "100%", sm: "auto" } }}>
            {selectedLineIds.size} item(s) selected
          </Typography>
        )}
        {canOpen && (
          <Button
            variant="contained"
            color="warning"
            onClick={handleOpen}
            disabled={saving}
          >
            {selectedLineIds.size > 0 && selectableDraftLines.some((l) => selectedLineIds.has(l.id))
              ? `Open Selected (${selectableDraftLines.filter((l) => selectedLineIds.has(l.id)).length})`
              : `Open All (${selectableDraftLines.length})`}
          </Button>
        )}
        {canApprove && (
          <>
            <Button
              variant="contained"
              color="success"
              onClick={handleApprove}
              disabled={saving}
            >
              {selectedLineIds.size > 0 && selectableOpenLines.some((l) => selectedLineIds.has(l.id))
                ? `Approve Selected (${selectableOpenLines.filter((l) => selectedLineIds.has(l.id)).length})`
                : `Approve All (${selectableOpenLines.length})`}
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleReject}
              disabled={saving}
            >
              {selectedLineIds.size > 0 && selectableOpenLines.some((l) => selectedLineIds.has(l.id))
                ? `Reject Selected (${selectableOpenLines.filter((l) => selectedLineIds.has(l.id)).length})`
                : `Reject All (${selectableOpenLines.length})`}
            </Button>
          </>
        )}
      </Box>

      {/* Stock Selection Dialog */}
      <Dialog
        open={stockDialogOpen}
        onClose={handleCloseStockDialog}
        maxWidth="xl"
        fullWidth
        PaperProps={MOBILE_FULL_BLEED_PAPER}
      >
        <DialogTitle>Select Stock to Issue</DialogTitle>
        <DialogContent sx={{ px: { xs: 1.5, sm: 3 } }}>
          <Box display="flex" flexDirection="column" gap={{ xs: 2, sm: 3 }} pt={2}>
            {/* Filters Row */}
            <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
              <Autocomplete
                id="stock-filter-jute-type"
                options={juteItemOptions}
                value={filterItemId}
                onChange={(_, value) => {
                  setFilterItemId(value);
                  setFilterItemName(null); // item list changes with the group
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Filter by Jute Type" size="small" />
                )}
                isOptionEqualToValue={(opt, val) => opt.value === val.value}
                sx={{ minWidth: { xs: "calc(100% - 56px)", sm: 220 }, flex: 1 }}
              />
              <Autocomplete
                id="stock-filter-item"
                options={itemNameOptions}
                value={filterItemName}
                onChange={(_, value) => setFilterItemName(value)}
                renderInput={(params) => (
                  <TextField {...params} label="Filter by Item" size="small" />
                )}
                isOptionEqualToValue={(opt, val) => opt.value === val.value}
                sx={{ minWidth: { xs: "calc(100% - 56px)", sm: 220 }, flex: 1 }}
              />
              <IconButton onClick={refetchStock} disabled={stockLoading}>
                <RefreshCw size={18} />
              </IconButton>
            </Box>

            {/* Stock Table with Radio Selection */}
            {stockLoading ? (
              <Box display="flex" justifyContent="center" py={4}>
                <CircularProgress size={32} />
              </Box>
            ) : stockItems.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" py={4}>
                No available stock for selected filters
              </Typography>
            ) : (
              <RadioGroup value={selectedStockId} onChange={(e) => handleStockRadioChange(e.target.value)}>
                <Box sx={DESKTOP_ONLY_SX}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Gate Entry No</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>GE Date</TableCell>
                      <TableCell sx={{ width: 90 }}>Vehicle No</TableCell>
                      <TableCell>MR No</TableCell>
                      <TableCell>Item</TableCell>
                      <TableCell>Unit</TableCell>
                      <TableCell>Warehouse / Area</TableCell>
                      <TableCell align="right">Bal Qty</TableCell>
                      <TableCell align="right">Bal Weight (kg)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stockItems.map((stock) => (
                      <TableRow
                        key={stock.stock_key}
                        hover
                        onClick={() => handleStockRadioChange(stock.stock_key)}
                        onDoubleClick={() => {
                          handleStockRadioChange(stock.stock_key);
                          setTimeout(() => handleConfirmStockSelection(), 50);
                        }}
                        sx={{ cursor: "pointer" }}
                        selected={selectedStockId === stock.stock_key}
                      >
                        <TableCell padding="checkbox">
                          <Radio
                            checked={selectedStockId === stock.stock_key}
                            value={stock.stock_key}
                            size="small"
                          />
                        </TableCell>
                        {/* Waste has no gate entry, date, vehicle or MR number —
                            its department stands in for the gate entry */}
                        <TableCell>
                          {stock.source === "WASTE"
                            ? stock.dept_name || "-"
                            : stock.gate_entry_num || stock.jute_gate_entry_no || "-"}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {formatDateShort(stock.jute_gate_entry_date)}
                        </TableCell>
                        <TableCell sx={{ width: 90, fontSize: "0.75rem" }}>
                          {stock.vehicle_no || "-"}
                        </TableCell>
                        <TableCell>{stock.mr_num ?? stock.branch_mr_no ?? "-"}</TableCell>
                        <TableCell>{stock.item_name || "-"}</TableCell>
                        <TableCell>{stock.unit_conversion}</TableCell>
                        <TableCell>
                          {stock.source === "WASTE"
                            ? stock.area_name || "-"
                            : stock.warehouse_name || "-"}
                        </TableCell>
                        <TableCell align="right">
                          <Box>
                            <Typography variant="body2" fontWeight={600}>
                              {getAdjustedBalQty(stock).toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              (Prv Bal: {stock.balqty?.toFixed(2)})
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box>
                            <Typography variant="body2" fontWeight={600}>
                              {getAdjustedBalWeight(stock).toFixed(2)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              (Prv Bal: {stock.balweight?.toFixed(2)})
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </Box>

                {/* Mobile: one tappable card per stock line. Balance is the
                    number the operator picks on, so it leads. */}
                <Box sx={MOBILE_ONLY_SX}>
                  {stockItems.map((stock) => {
                    const isSelected = selectedStockId === stock.stock_key;
                    return (
                      <Paper
                        key={stock.stock_key}
                        variant="outlined"
                        onClick={() => handleStockRadioChange(stock.stock_key)}
                        sx={{
                          p: 1.5,
                          cursor: "pointer",
                          borderColor: isSelected ? "primary.main" : "divider",
                          borderWidth: isSelected ? 2 : 1,
                          bgcolor: isSelected ? "action.selected" : undefined,
                        }}
                      >
                        <Box display="flex" alignItems="flex-start" gap={1}>
                          <Radio
                            checked={isSelected}
                            value={stock.stock_key}
                            sx={{ p: 0.5, mt: -0.5 }}
                          />
                          <Box minWidth={0} flex={1}>
                            <Typography variant="subtitle2" fontWeight={700}>
                              {stock.item_name || "-"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {stock.source === "WASTE"
                                ? `${stock.dept_name || "-"} · ${stock.area_name || "-"}`
                                : `${stock.mr_num ?? stock.branch_mr_no ?? "-"} · GE ${
                                    stock.gate_entry_num || stock.jute_gate_entry_no || "-"
                                  }`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {stock.source === "WASTE"
                                ? stock.unit_conversion
                                : `${formatDateShort(stock.jute_gate_entry_date)} · ${
                                    stock.vehicle_no || "no vehicle"
                                  } · ${stock.warehouse_name || "-"}`}
                            </Typography>
                          </Box>
                        </Box>

                        <Box
                          display="grid"
                          gridTemplateColumns="repeat(2, minmax(0, 1fr))"
                          columnGap={2}
                          mt={1}
                        >
                          <CardStat
                            label={`Bal Qty (${stock.unit_conversion || "-"})`}
                            value={
                              <>
                                {getAdjustedBalQty(stock).toFixed(2)}{" "}
                                <Typography component="span" variant="caption" color="text.secondary">
                                  (prv {stock.balqty?.toFixed(2)})
                                </Typography>
                              </>
                            }
                          />
                          <CardStat
                            label="Bal Weight (kg)"
                            align="right"
                            value={
                              <>
                                {getAdjustedBalWeight(stock).toFixed(2)}{" "}
                                <Typography component="span" variant="caption" color="text.secondary">
                                  (prv {stock.balweight?.toFixed(2)})
                                </Typography>
                              </>
                            }
                          />
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              </RadioGroup>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={DIALOG_ACTIONS_SX}>
          <Button onClick={handleCloseStockDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmStockSelection}
            disabled={!selectedStockId}
          >
            Select & Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Item Dialog (Quantity/Weight Input) */}
      <Dialog
        open={addDialogOpen}
        onClose={handleCloseAddDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={MOBILE_FULL_BLEED_PAPER}
      >
        <DialogTitle>Add Issue Item</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
          <Box display="flex" flexDirection="column" gap={{ xs: 2, sm: 3 }} pt={2}>
            {/* Save error — shown here because the page-level alert sits behind
                the dialog; the entry stays in the form so nothing is lost. */}
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {/* Quantity Error Alert */}
            {quantityExceedsBalance && (
              <Alert severity="error">
                Cannot issue more than available balance quantity ({selectedStock?.balqty?.toFixed(2)})
              </Alert>
            )}
            {/* Selected Stock Info */}
            {selectedStock && (
              <Box sx={{ p: 2, bgcolor: "grey.100", borderRadius: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Selected Stock
                </Typography>
                <Typography>
                  {selectedStock.source === "WASTE"
                    ? `Waste #${selectedStock.waste_entry_id} / ${describeStockOrigin(selectedStock)} - ${selectedStock.jute_group_name || "Unknown"} (${selectedStock.item_name || "N/A"})`
                    : `MR ${selectedStock.mr_num ?? selectedStock.branch_mr_no} / GE ${selectedStock.gate_entry_num ?? selectedStock.jute_gate_entry_no ?? "-"} - ${selectedStock.jute_group_name || "Unknown"} (${selectedStock.item_name || "N/A"})`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Available: {selectedStock ? getAdjustedBalQty(selectedStock).toFixed(2) : "0"} unit({selectedStock?.unit_conversion}) | Rate: ₹{selectedStock?.actual_rate?.toFixed(2)}/qtl
                </Typography>
                {selectedStock.source === "WASTE" ? (
                  // Waste is kg-only, so wt/unit is always 1 and telling the
                  // operator so adds nothing. A zero rate does matter: it means
                  // no Waste Rate is on file for this item and the line will
                  // save at zero value.
                  selectedStock.actual_rate ? null : (
                    <Typography variant="body2" color="warning.main">
                      No waste rate on file for this item — this line will be issued at ₹0.
                      Add one in Waste Rate Master to value it.
                    </Typography>
                  )
                ) : (
                  <Typography variant="body2" color="primary">
                    Wt/Unit: {wtPerUnit.toFixed(2)} kg
                  </Typography>
                )}
              </Box>
            )}

            {/* Yarn Type */}
            <Autocomplete
              id="jute-issue-yarn-type"
              options={yarnTypeOptions}
              value={yarnTypeOptions.find((o) => o.value === newYarnTypeId) || null}
              onChange={(_, value) => setNewYarnTypeId(value?.value || "")}
              renderInput={(params) => (
                <TextField {...params} label="Yarn Type" required />
              )}
              isOptionEqualToValue={(opt, val) => opt.value === val.value}
            />

            {/* Quantity and Weight */}
            <Box display="flex" flexDirection={{ xs: "column", sm: "row" }} gap={2}>
              <TextField
                id="jute-issue-quantity"
                label={
                  selectedStock?.source === "WASTE"
                    ? "Quantity (kg)"
                    : "Quantity (Bale/Drum)"
                }
                type="number"
                value={newQuantity}
                onChange={(e) => setNewQuantity(e.target.value)}
                onFocus={(e) => e.target.select()}
                fullWidth
                autoFocus
                inputProps={{
                  min: 0,
                  step: 1,
                  max: selectedStock ? getAdjustedBalQty(selectedStock) : 0,
                  // numeric soft-keyboard on the floor instead of the full QWERTY
                  inputMode: "decimal",
                }}
                helperText={selectedStock ? `Available: ${getAdjustedBalQty(selectedStock).toFixed(2)}` : ""}
              />
              <TextField
                id="jute-issue-weight"
                label="Weight (kg)"
                type="number"
                value={calculatedWeight.toFixed(2)}
                fullWidth
                InputProps={{ readOnly: true }}
                helperText={`Max: ${maxWeight.toFixed(2)} kg (auto-calculated)`}
              />
            </Box>

            {/* Calculated Value */}
            {selectedStock && calculatedWeight > 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Calculated Issue Value (Weight × Rate ÷ 100)
                </Typography>
                <Typography variant="h6">
                  ₹ {calculateIssueValue(calculatedWeight, selectedStock.actual_rate || 0).toFixed(2)}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={DIALOG_ACTIONS_SX}>
          <Button onClick={handleCloseAddDialog} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddItem}
            disabled={!selectedStock || !newYarnTypeId || !newQuantity || calculatedWeight <= 0 || quantityExceedsBalance || saving}
          >
            {saving ? <CircularProgress size={20} /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
