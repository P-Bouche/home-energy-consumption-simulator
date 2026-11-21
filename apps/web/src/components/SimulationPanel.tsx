import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Paper,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useSimulationStore } from '../store/simulation-store.ts';

/**
 * Simulation panel of the Synthèse tab (P2, FR-P2-04). Presentation only:
 * the primary « Lancer la simulation » action and the run status live in the
 * workspace header (WorkspaceShell), and the latest result summary renders at
 * the top of the Synthèse tab (SynthesePanel). What remains here is the
 * technical detail, behind expanders: the history and the raw engine JSON
 * (opt-in). The simulation store owns the flow (run / poll / history).
 */
export function SimulationPanel({ buildingId }: { readonly buildingId: string }) {
  const status = useSimulationStore((s) => s.status);
  const result = useSimulationStore((s) => s.result);
  const history = useSimulationStore((s) => s.history);

  return (
    <Paper sx={{ p: 3, mt: 3 }} data-testid="simulation-panel">
      <Typography variant="h6" component="h2">
        Simulation énergétique (Open3CL)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Bâtiment <code data-testid="building-id">{buildingId}</code> · action « Lancer la simulation » dans
        l&apos;en-tête de l&apos;espace de travail
      </Typography>
      {status === 'done' && result !== null && (
        <Accordion sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />} data-testid="toggle-raw">
            <Typography variant="body2">Voir la sortie brute du moteur</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Paper variant="outlined" sx={{ p: 1, maxHeight: 260, overflow: 'auto' }}>
              <pre data-testid="raw-output" style={{ margin: 0, fontSize: 11 }}>
                {JSON.stringify(result.rawEngineOutput, null, 2)}
              </pre>
            </Paper>
          </AccordionDetails>
        </Accordion>
      )}
      {history.length > 0 && (
        <Accordion sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" data-testid="simulation-history">
              Historique ({history.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {history.map((item) => (
              <Typography key={item.id} variant="body2" color="text.secondary">
                {new Date(item.createdAt).toLocaleString('fr-FR')} — étiquette {item.energyLabel}/{' '}
                {item.climateLabel}, {item.consumptionKwhM2An ?? '—'} kWh/m².an
              </Typography>
            ))}
          </AccordionDetails>
        </Accordion>
      )}
    </Paper>
  );
}
