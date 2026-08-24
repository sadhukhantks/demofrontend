"use client";

import React, { useMemo, useEffect, useState, useCallback, useRef } from "react";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { 
  TextField, 
  Button, 
  Card, 
  CardContent,
  Box,
  Typography,
  CircularProgress,
  Checkbox,
  Switch,
  FormControlLabel
} from "@mui/material";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface BranchFormData {
  branch_name: string;
  branch_prefix: string;
  branch_address1: string;
  branch_address2: string;
  branch_zipcode: string;
  country_id: string;
  state_id: string;
  co_id: string;
  branch_email: string;
  contact_no: string;
  active: boolean;
}

/** Company option as returned by the tenant-admin company endpoints. */
interface CompanyOption {
  co_id: number;
  co_name: string;
  branches?: { branch_name: string }[];
}

/** Country option. */
interface CountryOption {
  country_id: number;
  country: string;
}

/** State option, scoped to a country. */
interface StateOption {
  state_id: number;
  state: string;
  country_id: number;
}

interface BranchFormProps {
  initialValues?: Partial<BranchFormData> | null;
  companies: CompanyOption[];
  countries: CountryOption[];
  states: StateOption[];
  alert_email_id?: string[];  // Optional for backward compatibility
  onSubmit: (data: BranchFormData) => void;
  loading: boolean;
  isEdit: boolean;
}

