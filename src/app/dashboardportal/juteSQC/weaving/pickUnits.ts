// R-08-21: the SQC crew measures picks per decimetre (picks/dm); the stored
// value and the downstream efficiency formula use picks per inch (PPI).
// 1 inch = 0.254 dm, so PPI = picks_dm × 0.254.
export const PICKS_DM_TO_PPI = 0.254;

export const dmToPpi = (picksDm: number): number => picksDm * PICKS_DM_TO_PPI;

// Legacy rows (saved before picks_dm existed) only carry PPI — derive dm client-side.
export const ppiToDm = (ppi: number): number => ppi / PICKS_DM_TO_PPI;
