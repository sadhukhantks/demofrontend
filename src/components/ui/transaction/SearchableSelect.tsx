/**
 * @deprecated Import from `@/components/ui/SearchableSelect` instead.
 *
 * The searchable dropdown is no longer transaction-specific — it is the
 * canonical dropdown for every dashboard. This module re-exports the canonical
 * component so existing `@/components/ui/transaction` imports keep working.
 */
export {
  SearchableSelect,
  SearchableMultiSelect,
  type SearchableSelectProps,
  type SearchableMultiSelectProps,
  type SearchableSelectVariant,
} from "@/components/ui/SearchableSelect";
