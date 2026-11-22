import { Box, Typography } from '@mui/material';

/**
 * Human display name of a building (UX audit F8 / US 11, issue #27): derived
 * from the DPE number carried by the import report, e.g. `DPE 2238E0097309E`.
 * Falls back to a neutral name when the DPE has no number.
 *
 * @param dpeNumber the DPE number from the import report, if any
 * @returns the human label shown in headers and alerts
 */
export function buildingDisplayName(dpeNumber: string | null): string {
  return dpeNumber !== null && dpeNumber.trim() !== '' ? `DPE ${dpeNumber}` : 'bâtiment importé';
}

/**
 * Human label for a building: the DPE number as primary text, with the raw
 * building id kept as secondary monospace detail — the UUID is never the
 * first thing a homeowner reads (UX audit US 11). Container-agnostic: renders
 * inline inside alerts, headers or typography.
 */
export function BuildingLabel({
  buildingId,
  dpeNumber
}: Readonly<{ buildingId: string; dpeNumber: string | null }>) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
      <Typography component="span" variant="body1" sx={{ fontWeight: 600 }} data-testid="building-label">
        {buildingDisplayName(dpeNumber)}
      </Typography>
      <Typography
        component="code"
        variant="caption"
        data-testid="building-id-detail"
        sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: 'text.secondary' }}
      >
        {buildingId}
      </Typography>
    </Box>
  );
}
