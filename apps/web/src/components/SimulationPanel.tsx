import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Typography
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import { useSimulationStore } from '../store/simulation-store.ts';
import type { SimulationResultJson } from '../types.ts';

const LABEL_COLORS: Record<string, string> = {
  A: '#1a9850',
  B: '#66bd63',
  C: '#a6d96a',
  D: '#fee08b',
  E: '#fdae61',
  F: '#f46d43',
  G: '#d73027'
};

function labelChip(label: string, kind: 'Énergie' | 'Climat'): React.ReactElement {
  return (
    <Chip
      label={`${kind} : ${label}`}
      data-testid={kind === 'Énergie' ? 'energy-label' : 'climate-label'}
      sx={{ backgroundColor: LABEL_COLORS[label] ?? '#999', color: '#111', fontWeight: 700 }}
    />
  );
}

function ResultFigures({ result }: { readonly result: SimulationResultJson }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <Box data-testid="simulation-result">
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        {labelChip(result.energyLabel, 'Énergie')}
        {labelChip(result.climateLabel, 'Climat')}
        {result.consumptionKwhM2An !== null && (
          <Chip label={`${result.consumptionKwhM2An} kWh/m².an`} data-testid="consumption-m2" variant="outlined" />
        )}
        {result.emissionsKgCo2M2An !== null && (
          <Chip label={`${result.emissionsKgCo2M2An} kg CO₂/m².an`} data-testid="emissions-m2" variant="outlined" />
        )}
      </Box>
      <Typography variant="body2" sx={{ mt: 1 }} data-testid="simulation-detail">
        {result.consumptionKwh.toLocaleString('fr-FR')} kWh (5 usages) ·{' '}
        {result.emissionsKg.toLocaleString('fr-FR')} kg CO₂e · moteur Open3CL v{result.engineVersion} ·{' '}
        {new Date(result.createdAt).toLocaleString('fr-FR')}
      </Typography>
      <Button size="small" onClick={() => setShowRaw((v) => !v)} data-testid="toggle-raw" sx={{ mt: 1 }}>
        {showRaw ? 'Masquer la sortie brute du moteur' : 'Voir la sortie brute du moteur'}
      </Button>
      {showRaw && (
        <Paper variant="outlined" sx={{ mt: 1, p: 1, maxHeight: 260, overflow: 'auto' }}>
          <pre data-testid="raw-output" style={{ margin: 0, fontSize: 11 }}>
            {JSON.stringify(result.rawEngineOutput, null, 2)}
          </pre>
        </Paper>
      )}
    </Box>
  );
}

/**
 * "Run simulation" button + results panel (P2, FR-P2-04). Presentation only:
 * the simulation store owns the flow (run / poll / history).
 */
export function SimulationPanel({ buildingId }: { readonly buildingId: string }) {
  const status = useSimulationStore((s) => s.status);
  const result = useSimulationStore((s) => s.result);
  const job = useSimulationStore((s) => s.job);
  const history = useSimulationStore((s) => s.history);
  const cached = useSimulationStore((s) => s.cached);
  const error = useSimulationStore((s) => s.error);
  const run = useSimulationStore((s) => s.run);

  return (
    <Paper sx={{ p: 3, mt: 3 }} data-testid="simulation-panel">
      <Typography variant="h6" component="h2">
        Simulation énergétique (Open3CL)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Bâtiment <code data-testid="building-id">{buildingId}</code>
      </Typography>
      <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<BoltIcon />}
          onClick={() => void run(buildingId)}
          disabled={status === 'running' || status === 'queued'}
          data-testid="run-simulation"
        >
          Lancer la simulation
        </Button>
        {cached && (
          <Chip color="success" label="résultat servi depuis le cache (moteur non rappelé)" data-testid="cached-badge" />
        )}
      </Box>
      {(status === 'running' || status === 'queued') && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1 }} data-testid="job-status">
            {status === 'queued' ? `job ${job?.status ?? 'queued'}…` : 'simulation en cours…'}
          </Typography>
        </Box>
      )}
      {status === 'error' && (
        <Alert severity="error" sx={{ mt: 2 }} data-testid="simulation-error">
          {error}
        </Alert>
      )}
      {status === 'done' && result !== null && (
        <>
          <Divider sx={{ my: 2 }} />
          <ResultFigures result={result} />
        </>
      )}
      {history.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" data-testid="simulation-history">
            Historique ({history.length})
          </Typography>
          {history.map((item) => (
            <Typography key={item.id} variant="body2" color="text.secondary">
              {new Date(item.createdAt).toLocaleString('fr-FR')} — étiquette {item.energyLabel}/{' '}
              {item.climateLabel}, {item.consumptionKwhM2An ?? '—'} kWh/m².an
            </Typography>
          ))}
        </>
      )}
    </Paper>
  );
}
