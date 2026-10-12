"use client";

import * as React from "react";
import {
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormHandleSubmit,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  fetchBaleStockInvoices,
  fetchBaleStockSetup,
  type BaleDespatchReason,
  type BaleStockInvoice,
} from "@/utils/baleStockService";
import { invoiceLabel, todayISO } from "./baleStockCalc";
import {
  INVOICE_WINDOW_DAYS,
  linkDefaults,
  linkSchema,
  type DespatchMode,
  type LinkFormValues,
} from "./linkSchema";

export interface InvoiceOption {
  value: string;
  label: string;
}

/** Everything `InvoiceLinkFields` renders from, plus the submit plumbing. */
export interface InvoiceLinkForm {
  control: Control<LinkFormValues>;
  errors: FieldErrors<LinkFormValues>;
  isSubmitting: boolean;
  handleSubmit: UseFormHandleSubmit<LinkFormValues>;
  /** Against invoice / without invoice (spec §7b). */
  mode: DespatchMode;
  /** Switch mode; resets the despatch date to the mode's default and clears the other mode's error. */
  onModeChange: (mode: DespatchMode) => void;
  /** True when the selection holds bales already despatched without invoice — only INVOICE mode makes sense. */
  modeLocked: boolean;
  /** How many selected bales are already despatched without invoice (shown in the relink notice). */
  relinkCount: number;
  /** Candidate invoices of the branch in the window up to `asOn`. */
  invoices: BaleStockInvoice[];
  /** `invoices` as picker options — value is the invoice id as a string. */
  invoiceOptions: InvoiceOption[];
  /** The invoice currently picked, null until one is. */
  chosen: BaleStockInvoice | null;
  /** Reasons for a despatch without invoice, from GET /baleStock/setup. */
  reasons: BaleDespatchReason[];
  /** `reasons` as picker options — value is the reason code. */
  reasonOptions: InvoiceOption[];
  /** Invoice list or setup loading. */
  loading: boolean;
  loadError: string | null;
  /** Pick an invoice; the despatch date follows its date (capped at today). */
  onInvoiceChange: (invoiceId: string) => void;
  /** Pick a reason (NO_INVOICE mode). */
  onReasonChange: (code: string) => void;
  /** The mode's key field is filled — the submit button can be enabled. */
  ready: boolean;
  /** "#<invoice_no>" (or "#<invoice_id>") of the picked invoice, null in NO_INVOICE mode — for success messages. */
  invoiceRef: (values: LinkFormValues) => string | null;
}

/**
 * The "Mark despatched / Link to invoice" form shared by `LinkInvoiceDialog`
 * and `BaleDespatchQuickDialog`: loads the branch's candidate sales invoices
 * (Regular / Hessian / Govt Sacking, not rejected or cancelled) for the
 * `INVOICE_WINDOW_DAYS` up to `asOn` and the despatch reasons from the setup,
 * owns the react-hook-form state built on `linkSchema`, and defaults the
 * despatch date to the as-on day (capped at today) or, once an invoice is
 * picked, to that invoice's date — the bales leave stock on that date unless
 * the operator says otherwise.
 *
 * `noInvoiceDespatched` is the number of selected bales already despatched
 * without an invoice: when > 0 the form is locked to INVOICE mode (they can
 * only be linked, not despatched twice) and shows a relink notice.
 *
 * Mount it only while the dialog body is open so every opening reloads and resets.
 */
