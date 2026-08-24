"use client";

import React, { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, FormControl, CircularProgress, FormHelperText, Checkbox, FormControlLabel, Autocomplete } from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { apiRoutesPortalMasters } from "@/utils/api";
import { fetchWithCookie } from "@/utils/apiClient2";

/** Item type option returned by the item-group setup endpoint. */
type ItemTypeRecord = {
  item_type_id: number;
  item_type_name: string;
};

/** Shape of the create-item-group form state. */
type ItemGroupFormState = {
  item_grp_code: string;
  item_grp_name: string;
  parent_grp_id: string | number | null;
  item_type_id: string | number;
  tax_applicable: boolean;
};

interface ItemGroupFormProps {
  open?: boolean;
  onClose?: () => void;
}

export default function CreateItemGroupPage({ open = true, onClose }: ItemGroupFormProps) {
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<any>(null);
  const [parentGroupSearch, setParentGroupSearch] = useState("");
  const [_filteredParentGroups, _setFilteredParentGroups] = useState<any[]>([]);
  const [_showParentGroup, _setShowParentGroup] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);

  // Helper to get initial form state
  const getInitialForm = (): ItemGroupFormState => ({
    item_grp_code: "",
    item_grp_name: "",
    parent_grp_id: "",
    item_type_id: "",
    tax_applicable: false,
  });

  const [form, setForm] = useState(getInitialForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch setup data for dropdowns etc.
  useEffect(() => {
    setLoading(true);
    // Fetch setup data with co_id as query param if available
    let co_id: number | undefined;
    try {
      const selectedCompany = localStorage.getItem("sidebar_selectedCompany");
      if (selectedCompany) {
        co_id = JSON.parse(selectedCompany).co_id;
      }
    } catch {
      /* ignore JSON errors */
    }

    let url = apiRoutesPortalMasters.CREATE_ITEM_GRP_SETUP;
    if (co_id) {
      const urlObj = new URL(url, window.location.origin);
      urlObj.searchParams.set('co_id', String(co_id));
      url = urlObj.toString();
    }

    fetchWithCookie(url, "GET")
      .then(({ data, error }) => {
        setSetupData(data);
        setError(error);
      })
      .finally(() => setLoading(false));
  }, []);

  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    // Disallow hyphens in item group code
    const sanitizedValue = name === 'item_grp_code' ? value.replace(/-/g, '') : value;
    setForm((prev) => ({
      ...prev,
      [name!]: type === "checkbox" ? (e.target as HTMLInputElement).checked : sanitizedValue,
    }));
  };

  // Separate handler for the Item Type dropdown (option object -> stored id)
  const handleItemTypeChange = (option: ItemTypeRecord | null) => {
    setForm((prev) => ({ ...prev, item_type_id: option ? option.item_type_id : "" }));
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    let co_id = undefined;
    try {
      const selectedCompany = localStorage.getItem('sidebar_selectedCompany');
      if (selectedCompany) {
        co_id = JSON.parse(selectedCompany).co_id;
      }
    } catch (_err) {
      // ignore
    }
    const apiUrl = apiRoutesPortalMasters.CREATE_ITEM_GRP;
    const payload: any = { ...form };
    // Convert empty strings to null
    Object.keys(payload).forEach(key => {
      if (payload[key] === "") payload[key] = null;
    });
    if (co_id) payload.co_id = co_id;
    const { data, error } = await fetchWithCookie(apiUrl, "POST", payload);
    setSubmitting(false);
    if (error) {
      setError(error);
    } else {
      setSuccessDialogOpen(true);
    }
  };

  // Update filteredParentGroups when setupData or parentGroupSearch changes
  useEffect(() => {
    if (!setupData?.item_groups) return;
    const lowerCaseSearch = parentGroupSearch.toLowerCase();
    const filtered = setupData.item_groups.filter((pg: any) =>
      pg.item_grp_name_display.toLowerCase().includes(lowerCaseSearch) ||
      pg.item_grp_code_display.toLowerCase().includes(lowerCaseSearch)
    );
    _setFilteredParentGroups(filtered);
  }, [setupData, parentGroupSearch]);

  // Duplicate validation
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  useEffect(() => {
    if (!setupData?.item_groups) return;
    let errorMsg = null;
    // If parent is selected, only check for combined code duplicate
    if (form.item_grp_code && form.parent_grp_id) {
      const parent = setupData.item_groups.find((g: any) => g.item_grp_id === form.parent_grp_id);
      if (parent && parent.item_grp_code_display) {
        const combinedCode = `${parent.item_grp_code_display}-${form.item_grp_code}`;
        const combinedCodeExists = setupData.item_groups.some((g: any) => g.item_grp_code_display === combinedCode);
        if (combinedCodeExists) errorMsg = 'Item Group Code already exists.';
      }
    } else if (form.item_grp_code) {
      // Only check direct code if no parent
      const codeExists = setupData.item_groups.some((g: any) => g.item_grp_code_display === form.item_grp_code);
      if (codeExists) errorMsg = 'Item Group Code already exists.';
    }
    // If parent is selected, only check for combined name duplicate
    if (!errorMsg && form.item_grp_name && form.parent_grp_id) {
      const parent = setupData.item_groups.find((g: any) => g.item_grp_id === form.parent_grp_id);
      if (parent && parent.item_grp_name_display) {
        const combinedName = `${parent.item_grp_name_display}-${form.item_grp_name}`;
        const combinedNameExists = setupData.item_groups.some((g: any) => g.item_grp_name_display === combinedName);
        if (combinedNameExists) errorMsg = 'Item Group Name already exists.';
      }
    } else if (!errorMsg && form.item_grp_name) {
      // Only check direct name if no parent
      const nameExists = setupData.item_groups.some((g: any) => g.item_grp_name_display === form.item_grp_name);
      if (nameExists) errorMsg = 'Item Group Name already exists.';
    }
    setDuplicateError(errorMsg);
  }, [form.item_grp_code, form.item_grp_name, form.parent_grp_id, setupData]);

  // Cancel handler: use onClose if provided, else redirect
  const handleCancel = () => {
    if (onClose) {
      onClose();
    }
  };

  // Item type dropdown options (mapped id <-> option object at this boundary)
  const itemTypeOptions: ItemTypeRecord[] = setupData?.item_types ?? [];
  const selectedItemType =
    itemTypeOptions.find((it) => String(it.item_type_id) === String(form.item_type_id)) ?? null;

  // Render as dialog if open prop is provided, else as page
  const FormContent = (
    <Box component="form" onSubmit={handleSubmit} sx={{ p: 2, minWidth: 350 }}>
      <TextField
        label="Item Group Code"
        name="item_grp_code"
        value={form.item_grp_code}
        onChange={handleChange}
        fullWidth
        margin="normal"
        required
      />
      <TextField
        label="Item Group Name"
        name="item_grp_name"
        value={form.item_grp_name}
        onChange={handleChange}
        fullWidth
        margin="normal"
        required
      />
      <FormControl fullWidth margin="normal">
        <Autocomplete
          options={setupData?.item_groups || []}
          getOptionLabel={option =>
            option && (option.item_grp_name_display && option.item_grp_code_display)
              ? `${option.item_grp_name_display} (${option.item_grp_code_display})`
              : ""
          }
          value={
            setupData?.item_groups?.find((pg: any) => pg.item_grp_id === form.parent_grp_id) || null
          }
          onChange={(_event, newValue) => {
            setForm(prev => ({ ...prev, parent_grp_id: newValue ? newValue.item_grp_id : null }));
          }}
          renderInput={params => (
            <TextField {...params} label="Parent Group" placeholder="Type to search..." />
          )}
          isOptionEqualToValue={(option, value) => option.item_grp_id === value.item_grp_id}
          disabled={loading || !setupData}
        />
      </FormControl>
      <SearchableSelect<ItemTypeRecord>
        variant="outlined"
        size="medium"
        label="Item Type"
        placeholder="Type to search..."
        options={itemTypeOptions}
        value={selectedItemType}
        onChange={handleItemTypeChange}
        getOptionLabel={(option) => option.item_type_name}
        getOptionKey={(option) => String(option.item_type_id)}
        isOptionEqualToValue={(option, selected) => option.item_type_id === selected.item_type_id}
        disabled={loading || !setupData}
        textFieldProps={{ margin: "normal" }}
      />
      {/* GST Applicable Checkbox (only if india_gst_applicable === 1) */}
      {setupData?.india_gst_applicable === 1 && (
        <FormControlLabel
          control={
            <Checkbox
              name="tax_applicable"
              checked={!!form.tax_applicable}
              onChange={handleChange}
              disabled={loading}
            />
          }
          label="GST Applicable"
        />
      )}
      {duplicateError && <FormHelperText error>{duplicateError}</FormHelperText>}
      {error && <FormHelperText error>{error}</FormHelperText>}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        {/* Always show Cancel button in dialog mode */}
        {typeof open === 'boolean' && (
          <Button onClick={handleCancel} color="secondary" sx={{ mr: 2 }} disabled={submitting}>Cancel</Button>
        )}
        <Button type="submit" variant="contained" color="primary" disabled={submitting || loading || !!duplicateError}>
          {submitting ? <CircularProgress size={20} /> : "Create"}
        </Button>
      </Box>
    </Box>
  );

  return (
    <>
      {typeof open === "boolean" ? (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
          <DialogTitle>Create Item Group</DialogTitle>
          <DialogContent>{loading ? <CircularProgress /> : FormContent}</DialogContent>
        </Dialog>
      ) : (
        <Box sx={{ maxWidth: 500, mx: "auto", mt: 4 }}>
          <DialogTitle>Create Item Group</DialogTitle>
          <DialogContent>{loading ? <CircularProgress /> : FormContent}</DialogContent>
        </Box>
      )}
      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onClose={() => {
        setSuccessDialogOpen(false);
        if (onClose) onClose();
      }} maxWidth="xs" fullWidth>
        <DialogTitle>Success</DialogTitle>
        <DialogContent>Item created successfully.</DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setSuccessDialogOpen(false);
            if (onClose) onClose();
          }} autoFocus>Okay</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
