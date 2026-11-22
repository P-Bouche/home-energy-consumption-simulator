import { Box, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { fieldDiffLine, impactSummaryLine } from '../services/edit-impact.ts';
import type { AuditEntryJson, SimulationResultJson } from '../types.ts';

interface ImpactSummaryProps {
  /** the latest audit entry (the edit whose impact is summarized) */
  readonly entry: AuditEntryJson;
  /** the SimulationResult before the edit, null when there is no baseline */
  readonly before: SimulationResultJson | null;
  /** the SimulationResult after the re-run, null while none exists yet */
  readonly after: SimulationResultJson | null;
  /** true while the post-edit re-simulation is still running/queued */
  readonly pending: boolean;
}

/**
 * Impact of the last edit, right where it happened (UX audit F4 / US 4):
 * « Simulation relancée : −X kWh/an, étiquette D → C » computed from the
 * before/after SimulationResult, plus a plain-language value diff of what the
 * command changed (« U du mur wall-1 : 1,64 → 0,20 »). The raw audit trail
 * stays available separately as technical detail. Container-agnostic:
 * presentation only, all data comes from props (stores own the flow).
 */
export function ImpactSummary({ entry, before, after, pending }: Readonly<ImpactSummaryProps>) {
  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }} data-testid="impact-summary">
      <Typography variant="subtitle1">Impact du dernier changement</Typography>
      {pending || after === null ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} data-testid="impact-pending">
          Simulation relancée — calcul en cours…
        </Typography>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }} data-testid="impact-line">
            {impactSummaryLine(before, after)}
          </Typography>
        </Box>
      )}
      {entry.changes.length > 0 && (
        <List dense data-testid="impact-diff" sx={{ mt: 0.5 }}>
          {entry.changes.map((change) => (
            <ListItem key={change.field} disableGutters sx={{ py: 0 }}>
              <ListItemText primary={fieldDiffLine(entry.command, change)} />
            </ListItem>
          ))}
        </List>
      )}
    </Paper>
  );
}