export function useInvoiceLinkForm(params: {
  coId: number;
  branchId: number;
  asOn: string;
  noInvoiceDespatched?: number;
}): InvoiceLinkForm {
  const { coId, branchId, asOn } = params;
  const relinkCount = params.noInvoiceDespatched ?? 0;
  const modeLocked = relinkCount > 0;
  const today = todayISO();
  const defaultDate = asOn <= today ? asOn : today;

  const [invoices, setInvoices] = React.useState<BaleStockInvoice[]>([]);
  const [reasons, setReasons] = React.useState<BaleDespatchReason[]>([]);
  const [invoicesLoading, setInvoicesLoading] = React.useState(false);
  const [setupLoading, setSetupLoading] = React.useState(false);
  const [invoicesError, setInvoicesError] = React.useState<string | null>(null);
  const [setupError, setSetupError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setInvoicesLoading(true);
    setInvoicesError(null);
    fetchBaleStockInvoices({ coId, branchId, asOn, days: INVOICE_WINDOW_DAYS })
      .then((list) => {
        if (!cancelled) setInvoices(list);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setInvoicesError(err.message);
        setInvoices([]);
      })
      .finally(() => {
        if (!cancelled) setInvoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coId, branchId, asOn]);

  React.useEffect(() => {
    let cancelled = false;
    setSetupLoading(true);
    setSetupError(null);
    fetchBaleStockSetup({ coId, branchId })
      .then((setup) => {
        if (!cancelled) setReasons(setup.despatch_reasons ?? []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSetupError(err.message);
        setReasons([]);
      })
      .finally(() => {
        if (!cancelled) setSetupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coId, branchId]);

  const {
    control,
    handleSubmit,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkSchema),
    defaultValues: linkDefaults(defaultDate, "INVOICE"),
    mode: "onTouched",
  });
  const mode = useWatch({ control, name: "mode" });
  const invoiceIdValue = useWatch({ control, name: "invoice_id" });
  const reasonValue = useWatch({ control, name: "despatch_reason" });

  // Relinking is only possible against an invoice — pull the form back if the
  // selection changes underneath an open dialog.
  React.useEffect(() => {
    if (modeLocked && mode !== "INVOICE") {
      setValue("mode", "INVOICE");
      clearErrors("despatch_reason");
    }
  }, [modeLocked, mode, setValue, clearErrors]);

  const invoiceOptions = React.useMemo<InvoiceOption[]>(
    () => invoices.map((inv) => ({ value: String(inv.invoice_id), label: invoiceLabel(inv) })),
    [invoices],
  );
  const chosen = React.useMemo(
    () => invoices.find((inv) => String(inv.invoice_id) === (invoiceIdValue ?? "")) ?? null,
    [invoices, invoiceIdValue],
  );
  const reasonOptions = React.useMemo<InvoiceOption[]>(
    () => reasons.map((r) => ({ value: r.code, label: r.label })),
    [reasons],
  );

  const onInvoiceChange = React.useCallback(
    (next: string) => {
      setValue("invoice_id", next, { shouldValidate: true });
      const inv = invoices.find((i) => String(i.invoice_id) === next);
      if (inv?.invoice_date) {
        setValue("despatch_date", inv.invoice_date <= today ? inv.invoice_date : today, {
          shouldValidate: true,
        });
      }
    },
    [invoices, setValue, today],
  );

  const onReasonChange = React.useCallback(
    (next: string) => {
      setValue("despatch_reason", next, { shouldValidate: true });
    },
    [setValue],
  );

  const onModeChange = React.useCallback(
    (next: DespatchMode) => {
      if (modeLocked && next !== "INVOICE") return;
      setValue("mode", next);
      if (next === "NO_INVOICE") {
        // The invoice date no longer applies — back to the stock day.
        setValue("despatch_date", defaultDate, { shouldValidate: true });
        clearErrors("invoice_id");
      } else {
        if (chosen?.invoice_date) {
          setValue("despatch_date", chosen.invoice_date <= today ? chosen.invoice_date : today, {
            shouldValidate: true,
          });
        }
        clearErrors("despatch_reason");
      }
    },
    [modeLocked, setValue, clearErrors, defaultDate, chosen, today],
  );

  const invoiceRef = React.useCallback(
    (values: LinkFormValues) =>
      values.mode === "NO_INVOICE" ? null : `#${chosen?.invoice_no ?? values.invoice_id}`,
    [chosen],
  );

  // Unmounted mode fields read as undefined — treat that as blank.
  const ready = mode === "NO_INVOICE" ? (reasonValue ?? "") !== "" : chosen !== null;

  return {
    control,
    errors,
    isSubmitting,
    handleSubmit,
    mode,
    onModeChange,
    modeLocked,
    relinkCount,
    invoices,
    invoiceOptions,
    chosen,
    reasons,
    reasonOptions,
    loading: invoicesLoading || setupLoading,
    loadError: invoicesError ?? setupError,
    onInvoiceChange,
    onReasonChange,
    ready,
    invoiceRef,
  };
}
