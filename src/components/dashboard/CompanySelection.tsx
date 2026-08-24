"use client";

import { useCompany } from "@/hooks/use-org"; // ✅ Fetch company list from API
import { Skeleton } from "@/components/ui/skeleton"; // ✅ Show loading effect
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface CompanySelectionProps {
  isCollapsed: boolean;
}

type CompanyOption = {
  value: string;
  label: string;
};

/**
 * @component CompanySelection
 * @description Sidebar company picker. Type-to-filter (see the "Dropdowns" rule
 * in CLAUDE.md) and reports the selected `co_id` to `handleCompanyChange`.
 * Colours are inherited from the surrounding sidebar rather than hardcoded, so
 * the control follows the sidebar theme.
 * @example
 * <CompanySelection isCollapsed={false} />
 */
export function CompanySelection({ isCollapsed }: CompanySelectionProps) {
  const { companies, selectedCompany, handleCompanyChange, loading } = useCompany();

  // ✅ Transform API data into dropdown options using SidebarContext Company shape
  const companyOptions: CompanyOption[] = companies.map((company) => ({
    value: String(company.co_id),
    label: `${company.co_name}`,
  }));

  const selectedOption =
    companyOptions.find(
      (option) => option.value === String(selectedCompany?.co_id),
    ) ?? null;

  return (
    <div className="px-4 py-3 border-b border-[#005580]">
      {loading ? (
        <Skeleton className="h-10 w-full bg-[#005580]" />
      ) : isCollapsed ? (
        <></>
      ) : (
        <SearchableSelect<CompanyOption>
          variant="outlined"
          options={companyOptions}
          value={selectedOption}
          onChange={(option) => {
            if (option) handleCompanyChange(Number(option.value));
          }}
          getOptionLabel={(option) => option.label}
          getOptionKey={(option) => option.value}
          isOptionEqualToValue={(option, selected) =>
            option.value === selected.value
          }
          placeholder="Select Company"
          clearable={false}
          textFieldProps={{
            // Inherit the sidebar's foreground colour instead of hardcoding it.
            sx: {
              "& .MuiInputBase-root": { color: "inherit" },
              "& .MuiInputBase-input": { color: "inherit" },
              "& .MuiInputBase-input::placeholder": { color: "inherit", opacity: 0.8 },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "currentColor" },
              "& .MuiSvgIcon-root": { color: "inherit" },
            },
          }}
        />
      )}
    </div>
  );
}
