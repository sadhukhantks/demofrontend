/**
 * Mount points of the tabs FE-2 builds. page.tsx imports only from here; each
 * file is a placeholder until FE-2 replaces it in place (same export names,
 * props in ./types.ts).
 */

export { default as DispatchTab } from "./DispatchTab";
export { default as ReportsTab } from "./ReportsTab";
export { default as TemplatesTab } from "./TemplatesTab";
export { default as SettingsTab } from "./SettingsTab";
export { default as ExportWatchlistButton } from "./ExportWatchlistButton";
export type { ExportWatchlistButtonProps, LaNotifySeverity, LaTabProps } from "./types";
