import { ReactNode } from "react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  useFormField,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { Control } from "react-hook-form";

type Option = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  options: Option[];
  /** Whatever the form currently holds; matched against `option.value`. */
  value: unknown;
  /** Receives the option's `value`, never the option object. */
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * @component SelectField
 * @description Searchable (type-to-filter) dropdown for the `type="select"`
 * branch below. Maps option object <-> primitive `value` at this boundary so
 * react-hook-form keeps storing the same string it always did. Rendered inside
 * `FormItem`, so it reads the form-item id and error state from context and
 * keeps the label/error wiring the previous trigger had.
 * @example
 * <SelectField options={opts} value={field.value} onValueChange={field.onChange} />
 */
const SelectField = ({
  options,
  value,
  onValueChange,
  placeholder,
  disabled,
}: SelectFieldProps) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  const current = value === null || value === undefined ? "" : String(value);
  const selected = options.find((option) => option.value === current) ?? null;

  return (
    <SearchableSelect<Option>
      // No `label`: a FormLabel is already rendered above this control.
      variant="outlined"
      options={options}
      value={selected}
      // The old shadcn Select had no clear button; keeping it off means the only
      // user-visible change is that the field can now be typed into to filter.
      clearable={false}
      onChange={(option) => onValueChange(option ? option.value : "")}
      getOptionLabel={(option) => option.label}
      getOptionKey={(option) => option.value}
      isOptionEqualToValue={(option, selectedOption) => option.value === selectedOption.value}
      placeholder={placeholder}
      disabled={disabled}
      error={!!error}
      textFieldProps={{
        id: formItemId,
        "aria-describedby": error
          ? `${formDescriptionId} ${formMessageId}`
          : formDescriptionId,
      }}
    />
  );
};
SelectField.displayName = "SelectField";

type ControlledFormFieldWrapperProps = {
  name: string;
  control: Control<any>;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "password" | "number" | "select" | "checkbox";
  options?: Option[];
  disabled?: boolean;
  required?: boolean;
  customInput?: ReactNode;
  value?: any;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const ControlledFormFieldWrapper = ({
  name,
  control,
  label,
  placeholder = "",
  type = "text",
  options = [],
  disabled = false,
  required = false,
  customInput,
  value,
  onChange,
}: ControlledFormFieldWrapperProps) => {
  return (
    <FormField
      name={name}
      control={control}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </FormLabel>
          {type === "select" && !customInput ? (
            // Not wrapped in FormControl: that is a Radix `Slot`, which forwards
            // a ref this plain function component cannot take. SelectField reads
            // the same ids from form context instead.
            <SelectField
              options={options}
              value={value !== undefined ? value : field.value}
              onValueChange={field.onChange}
              placeholder={placeholder}
              disabled={disabled}
            />
          ) : (
          <FormControl>
            {customInput ? (
              customInput
            ) : type === "checkbox" ? (
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={value !== undefined ? value : field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                  id={name}
                />
                <label
                  htmlFor={name}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {placeholder}
                </label>
              </div>
            ) : (
              <Input
                placeholder={placeholder}
                type={type}
                disabled={disabled}
                {...field}
                value={value !== undefined ? value : field.value}
                onChange={(e) => {
                  field.onChange(e);
                  if (onChange) {
                    onChange(e);
                  }
                }}
              />
            )}
          </FormControl>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default ControlledFormFieldWrapper;