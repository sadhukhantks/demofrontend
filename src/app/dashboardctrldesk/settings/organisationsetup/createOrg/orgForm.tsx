"use client";

import React, { useMemo, useEffect, useState } from "react";
import { useForm, FormProvider, Controller } from "react-hook-form";
import FormFieldWrapper from "@/components/ui/FormFieldWrapper";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import {
  SearchableSelect,
  SearchableMultiSelect,
} from "@/components/ui/SearchableSelect";

interface OrgFormData {
  con_org_name: string;
  con_org_shortname: string;
  con_org_contact_person: string;
  con_org_email_id: string;
  con_org_mobile: string;
  con_org_address: string;
  con_org_pincode: string;
  con_org_state_id: string;
  con_org_remarks: string;
  active: string;
  con_org_master_status: string;
  con_modules_selected: string[];
  con_org_main_url: string;
  con_org_country_id: string;
}

/** Console module option. */
interface ModuleOption {
  con_module_id: number;
  con_module_name: string;
}

/** Country option. */
interface CountryOption {
  country_id: number;
  country_name: string;
}

/** State option, scoped to a country. */
interface StateOption {
  state_id: number;
  state_name: string;
  country_id?: number;
}

/** Organisation status option. */
interface StatusOption {
  con_status_id: number;
  con_status_name: string;
}

interface OrgFormProps {
  initialValues?: Partial<OrgFormData> | null;
  allModules: ModuleOption[];
  countries: CountryOption[];
  states: StateOption[];
  statusAll: StatusOption[];
  onSubmit: (data: OrgFormData) => void;
  loading: boolean;
  isEdit: boolean;
}

const OrgForm: React.FC<OrgFormProps> = ({
  initialValues,
  allModules,
  countries,
  states,
  statusAll,
  onSubmit,
  loading,
  isEdit,
}) => {
  const methods = useForm<OrgFormData>({
    defaultValues: {
      con_org_name: "",
      con_org_shortname: "",
      con_org_contact_person: "",
      con_org_email_id: "",
      con_org_mobile: "",
      con_org_address: "",
      con_org_pincode: "",
      con_org_state_id: "",
      con_org_remarks: "",
      active: "1",
      con_org_master_status: "",
      con_modules_selected: [],
      con_org_main_url: "",
      con_org_country_id: "",
    },
  });

  const { handleSubmit, watch, control, reset, setValue, getValues } = methods;
  const watchedCountry = watch("con_org_country_id");
  
  // Handle initial values loading
  useEffect(() => {
    if (initialValues && !loading) {
      console.log("Setting form values from initialValues:", initialValues);
      reset(initialValues);
    }
  }, [initialValues, reset, loading]);

  if (loading) return <div>Loading...</div>;

  return (
    <Card className="p-6 max-w-md mx-auto mt-10">
    <FormProvider {...methods}>
      <Form {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormFieldWrapper
            name="con_org_name"
            control={control}
            label="Organization Name"
            required
            placeholder="Enter organization name"
          />
          <FormFieldWrapper
            name="con_org_shortname"
            control={control}
            label="Short Name"
            required
            placeholder="Enter short name"
          />
          <FormFieldWrapper
            name="con_org_contact_person"
            control={control}
            label="Contact Person"
            required
            placeholder="Enter contact person"
          />
          <FormFieldWrapper
            name="con_org_email_id"
            control={control}
            label="Email"
            type="email"
            required
            placeholder="Enter email"
          />
          <FormFieldWrapper
            name="con_org_mobile"
            control={control}
            label="Mobile"
            required
            placeholder="Enter mobile"
          />
          <FormFieldWrapper
            name="con_org_address"
            control={control}
            label="Address"
            required
            placeholder="Enter address"
          />
          <FormFieldWrapper
            name="con_org_pincode"
            control={control}
            label="Pincode"
            type="number"
            required
            placeholder="Enter pincode"
          />
          <FormFieldWrapper
            name="con_org_country_id"
            control={control}
            label="Country"
            type="select"
            required
            options={countries.map((c) => ({
              value: c.country_id.toString(),
              label: c.country_name,
            }))}
            placeholder="Select country"
          />
          <FormFieldWrapper
            name="con_org_state_id"
            control={control}
            label="State"
            required
            customInput={
              <Controller
                control={control}
                name="con_org_state_id"
                render={({ field }) => {
                  const stateOptions = states.filter(
                    (s) => !watchedCountry || s.country_id?.toString() === watchedCountry,
                  );
                  return (
                    // Wrapped in an element that can hold a ref: FormFieldWrapper
                    // renders `customInput` inside a Radix `Slot`.
                    <div className="w-full">
                      <SearchableSelect<StateOption>
                        variant="outlined"
                        options={stateOptions}
                        value={
                          stateOptions.find((s) => s.state_id.toString() === field.value) ?? null
                        }
                        onChange={(state) =>
                          field.onChange(state ? state.state_id.toString() : "")
                        }
                        getOptionLabel={(s) => s.state_name}
                        getOptionKey={(s) => s.state_id}
                        isOptionEqualToValue={(option, selected) =>
                          option.state_id === selected.state_id
                        }
                        clearable={false}
                        placeholder="Select state"
                        textFieldProps={{ name: field.name, onBlur: field.onBlur }}
                      />
                    </div>
                  );
                }}
              />
            }
          />
          <FormFieldWrapper
            name="con_org_master_status"
            control={control}
            label="Status"
            type="select"
            required
            options={statusAll.map((s) => ({
              value: s.con_status_id.toString(),
              label: s.con_status_name,
            }))}
            placeholder="Select status"
          />
          <FormFieldWrapper
            name="con_modules_selected"
            control={control}
            label="Modules"
            required
            customInput={
              <Controller
                control={control}
                name="con_modules_selected"
                render={({ field }) => (
                  // Wrapped in an element that can hold a ref: FormFieldWrapper
                  // renders `customInput` inside a Radix `Slot`.
                  <div className="w-full">
                    <SearchableMultiSelect<ModuleOption>
                      variant="outlined"
                      options={allModules}
                      value={allModules.filter((m) =>
                        (field.value ?? []).includes(m.con_module_id.toString()),
                      )}
                      onChange={(modules) =>
                        field.onChange(modules.map((m) => m.con_module_id.toString()))
                      }
                      getOptionLabel={(m) => m.con_module_name}
                      getOptionKey={(m) => m.con_module_id}
                      isOptionEqualToValue={(option, selected) =>
                        option.con_module_id === selected.con_module_id
                      }
                      placeholder="Search modules..."
                      textFieldProps={{ name: field.name, onBlur: field.onBlur }}
                    />
                  </div>
                )}
              />
            }
          />
          <FormFieldWrapper
            name="con_org_main_url"
            control={control}
            label="Main URL"
            required
            placeholder="Enter main URL"
          />
          <FormFieldWrapper
            name="con_org_remarks"
            control={control}
            label="Remarks"
            placeholder="Enter remarks"
          />
          <Button type="submit" className="button-normal button-normal:hover">
            {isEdit ? "Update" : "Create"} Organization</Button>
        </form>
      </Form>
    </FormProvider>
    </Card>
  );
};

export default OrgForm;
// className="bg-[hsl(var(--brand-primary))] hover:bg-[hsl(var(--brand-primary-hover))] text-white">