const BranchForm: React.FC<BranchFormProps> = ({
  initialValues,
  companies,
  countries,
  states,
  onSubmit,
  loading,
  isEdit,
}) => {
  const methods = useForm<BranchFormData>({
    defaultValues: {
      branch_name: "",
      branch_prefix: "",
      branch_address1: "",
      branch_address2: "",
      branch_zipcode: "",
      country_id: "",
      state_id: "",
      co_id: "",
      branch_email: "",
      contact_no: "",
      active: true,
    },
  });
  const { handleSubmit, watch, control, reset, setValue, getValues, formState: { errors }, setError, clearErrors } = methods;
  const watchedCountry = watch("country_id");
  const watchedCompany = watch("co_id");
  const watchedBranchName = watch("branch_name");
  
  // States for filtered options
  const [filteredStates, setFilteredStates] = useState<StateOption[]>([]);
  const [existingBranches, setExistingBranches] = useState<string[]>([]);
  
  // For debounced validation
  const [branchNameError, setBranchNameError] = useState<string | null>(null);
  const branchNameTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Function to check branch name uniqueness with debounce
  const checkBranchNameUniqueness = useCallback((value: string) => {
    // Clear any previous timer
    if (branchNameTimerRef.current) {
      clearTimeout(branchNameTimerRef.current);
    }
    
    // If empty value or no company selected, don't validate
    if (!value || !watchedCompany) {
      setBranchNameError(null);
      return;
    }
    
    // In edit mode, if we're keeping the same branch name, don't validate
    if (isEdit && initialValues?.branch_name === value) {
      console.log("Edit mode: Using the same branch name, skipping validation");
      setBranchNameError(null);
      return;
    }
    
    console.log(`Starting 2-second timer for validating branch name: "${value}"`);
    
    // Set a new timer for 2 seconds
    branchNameTimerRef.current = setTimeout(() => {
      const lowercaseName = value.toLowerCase();
      console.log(`Validating branch name after 2 seconds: "${value}"`);
      console.log(`Company ID: ${watchedCompany}`);
      console.log(`Existing branch names: ${JSON.stringify(existingBranches)}`);
      
      // Check if the branch name exists for the selected company
      const exists = existingBranches.some((name) => name === lowercaseName);
      
      if (exists) {
        const errorMessage = `Branch name "${value}" already exists for this company`;
        console.log(`Validation failed: ${errorMessage}`);
        
        // Set error state
        setBranchNameError(errorMessage);
        setError("branch_name", { type: "manual", message: errorMessage });
        
        // Clear the branch name field
        console.log("Clearing branch name field");
        setValue("branch_name", "");
      } else {
        // Clear any previous error
        console.log(`Validation passed for branch name: "${value}"`);
        setBranchNameError(null);
        clearErrors("branch_name");
      }
    }, 2000); // 2 seconds delay
  }, [watchedCompany, existingBranches, isEdit, initialValues, setError, clearErrors, setValue]);
    // Effect to validate branch name uniqueness
  useEffect(() => {
    if (watchedCompany && companies) {
      console.log('Checking branches for company ID:', watchedCompany);
      // Find selected company
      const selectedCompany = companies.find(c => c.co_id.toString() === watchedCompany);
      
      if (selectedCompany && selectedCompany.branches) {
        console.log('Found company with branches:', selectedCompany);
        
        // Extract branch names from the selected company
        const branchNames = selectedCompany.branches
          .map((branch) => branch.branch_name.toLowerCase())
          .filter((name) => name !== ''); // Filter out any empty strings
        
        console.log("Existing branch names for this company:", branchNames);
        setExistingBranches(branchNames);
      } else {
        console.log('No branches found for company ID:', watchedCompany);
        setExistingBranches([]);
      }
    }
  }, [watchedCompany, companies]);
  
  // Effect to update states when country changes
  useEffect(() => {
    if (watchedCountry) {
      console.log(`Country selected: ${watchedCountry}`);

      // Filter states for the selected country
      const filtered = states.filter(state =>
        state.country_id.toString() === watchedCountry
      );

      setFilteredStates(filtered);

      // Only clear state_id if the current selection does NOT belong to the
      // newly selected country. Preserves the pre-filled state on edit-load
      // where reset(initialValues) sets country_id and state_id together —
      // this effect previously wiped state_id immediately after.
      const currentStateId = getValues("state_id");
      const stillValid = currentStateId
        ? filtered.some(s => s.state_id.toString() === currentStateId)
        : true;
      if (!stillValid) {
        setValue("state_id", "");
      }
    }
  }, [watchedCountry, states, setValue, getValues]);
    // Effect to trigger debounced branch name validation
  useEffect(() => {
    // Only validate if we have a branch name and company
    if (watchedBranchName && watchedCompany) {
      console.log(`Debounced validation will start for: "${watchedBranchName}" in 2 seconds`);
      checkBranchNameUniqueness(watchedBranchName);
    }
    
    // Cleanup the timer when component unmounts or when dependencies change
    return () => {
      if (branchNameTimerRef.current) {
        clearTimeout(branchNameTimerRef.current);
      }
    };
  }, [watchedBranchName, watchedCompany, checkBranchNameUniqueness]);
  
  // Handle initial values loading
  useEffect(() => {
    if (initialValues && !loading) {
      console.log("Setting form values from initialValues:", initialValues);
      reset(initialValues);
      
      // If we have a country from initial values, load the associated states
      if (initialValues.country_id) {
        const filtered = states.filter(state => 
          state.country_id.toString() === initialValues.country_id
        );
        setFilteredStates(filtered);
      }
    }
  }, [initialValues, reset, loading, states]);  // Function to validate branch name uniqueness (used by react-hook-form validation)
  const validateBranchName = (value: string) => {
    if (!value) return "Branch Name is required";
    
    // In edit mode, if we're keeping the same branch name, it's valid
    if (isEdit && initialValues?.branch_name === value) {
      return true;
    }
    
    // If no company is selected yet, we can't validate branch uniqueness
    if (!watchedCompany) {
      return true;
    }
    
    // Check if branch name already exists in the selected company
    // First convert to lowercase for case-insensitive comparison
    const lowercaseName = value.toLowerCase();
    if (existingBranches.includes(lowercaseName)) {
      return `Branch name "${value}" already exists for this company`;
    }
    
    return true;
  };

  if (loading) return <CircularProgress />;

  return (
    <Card sx={{ p: 3, maxWidth: "600px", mx: "auto", mt: 2 }}>
      <CardContent>
        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Controller
              name="co_id"
              control={control}
              rules={{ required: "Company is required" }}
              render={({ field, fieldState: { error } }) => (
                <Box sx={{ mt: 2, mb: 1 }}>
                  <SearchableSelect<CompanyOption>
                    variant="outlined"
                    clearable={false}
                    label="Company"
                    placeholder="Search company..."
                    options={companies}
                    value={companies.find((c) => c.co_id.toString() === field.value) ?? null}
                    onChange={(company) => field.onChange(company ? company.co_id.toString() : "")}
                    getOptionLabel={(c) => c.co_name}
                    getOptionKey={(c) => c.co_id}
                    isOptionEqualToValue={(option, selected) => option.co_id === selected.co_id}
                    required
                    error={!!error}
                    helperText={error?.message}
                    disabled={isEdit} // Disable changing company in edit mode
                    textFieldProps={{ name: field.name, onBlur: field.onBlur, inputRef: field.ref }}
                  />
                </Box>
              )}
            />              <Controller
              name="branch_name"
              control={control}
              rules={{ 
                required: "Branch Name is required",
                validate: validateBranchName
              }}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  label="Branch Name"
                  fullWidth
                  margin="normal"
                  placeholder="Enter Branch Name"
                  error={!!error || !!branchNameError}
                  helperText={error?.message || branchNameError}
                  required
                  onChange={(e) => {
                    const value = e.target.value;
                    field.onChange(e);
                    
                    // Additional logging for debugging
                    console.log(`Branch name changed to: "${value}"`);
                    if (watchedCompany) {
                      console.log(`Selected company ID: ${watchedCompany}`);
                    } else {
                      console.log("No company selected yet");
                    }
                  }}
                />
              )}
            />
            
            <Controller
              name="branch_prefix"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  label="Branch Prefix"
                  fullWidth
                  margin="normal"
                  placeholder="Enter branch prefix"
                  error={!!error}
                  helperText={error?.message}
                />
              )}
            />
                        
            <Controller
              name="branch_email"
              control={control}
              rules={{ 
                required: "Email is required",
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Invalid email address"
                }
              }}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  label="Email"
                  type="email"
                  fullWidth
                  margin="normal"
                  placeholder="Enter email"
                  error={!!error}
                  helperText={error?.message}
                  required
                />
              )}
            />
            
            <Controller
              name="contact_no"
              control={control}
              rules={{ required: "Phone number is required" }}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  label="Phone"
                  fullWidth
                  margin="normal"
                  placeholder="Enter phone number"
                  error={!!error}
                  helperText={error?.message}
                  required
                />
              )}
            />
            
            <Controller
              name="branch_address1"
              control={control}
              rules={{ required: "Address is required" }}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  label="Address"
                  fullWidth
                  margin="normal"
                  placeholder="Enter address"
                  error={!!error}
                  helperText={error?.message}
                  required
                />
              )}
            />

            <Controller
              name="branch_address2"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  label="Address Line 2"
                  fullWidth
                  margin="normal"
                  placeholder="Address line 2"
                  error={!!error}
                  helperText={error?.message}
                />
              )}
            />
            
            <Controller
              name="branch_zipcode"
              control={control}
              rules={{ required: "Zipcode is required" }}
              render={({ field, fieldState: { error } }) => (
                <TextField
                  {...field}
                  label="Zipcode"
                  type="text"
                  fullWidth
                  margin="normal"
                  placeholder="Enter zipcode"
                  error={!!error}
                  helperText={error?.message}
                  required
                />
              )}
            />

            <Controller
              name="country_id"
              control={control}
              rules={{ required: "Country is required" }}
              render={({ field, fieldState: { error } }) => (
                <Box sx={{ mt: 2, mb: 1 }}>
                  <SearchableSelect<CountryOption>
                    variant="outlined"
                    clearable={false}
                    label="Country"
                    placeholder="Search country..."
                    options={countries}
                    value={countries.find((c) => c.country_id.toString() === field.value) ?? null}
                    onChange={(country) => field.onChange(country ? country.country_id.toString() : "")}
                    getOptionLabel={(c) => c.country}
                    getOptionKey={(c) => c.country_id}
                    isOptionEqualToValue={(option, selected) => option.country_id === selected.country_id}
                    required
                    error={!!error}
                    helperText={error?.message}
                    textFieldProps={{ name: field.name, onBlur: field.onBlur, inputRef: field.ref }}
                  />
                </Box>
              )}
            />
            
            <Controller
              name="state_id"
              control={control}
              rules={{ required: "State is required" }}
              render={({ field, fieldState: { error } }) => (
                <Box sx={{ mt: 2, mb: 1 }}>
                  <SearchableSelect<StateOption>
                    variant="outlined"
                    clearable={false}
                    label="State"
                    placeholder="Search state..."
                    options={filteredStates}
                    value={filteredStates.find((s) => s.state_id.toString() === field.value) ?? null}
                    onChange={(state) => field.onChange(state ? state.state_id.toString() : "")}
                    getOptionLabel={(s) => s.state}
                    getOptionKey={(s) => s.state_id}
                    isOptionEqualToValue={(option, selected) => option.state_id === selected.state_id}
                    required
                    error={!!error}
                    helperText={error?.message}
                    disabled={!watchedCountry}
                    textFieldProps={{ name: field.name, onBlur: field.onBlur, inputRef: field.ref }}
                  />
                </Box>
              )}
            />

            <Controller
              name="active"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Switch
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Active"
                />
              )}
            />
            
            <Box sx={{ mt: 3 }}>
              <Button 
                type="submit" 
                variant="contained" 
                color="primary"
                sx={{
                  backgroundColor: '#9BC837',
                  '&:hover': {
                    backgroundColor: '#8BB72E',
                  }
                }}
              >
                {isEdit ? "Update" : "Create"} Branch
              </Button>
            </Box>
          </form>
        </FormProvider>
      </CardContent>
    </Card>
  );
};

export default BranchForm;